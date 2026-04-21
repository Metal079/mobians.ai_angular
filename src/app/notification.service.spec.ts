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

    http = {
      get: (..._args: unknown[]) => of({}),
      post: (...args: unknown[]) => {
        const [url, body] = args as [string, unknown];
        postCalls.push({ url, body });
        return of({});
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
        },
      },
    ]);
  });
});
