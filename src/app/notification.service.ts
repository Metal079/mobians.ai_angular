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
      if (subscription) {
        this.sendSubscriptionToServer(subscription);
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

  playDing() {
    const ding = new Audio('/assets/ding.mp3');
    ding.volume = 0.5;
    ding.play();
  }

  private sendSubscriptionToServer(subscription: PushSubscription) {
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

    this.http.post(`${this.apiBaseUrl}/subscribe`, data).subscribe({
      next: response => console.log('Subscription sent to server:', response),
      error: error => console.error('Error sending subscription to server:', error)
    });
  }

  subscribeToNotifications() {
    if (!this.swPush.isEnabled) {
      console.warn('Push notifications are unavailable in this build. Use the local push build or a production-like build so the service worker can register.');
      return;
    }

    this.swPush.requestSubscription({
      serverPublicKey: this.VAPID_PUBLIC_KEY
    })
      .then(subscription => this.sendSubscriptionToServer(subscription))
      .catch(err => console.error("Could not subscribe to notifications", err));
  }

  /**
   * Fully unsubscribe this browser from Web Push and delete the DB row so the
   * backend stops targeting it. Safe to call when there's no active subscription.
   */
  async unsubscribeFromNotifications(): Promise<void> {
    if (!this.swPush.isEnabled) {
      return;
    }

    try {
      const subscription = await firstValueFrom(this.swPush.subscription);
      const endpoint = subscription?.endpoint;
      // Tell the browser to drop the push subscription first so the server
      // can't deliver anything in the window before the DB row is gone.
      await this.swPush.unsubscribe().catch(() => { /* no-op if already gone */ });
      if (endpoint) {
        this.http.post(`${this.apiBaseUrl}/unsubscribe`, { endpoint }).subscribe({
          next: () => console.log('Push subscription removed from server'),
          error: err => console.error('Error removing push subscription:', err)
        });
      }
    } catch (err) {
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
