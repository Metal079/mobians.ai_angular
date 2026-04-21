import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  readonly VAPID_PUBLIC_KEY = environment.vapidPublicKey;
  private static readonly USER_ID_STORAGE_KEY = 'notifications-user-id';
  private static readonly VAPID_PUBLIC_KEY_STORAGE_KEY = 'notifications-vapid-public-key';
  public userId: string;
  private readonly apiBaseUrl = environment.apiBaseUrl;

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

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    const subscriptionJson = subscription.toJSON();
    const keys = subscriptionJson.keys;
    if (!subscription.endpoint || !keys?.['p256dh'] || !keys['auth']) {
      return;
    }

    const data = {
      userId: this.userId,
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      keys,
    };

    try {
      const response = await firstValueFrom(this.http.post(`${this.apiBaseUrl}/subscribe`, data));
      this.storeCurrentVapidPublicKey();
      console.log('Subscription sent to server:', response);
    } catch (error) {
      console.error('Error sending subscription to server:', error);
    }
  }

  private async removeSubscriptionFromServer(endpoint: string): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.apiBaseUrl}/unsubscribe`, { endpoint }));
      console.log('Push subscription removed from server');
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

  async subscribeToNotifications(): Promise<void> {
    if (!this.swPush.isEnabled) {
      console.warn('Push notifications are unavailable in this build. Use the local push build or a production-like build so the service worker can register.');
      return;
    }

    const existingSubscription = await firstValueFrom(this.swPush.subscription);

    if (existingSubscription && this.hasCurrentVapidPublicKey()) {
      await this.sendSubscriptionToServer(existingSubscription);
      return;
    }

    if (existingSubscription) {
      await this.removeExistingSubscription(existingSubscription);
    }

    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: this.VAPID_PUBLIC_KEY
      });
      await this.sendSubscriptionToServer(subscription);
    } catch (err) {
      console.error('Could not subscribe to notifications', err);
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

  sendPushNotification() {
    // When the user is signed in, the backend sends a server-initiated push
    // the moment the job row flips to completed/failed (see
    // job_completion_notifier_task). Firing a second one from the tab would
    // cause duplicate notifications, so we skip it here.
    if (this.isAuthenticated()) {
      return;
    }
    const userId = this.userId; // Use the user ID generated earlier
    this.http.get(`${this.apiBaseUrl}/send_notification/${userId}`).subscribe(response => {
      console.log('Push notification sent:', response);
    }, error => {
      console.error('Error sending push notification:', error);
    });
  }

  private isAuthenticated(): boolean {
    try {
      return !!localStorage.getItem('authToken');
    } catch {
      return false;
    }
  }

}
