import { Injectable, signal } from '@angular/core';
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

  /** Whether the person switched notifications on for this device (the Options checkbox and the wait screen share it). */
  readonly enabled = signal(this.readEnabled());
  /** The switches the server holds for this device; null until it has answered or when not subscribed. */
  readonly preferences = signal<PushPreferences | null>(null);
  /** Set when the person tapped a reminder or news notification while the site was open: the opt-out bar shows for it. */
  readonly openedFrom = signal<MutableCategory | null>(null);

  constructor(private http: HttpClient, private swPush: SwPush) {
    // Persist the anonymous id across reloads so the backend can keep
    // targeting the same browser until the user logs in (at which point
    // the subscription gets linked to their user_id server-side).
    this.userId = this.loadOrCreateUserId();

    // If this browser already granted push permission in a previous session,
    // re-POST the existing subscription so the backend (re)links it to the
    // current auth context. The auth interceptor attaches the Bearer token
    // automatically, so a logged-in user ends up with user_id attached to
    // their subscription — which is what enables LoRA-ready notifications.
    if (!this.swPush.isEnabled) {
      return;
    }

    this.swPush.subscription.subscribe(subscription => {
      if (subscription && this.hasCurrentVapidPublicKey()) {
        void this.sendSubscriptionToServer(subscription);
      }
    });

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

  /** False where the browser or this build cannot do web push at all. */
  get supported(): boolean {
    return this.swPush.isEnabled;
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
    if (!this.swPush.isEnabled) return false;
    try {
      const subscription = await firstValueFrom(this.swPush.subscription);
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
    if (!this.swPush.isEnabled) return;
    try {
      const subscription = await firstValueFrom(this.swPush.subscription);
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

    await this.swPush.unsubscribe().catch(() => { /* no-op if already gone */ });
    this.clearStoredVapidPublicKey();

    if (endpoint) {
      await this.removeSubscriptionFromServer(endpoint);
    }
  }

  /** Subscribe this browser (asking for permission if needed). Returns whether it is subscribed afterwards. */
  async subscribeToNotifications(preferences?: Partial<PushPreferences>): Promise<boolean> {
    if (!this.swPush.isEnabled) {
      console.warn('Push notifications are unavailable in this build. Use the local push build or a production-like build so the service worker can register.');
      return false;
    }

    const existingSubscription = await firstValueFrom(this.swPush.subscription);

    if (existingSubscription && this.hasCurrentVapidPublicKey()) {
      return this.sendSubscriptionToServer(existingSubscription, preferences);
    }

    if (existingSubscription) {
      await this.removeExistingSubscription(existingSubscription);
    }

    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: this.VAPID_PUBLIC_KEY
      });
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
    if (!this.swPush.isEnabled) {
      this.clearStoredVapidPublicKey();
      return;
    }

    try {
      const subscription = await firstValueFrom(this.swPush.subscription);
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
