/// <reference types="jasmine" />

import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { Observable, of } from 'rxjs';

import { NotificationService } from './notification.service';
import { environment } from '../environments/environment';

describe('NotificationService', () => {
  let service: NotificationService;
  let http: {
    get: (...args: unknown[]) => Observable<unknown>;
    post: (...args: unknown[]) => Observable<unknown>;
  };
  let swPush: {
    isEnabled: boolean;
    subscription: Observable<PushSubscription | null>;
    requestSubscription: (options: { serverPublicKey: string }) => Promise<PushSubscription>;
    unsubscribe: () => Promise<void>;
  };
  let postCalls: Array<{ url: string; body: unknown }>;
  let requestSubscriptionCalls: Array<{ serverPublicKey: string }>;
  let unsubscribeCallCount: number;
  let requestSubscriptionResult: PushSubscription | null;

  const userId = 'test-user-id';
  const vapidStorageKey = 'notifications-vapid-public-key';
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let postResponse: unknown;

  function createSubscription(endpoint: string): PushSubscription {
    return {
      endpoint,
      expirationTime: null,
      getKey: () => null,
      options: {} as PushSubscriptionOptions,
      toJSON: () => ({
        endpoint,
        expirationTime: null,
        keys: {
          p256dh: 'test-p256dh',
          auth: 'test-auth',
        },
      }),
      unsubscribe: async () => true,
    } as unknown as PushSubscription;
  }

  function setupService(subscription: PushSubscription | null): void {
    TestBed.resetTestingModule();

    postCalls = [];
    requestSubscriptionCalls = [];
    unsubscribeCallCount = 0;
    requestSubscriptionResult = null;
    postResponse = {};

    http = {
      get: (..._args: unknown[]) => of({}),
      post: (...args: unknown[]) => {
        const [url, body] = args as [string, unknown];
        postCalls.push({ url, body });
        return of(postResponse);
      },
    };

    swPush = {
      isEnabled: true,
      subscription: of(subscription),
      requestSubscription: async (options: { serverPublicKey: string }) => {
        requestSubscriptionCalls.push(options);
        if (!requestSubscriptionResult) {
          throw new Error('No mock subscription configured');
        }
        return requestSubscriptionResult;
      },
      unsubscribe: async () => {
        unsubscribeCallCount += 1;
      },
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: SwPush, useValue: swPush }
      ]
    });

    service = TestBed.inject(NotificationService);
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('notifications-user-id', userId);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    setupService(null);
    expect(service).toBeTruthy();
  });

  it('does not repost a stale subscription from the constructor when the VAPID key changed', () => {
    localStorage.setItem(vapidStorageKey, 'old-vapid-key');

    setupService(createSubscription('https://fcm.googleapis.com/fcm/send/stale'));

    expect(postCalls).toEqual([]);
  });

  it('recreates the subscription when the stored VAPID key changed', async () => {
    const staleSubscription = createSubscription('https://fcm.googleapis.com/fcm/send/stale');
    const freshSubscription = createSubscription('https://fcm.googleapis.com/fcm/send/fresh');

    localStorage.setItem(vapidStorageKey, 'old-vapid-key');
    setupService(staleSubscription);
    requestSubscriptionResult = freshSubscription;

    await service.subscribeToNotifications();

    expect(unsubscribeCallCount).toBe(1);
    expect(requestSubscriptionCalls).toEqual([{
      serverPublicKey: environment.vapidPublicKey,
    }]);
    expect(postCalls).toEqual([
      {
        url: `${environment.apiBaseUrl}/unsubscribe`,
        body: { endpoint: staleSubscription.endpoint },
      },
      {
        url: `${environment.apiBaseUrl}/subscribe`,
        body: {
          userId,
          endpoint: freshSubscription.endpoint,
          expirationTime: null,
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
          timezone: deviceTimeZone,
        },
      },
    ]);
    expect(localStorage.getItem(vapidStorageKey)).toBe(environment.vapidPublicKey);
  });

  it('reuses the current subscription when the stored VAPID key already matches', async () => {
    const currentSubscription = createSubscription('https://fcm.googleapis.com/fcm/send/current');

    localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
    setupService(currentSubscription);
    postCalls = [];

    await service.subscribeToNotifications();

    expect(unsubscribeCallCount).toBe(0);
    expect(requestSubscriptionCalls).toEqual([]);
    expect(postCalls).toEqual([
      {
        url: `${environment.apiBaseUrl}/subscribe`,
        body: {
          userId,
          endpoint: currentSubscription.endpoint,
          expirationTime: null,
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
          timezone: deviceTimeZone,
        },
      },
    ]);
  });

  describe('switches for this device', () => {
    const current = () => createSubscription('https://fcm.googleapis.com/fcm/send/current');
    const lastBody = () => postCalls[postCalls.length - 1].body as any;

    it('turning notifications on sends the choices the person just made, and remembers it is on', async () => {
      setupService(null);
      requestSubscriptionResult = current();
      postResponse = { preferences: { jobs: true, reminders: true, news: false } };
      expect(service.enabled()).toBeFalse();

      expect(await service.setEnabled(true, { jobs: true, reminders: true })).toBeTrue();

      expect(lastBody().preferences).toEqual({ jobs: true, reminders: true });
      expect(lastBody().timezone).toBe(deviceTimeZone);
      expect(service.enabled()).toBeTrue();
      expect(localStorage.getItem('notifications-enabled')).toBe('true');
      expect(service.preferences()).toEqual({ jobs: true, reminders: true, news: false });
    });

    it('an ordinary page load re-registers the device without sending any switches', () => {
      localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
      postResponse = { preferences: { jobs: true, reminders: false, news: true } };
      setupService(current());
      expect(postCalls.length).toBe(1);
      expect('preferences' in lastBody()).toBeFalse();
    });

    it('does not claim to be on when the browser refuses permission', async () => {
      setupService(null);                                   // requestSubscription will throw
      spyOn(console, 'error');
      expect(await service.setEnabled(true)).toBeFalse();
      expect(service.enabled()).toBeFalse();
      expect(localStorage.getItem('notifications-enabled')).toBe('false');
    });

    it('turning notifications off unsubscribes the device and forgets its switches', async () => {
      localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
      localStorage.setItem('notifications-enabled', 'true');
      setupService(current());
      expect(service.enabled()).toBeTrue();
      await service.setEnabled(false);
      expect(unsubscribeCallCount).toBe(1);
      expect(postCalls.map(call => call.url)).toContain(`${environment.apiBaseUrl}/unsubscribe`);
      expect(service.enabled()).toBeFalse();
      expect(service.preferences()).toBeNull();
    });

    it('changes one switch by naming this device, and shows what the server now holds', async () => {
      setupService(current());
      postResponse = { status: 'ok', preferences: { jobs: true, reminders: false, news: true } };
      expect(await service.setPreferences({ news: true })).toBeTrue();
      expect(postCalls[postCalls.length - 1]).toEqual({
        url: `${environment.apiBaseUrl}/push/preferences`,
        body: { endpoint: 'https://fcm.googleapis.com/fcm/send/current', news: true, timezone: deviceTimeZone },
      });
      expect(service.preferences()).toEqual({ jobs: true, reminders: false, news: true });
    });

    it('cannot change switches on a device that is not subscribed', async () => {
      setupService(null);
      expect(await service.setPreferences({ news: true })).toBeFalse();
      expect(postCalls).toEqual([]);
    });

    it('signing out detaches the device from the account and switches its reminders off', async () => {
      setupService(current());
      postResponse = { preferences: { jobs: true, reminders: true, news: true } };
      await service.setPreferences({});
      postCalls = [];
      await service.detachFromAccount();
      expect(postCalls).toEqual([{ url: `${environment.apiBaseUrl}/push/detach`, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/current' } }]);
      expect(service.preferences()).toEqual({ jobs: true, reminders: false, news: true });
    });

    it('no longer asks the server to push from the page when a job finishes', () => {
      setupService(current());
      const get = spyOn(http, 'get').and.callThrough();
      postCalls = [];
      service.sendPushNotification();
      expect(get).not.toHaveBeenCalled();
      expect(postCalls).toEqual([]);
    });
  });
});
