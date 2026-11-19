import { Injectable, NgZone, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { environment } from '../environments/environment';
import { trackEvent } from './analytics';

/**
 * What this device has agreed to be pushed. `jobs` is "your image is ready";
 * `reminders` is the once-a-day bonus reminder; `news` is a "What's new" post an
 * admin chose to push. The backend keeps these per device
 * (push_preferences.py) and every reminder or news push carries its own
 * "Turn off" button.
 *
 * Taps are handled by Angular's service worker, which does what the
 * notification itself says (`data.onActionClick`, written by the backend): a
 * tap brings the site forward, "Turn off" asks the API to stop that kind for
 * this device. It then tells any open tab what was tapped, which is what
 * `openedFrom` and the switch update below listen to.
 */
export interface PushPreferences {
  jobs: boolean;
  reminders: boolean;
  news: boolean;
}

export type MutableCategory = 'reminders' | 'news';

interface SubscribeResponse {
  preferences?: PushPreferences | null;
}

/**
 * This browser's push subscription for the site, asked of the browser itself.
 *
 * Angular's SwPush only answers once its service worker controls the page, and a
 * page opened with a hard refresh (Ctrl+Shift+R, Ctrl+F5) is never controlled.
 * SwPush then waited forever: the Account panel showed guesses instead of the
 * device's switches, the first click greyed them all out with nothing saved, and
 * Logout did nothing (reported 2026-11-18). `navigator.serviceWorker.ready`
 * answers whether or not the worker controls the page.
 */
@Injectable({ providedIn: 'root' })
export class PushDevice {
  /** Long enough for a first visit, where Angular registers the worker up to 30 s after the page starts (app.config.ts). */
  private static readonly READY_TIMEOUT_MS = 40_000;
  private readonly zone = inject(NgZone);

  /** The browser can receive web push here. iPhone Safari has service workers, but push only in a Home Screen app. */
  get available(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof PushManager !== 'undefined';
  }

  async subscription(): Promise<PushSubscription | null> {
    return (await this.pushManager()).getSubscription();
  }

  async subscribe(serverPublicKey: string): Promise<PushSubscription> {
    return (await this.pushManager()).subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(serverPublicKey) });
  }

  private async pushManager(): Promise<PushManager> {
    const registration = await this.ready();
    if (!registration.pushManager) throw new Error('This browser cannot receive push notifications.');
    return registration.pushManager;
  }

  private ready(): Promise<ServiceWorkerRegistration> {
    return new Promise((resolve, reject) => {
      // Outside Angular's zone, so the wait does not hold up "registerWhenStable" for the worker itself.
      const timer = this.zone.runOutsideAngular(() =>
        setTimeout(() => reject(new Error('The service worker did not start.')), PushDevice.READY_TIMEOUT_MS));
      navigator.serviceWorker.ready.then(
        registration => { clearTimeout(timer); resolve(registration); },
        error => { clearTimeout(timer); reject(error); });
    });
  }
}

/**
 * iPhone and iPad allow web push only in a site added to the Home Screen (iOS 16.4 and later, using the
 * manifest's "display": "standalone"), never in a Safari tab or an app's built-in browser. True in such a tab,
 * so the Account panel can say how to get notifications instead of offering a button that cannot work.
 * iPadOS asks for desktop sites by default and then names itself "Macintosh"; touch gives it away.
 */
export function pushNeedsHomeScreen(device: { userAgent: string; maxTouchPoints: number; standalone: boolean; pushAvailable: boolean }): boolean {
  if (device.pushAvailable || device.standalone) return false;
  const apple = /iPhone|iPad|iPod/.test(device.userAgent) || (/Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1);
  if (!apple) return false;
  const version = /OS (\d+)_(\d+)/.exec(device.userAgent) ?? /Version\/(\d+)\.(\d+)/.exec(device.userAgent);
  if (!version) return true;
  const [major, minor] = [Number(version[1]), Number(version[2])];
  return major > 16 || (major === 16 && minor >= 4);    // older iOS has no web push even from the Home Screen
}

/** Opened from the Home Screen (or as an installed app) rather than in a browser tab. */
function openedAsApp(): boolean {
  try {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** A VAPID public key as the push service wants it (the same conversion SwPush.requestSubscription does). */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  readonly VAPID_PUBLIC_KEY = environment.vapidPublicKey;
  private static readonly USER_ID_STORAGE_KEY = 'notifications-user-id';
  private static readonly VAPID_PUBLIC_KEY_STORAGE_KEY = 'notifications-vapid-public-key';
  private static readonly ENABLED_STORAGE_KEY = 'notifications-enabled';
  public userId: string;
  private readonly apiBaseUrl = environment.apiBaseUrl;

  /** Whether the person switched notifications on for this device (Account panel, the wait screen's "Notify me", What's new). */
  readonly enabled = signal(this.readEnabled());
  /** The switches the server holds for this device; null until it has answered or when not subscribed. */
  readonly preferences = signal<PushPreferences | null>(null);
  /** Set when the person tapped a reminder or news notification while the site was open: the opt-out bar shows for it. */
  readonly openedFrom = signal<MutableCategory | null>(null);

  constructor(private http: HttpClient, private swPush: SwPush, private pushDevice: PushDevice) {
    // Persist the anonymous id across reloads so the backend can keep
    // targeting the same browser until the user logs in (at which point
    // the subscription gets linked to their user_id server-side).
    this.userId = this.loadOrCreateUserId();

    if (!this.supported) {
      return;
    }

    void this.startUp();

    this.swPush.notificationClicks.subscribe(({ action, notification }) => {
      const category = notification?.data?.category;
      if (category !== 'reminders' && category !== 'news') return;
      if (action === 'mute') {
        // "Turn off" was pressed on the notification: the API has switched it off; show that here too.
        const current = this.preferences();
        if (current) void this.adoptPreferences({ ...current, [category]: false });
      } else {
        this.openedFrom.set(category);
      }
    });
  }

  /** False where the browser or this build cannot do web push at all (the switches are then not shown). */
  get supported(): boolean {
    return this.swPush.isEnabled && this.pushDevice.available;
  }

  /** An iPhone or iPad browser tab: notifications are possible once the site is added to the Home Screen. */
  get needsHomeScreen(): boolean {
    if (typeof navigator === 'undefined') return false;
    return pushNeedsHomeScreen({
      userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0, standalone: openedAsApp(), pushAvailable: this.supported,
    });
  }

  /** The person blocked notifications for this site in the browser; only they can undo that, in browser settings. */
  get blockedByBrowser(): boolean {
    return typeof Notification !== 'undefined' && Notification.permission === 'denied';
  }

  /**
   * What a device gets when the person turns notifications on: finished jobs and
   * news about new features (rare: an admin decides, at most one push in 72
   * hours, each with its own "Turn off" button). The daily-bonus reminder stays
   * off until asked for. Devices that were subscribed before are not changed.
   */
  static readonly ON_WHEN_TURNED_ON: Partial<PushPreferences> = { jobs: true, news: true };

  /**
   * Switch notifications on or off for this device. Turning them on asks the
   * browser for permission if needed and starts the device with
   * ON_WHEN_TURNED_ON plus whatever else the person just chose in `preferences`.
   * Returns whether the device ends up subscribed.
   */
  async setEnabled(on: boolean, preferences?: Partial<PushPreferences>): Promise<boolean> {
    this.enabled.set(on);
    this.storeEnabled(on);
    if (!on) {
      await this.unsubscribeFromNotifications();
      this.preferences.set(null);
      return false;
    }
    const subscribed = await this.subscribeToNotifications({ ...NotificationService.ON_WHEN_TURNED_ON, ...preferences });
    if (!subscribed) {
      // Permission refused or unsupported: do not pretend it is on.
      this.enabled.set(false);
      this.storeEnabled(false);
    }
    return subscribed;
  }

  /** Finished images and videos are switched on for this device (assumed on until the server has answered). */
  jobsOn(): boolean {
    return this.enabled() && (this.preferences()?.jobs ?? true);
  }

  /**
   * On every visit. A subscribed device is re-posted without any switches: the
   * backend (re)links it to whoever is signed in now (the auth interceptor adds
   * the token, which is what enables LoRA-ready notifications) and answers with
   * its switches, which stay as the person left them. A device switched on here
   * whose subscription the browser dropped, or that was made with an old server
   * key, is subscribed again (a new subscription gets the server's defaults:
   * finished jobs and news on, reminders off).
   */
  private async startUp(): Promise<void> {
    // As the page found it: a "Turn on" pressed while this waits subscribes by itself, with the person's choices.
    const switchedOnBefore = this.enabled();
    let existing: PushSubscription | null;
    try {
      existing = await this.pushDevice.subscription();
    } catch (error) {
      console.error('Could not read the push subscription:', error);
      return;                                   // change nothing; the next visit tries again
    }
    if (existing && this.hasCurrentVapidPublicKey()) {
      await this.sendSubscriptionToServer(existing);
    } else if (switchedOnBefore && this.enabled() && !await this.subscribeToNotifications()) {
      this.enabled.set(false);
      this.storeEnabled(false);
    }
  }

  /**
   * Take in the switches this device now has. There is no separate "turn all
   * off": a device with nothing switched on is simply off, so when the last
   * switch goes, the browser is unsubscribed and its row deleted.
   */
  private async adoptPreferences(preferences: PushPreferences): Promise<void> {
    this.preferences.set(preferences);
    if (!preferences.jobs && !preferences.reminders && !preferences.news) {
      await this.setEnabled(false);
    }
  }

  /**
   * Change one or more switches on this device. Returns false if the device is
   * not subscribed or the call failed. Switching the last one off turns
   * notifications off for the device (`enabled` becomes false).
   */
  async setPreferences(changes: Partial<PushPreferences>): Promise<boolean> {
    if (!this.supported) return false;
    try {
      const subscription = await this.pushDevice.subscription();
      if (!subscription?.endpoint) return false;
      const response = await firstValueFrom(this.http.post<SubscribeResponse>(`${this.apiBaseUrl}/push/preferences`, {
        endpoint: subscription.endpoint, ...changes, timezone: this.timeZone()
      }));
      if (response?.preferences) await this.adoptPreferences(response.preferences);
      return true;
    } catch (error) {
      console.error('Error changing notification preferences:', error);
      return false;
    }
  }

  /** On sign-out: this device stops receiving the account's notifications. */
  async detachFromAccount(): Promise<void> {
    if (!this.supported) return;
    try {
      const subscription = await this.pushDevice.subscription();
      if (!subscription?.endpoint) return;
      await firstValueFrom(this.http.post(`${this.apiBaseUrl}/push/detach`, { endpoint: subscription.endpoint }));
      const current = this.preferences();
      if (current) await this.adoptPreferences({ ...current, reminders: false });
    } catch (error) {
      console.error('Error detaching push subscription:', error);
    }
  }

  private readEnabled(): boolean {
    try {
      return localStorage.getItem(NotificationService.ENABLED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private storeEnabled(on: boolean): void {
    try {
      localStorage.setItem(NotificationService.ENABLED_STORAGE_KEY, String(on));
    } catch {
      // Storage unavailable: the choice lasts until the page is closed.
    }
  }

  private timeZone(): string | undefined {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      return undefined;
    }
  }

  private loadOrCreateUserId(): string {
    try {
      const existing = localStorage.getItem(NotificationService.USER_ID_STORAGE_KEY);
      if (existing) return existing;
      const created = uuidv4();
      localStorage.setItem(NotificationService.USER_ID_STORAGE_KEY, created);
      return created;
    } catch {
      return uuidv4();
    }
  }

  private getStoredVapidPublicKey(): string | null {
    try {
      return localStorage.getItem(NotificationService.VAPID_PUBLIC_KEY_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private hasCurrentVapidPublicKey(): boolean {
    return this.getStoredVapidPublicKey() === this.VAPID_PUBLIC_KEY;
  }

  private storeCurrentVapidPublicKey(): void {
    try {
      localStorage.setItem(NotificationService.VAPID_PUBLIC_KEY_STORAGE_KEY, this.VAPID_PUBLIC_KEY);
    } catch {
      // Ignore storage failures and fall back to explicit resubscribe.
    }
  }

  private clearStoredVapidPublicKey(): void {
    try {
      localStorage.removeItem(NotificationService.VAPID_PUBLIC_KEY_STORAGE_KEY);
    } catch {
      // Ignore storage failures when clearing notification state.
    }
  }

  playDing() {
    const ding = new Audio('/assets/ding.mp3');
    ding.volume = 0.5;
    ding.play();
  }

  /**
   * Tell the backend about this device. `preferences` is only sent when the
   * person has just chosen them: this runs on every page load, and a plain
   * refresh must not change anyone's switches.
   */
  private async sendSubscriptionToServer(subscription: PushSubscription, preferences?: Partial<PushPreferences>): Promise<boolean> {
    const subscriptionJson = subscription.toJSON();
    const keys = subscriptionJson.keys;
    if (!subscription.endpoint || !keys?.['p256dh'] || !keys['auth']) {
      return false;
    }

    const data = {
      userId: this.userId,
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      keys,
      timezone: this.timeZone(),
      ...(preferences ? { preferences } : {}),
    };

    try {
      const response = await firstValueFrom(this.http.post<SubscribeResponse>(`${this.apiBaseUrl}/subscribe`, data));
      this.storeCurrentVapidPublicKey();
      if (response?.preferences) await this.adoptPreferences(response.preferences);
      return true;
    } catch (error) {
      console.error('Error sending subscription to server:', error);
      return false;
    }
  }

  private async removeSubscriptionFromServer(endpoint: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.apiBaseUrl}/unsubscribe`, { endpoint }));
    } catch (error) {
      console.error('Error removing push subscription:', error);
    }
  }

  private async removeExistingSubscription(subscription: PushSubscription | null): Promise<void> {
    const endpoint = subscription?.endpoint;

    await subscription?.unsubscribe().catch(() => false /* already gone */);
    this.clearStoredVapidPublicKey();

    if (endpoint) {
      await this.removeSubscriptionFromServer(endpoint);
    }
  }

  /** Subscribe this browser (asking for permission if needed). Returns whether it is subscribed afterwards. */
  async subscribeToNotifications(preferences?: Partial<PushPreferences>): Promise<boolean> {
    if (!this.supported) {
      console.warn('Push notifications are unavailable in this browser or build (a development build has no service worker; use the localpush or a production-like build).');
      return false;
    }

    try {
      const existingSubscription = await this.pushDevice.subscription();

      if (existingSubscription && this.hasCurrentVapidPublicKey()) {
        return await this.sendSubscriptionToServer(existingSubscription, preferences);
      }

      if (existingSubscription) {
        await this.removeExistingSubscription(existingSubscription);
      }

      const subscription = await this.pushDevice.subscribe(this.VAPID_PUBLIC_KEY);
      const sent = await this.sendSubscriptionToServer(subscription, preferences);
      if (sent) trackEvent('push_opt_in', { reminders: !!preferences?.reminders, news: !!preferences?.news });
      return sent;
    } catch (err) {
      console.error('Could not subscribe to notifications', err);
      return false;
    }
  }

  /**
   * Fully unsubscribe this browser from Web Push and delete the DB row so the
   * backend stops targeting it. Safe to call when there's no active subscription.
   */
  async unsubscribeFromNotifications(): Promise<void> {
    if (!this.supported) {
      this.clearStoredVapidPublicKey();
      return;
    }

    try {
      const subscription = await this.pushDevice.subscription();
      await this.removeExistingSubscription(subscription);
    } catch (err) {
      this.clearStoredVapidPublicKey();
      console.error('Error unsubscribing from notifications', err);
    }
  }

  /**
   * Kept for callers written before the server did this itself. Finished jobs are
   * now pushed by the backend for everyone, signed in or not (it finds a
   * no-account browser through the id sent with the job), which also works after
   * the tab is closed; pushing from the page as well would notify twice.
   */
  sendPushNotification(): void {}

}
