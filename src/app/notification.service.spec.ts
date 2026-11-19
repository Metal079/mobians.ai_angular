/// <reference types="jasmine" />

import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { Observable, Subject, of } from 'rxjs';

import { NotificationService, PushDevice, pushNeedsHomeScreen } from './notification.service';
import { environment } from '../environments/environment';

describe('NotificationService', () => {
  let service: NotificationService;
  let http: {
    get: (...args: unknown[]) => Observable<unknown>;
    post: (...args: unknown[]) => Observable<unknown>;
  };
  let swPush: {
    isEnabled: boolean;
    notificationClicks: Subject<{ action: string; notification: any }>;
  };
  /** The browser's push subscription, as PushDevice reports it (it does not wait for the worker to control the page). */
  let pushDevice: {
    available: boolean;
    subscription: () => Promise<PushSubscription | null>;
    subscribe: (serverPublicKey: string) => Promise<PushSubscription>;
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
      unsubscribe: async () => {
        unsubscribeCallCount += 1;
        return true;
      },
    } as unknown as PushSubscription;
  }

  /** Lets the service finish what it starts on its own when it is created (re-posting the device, re-subscribing). */
  const settle = () => new Promise(resolve => setTimeout(resolve));

  /**
   * `firstResponse` is what the server answers while the service starts up (it re-registers an existing device);
   * `device` replaces parts of the browser's push access, before the service is created.
   */
  function setupService(subscription: PushSubscription | null, firstResponse: unknown = {}, device: Partial<typeof pushDevice> = {}): void {
    TestBed.resetTestingModule();

    postCalls = [];
    requestSubscriptionCalls = [];
    unsubscribeCallCount = 0;
    requestSubscriptionResult = null;
    postResponse = firstResponse;

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
      notificationClicks: new Subject(),
    };

    pushDevice = {
      available: true,
      subscription: async () => subscription,
      subscribe: async (serverPublicKey: string) => {
        requestSubscriptionCalls.push({ serverPublicKey });
        if (!requestSubscriptionResult) {
          throw new Error('No mock subscription configured');
        }
        return requestSubscriptionResult;
      },
      ...device,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: SwPush, useValue: swPush },
        { provide: PushDevice, useValue: pushDevice },
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

  it('does not repost a stale subscription from the constructor when the VAPID key changed', async () => {
    localStorage.setItem(vapidStorageKey, 'old-vapid-key');

    setupService(createSubscription('https://fcm.googleapis.com/fcm/send/stale'));
    await settle();

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
    await settle();
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

  describe('taps reported by the service worker', () => {
    const tap = (action: string, category?: string) => swPush.notificationClicks.next({ action, notification: { title: 't', data: category ? { category } : undefined } });

    it('a tapped reminder or news notification asks for the opt-out bar; a finished-job one does not', () => {
      setupService(null);
      tap('', undefined);
      tap('', 'jobs');
      expect(service.openedFrom()).toBeNull();
      tap('', 'news');
      expect(service.openedFrom()).toBe('news');
      tap('default', 'reminders');
      expect(service.openedFrom()).toBe('reminders');
    });

    it('pressing Turn off on a notification shows as off in the open site, without asking for the bar', () => {
      setupService(null);
      service.preferences.set({ jobs: true, reminders: true, news: true });
      tap('mute', 'reminders');
      expect(service.preferences()).toEqual({ jobs: true, reminders: false, news: true });
      expect(service.openedFrom()).toBeNull();
    });

    it('pressing Turn off on the only kind that was on turns notifications off for the device', async () => {
      localStorage.setItem('notifications-enabled', 'true');
      setupService(null);
      service.preferences.set({ jobs: false, reminders: false, news: true });
      tap('mute', 'news');
      await new Promise(resolve => setTimeout(resolve));
      expect(service.enabled()).toBeFalse();
      expect(service.preferences()).toBeNull();
    });
  });

  describe('switches for this device', () => {
    const current = () => createSubscription('https://fcm.googleapis.com/fcm/send/current');
    const lastBody = () => postCalls[postCalls.length - 1].body as any;

    it('turning notifications on sends the choices the person just made, and remembers it is on', async () => {
      setupService(null);
      requestSubscriptionResult = current();
      postResponse = { preferences: { jobs: true, reminders: true, news: false } };
      expect(service.enabled()).toBeFalse();

      expect(await service.setEnabled(true, { reminders: true })).toBeTrue();

      expect(lastBody().preferences).toEqual({ jobs: true, news: true, reminders: true });
      expect(lastBody().timezone).toBe(deviceTimeZone);
      expect(service.enabled()).toBeTrue();
      expect(localStorage.getItem('notifications-enabled')).toBe('true');
      expect(service.preferences()).toEqual({ jobs: true, reminders: true, news: false });
    });

    it('turning notifications on with nothing else chosen starts with finished jobs and new features, not reminders', async () => {
      setupService(null);
      requestSubscriptionResult = current();
      postResponse = { preferences: { jobs: true, reminders: false, news: true } };
      expect(await service.setEnabled(true)).toBeTrue();
      expect(lastBody().preferences).toEqual({ jobs: true, news: true });
      expect(service.preferences()).toEqual({ jobs: true, reminders: false, news: true });
    });

    it('an ordinary page load re-registers the device without sending any switches', async () => {
      localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
      postResponse = { preferences: { jobs: true, reminders: false, news: true } };
      setupService(current());
      await settle();
      expect(postCalls.length).toBe(1);
      expect('preferences' in lastBody()).toBeFalse();
    });

    it('a visit by a switched-on device leaves its switches as they were (none sent, nothing re-ticked)', async () => {
      localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
      localStorage.setItem('notifications-enabled', 'true');
      postResponse = { preferences: { jobs: false, reminders: true, news: false } };
      setupService(current(), postResponse);
      await new Promise(resolve => setTimeout(resolve));
      expect(postCalls.length).toBe(1);
      expect('preferences' in lastBody()).toBeFalse();
      expect(requestSubscriptionCalls).toEqual([]);
      expect(service.enabled()).toBeTrue();
      expect(service.preferences()).toEqual({ jobs: false, reminders: true, news: false });
    });

    it('a switched-on device whose subscription the browser dropped is subscribed again, without sending switches', async () => {
      localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
      localStorage.setItem('notifications-enabled', 'true');
      setupService(null);
      requestSubscriptionResult = current();
      await new Promise(resolve => setTimeout(resolve));
      expect(requestSubscriptionCalls.length).toBe(1);
      expect(postCalls.map(call => call.url)).toEqual([`${environment.apiBaseUrl}/subscribe`]);
      expect('preferences' in lastBody()).toBeFalse();       // the server's defaults, same as turning on
      expect(service.enabled()).toBeTrue();
    });

    it('a switched-on device that cannot be subscribed again shows as off', async () => {
      localStorage.setItem('notifications-enabled', 'true');
      spyOn(console, 'error');
      setupService(null);                                   // requestSubscription will throw
      await new Promise(resolve => setTimeout(resolve));
      expect(service.enabled()).toBeFalse();
      expect(localStorage.getItem('notifications-enabled')).toBe('false');
    });

    it('jobsOn follows the finished-jobs switch, and is off when notifications are off', () => {
      setupService(null);
      expect(service.jobsOn()).toBeFalse();
      service.enabled.set(true);
      expect(service.jobsOn()).toBeTrue();                  // assumed on until the server answers
      service.preferences.set({ jobs: false, reminders: false, news: true });
      expect(service.jobsOn()).toBeFalse();
      service.preferences.set({ jobs: true, reminders: false, news: false });
      expect(service.jobsOn()).toBeTrue();
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

    it('switching the last switch off turns notifications off for the device', async () => {
      localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
      localStorage.setItem('notifications-enabled', 'true');
      postResponse = { preferences: { jobs: false, reminders: false, news: true } };
      setupService(current());
      await settle();
      expect(service.enabled()).toBeTrue();
      postResponse = { status: 'ok', preferences: { jobs: false, reminders: false, news: false } };

      expect(await service.setPreferences({ news: false })).toBeTrue();

      expect(unsubscribeCallCount).toBe(1);
      expect(postCalls[postCalls.length - 1].url).toBe(`${environment.apiBaseUrl}/unsubscribe`);
      expect(service.enabled()).toBeFalse();
      expect(localStorage.getItem('notifications-enabled')).toBe('false');
      expect(service.preferences()).toBeNull();
    });

    it('a visit that finds every switch already off (turned off from the notifications) turns the device off', async () => {
      localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
      localStorage.setItem('notifications-enabled', 'true');
      setupService(current(), { preferences: { jobs: false, reminders: false, news: false } });
      await new Promise(resolve => setTimeout(resolve));
      expect(unsubscribeCallCount).toBe(1);
      expect(service.enabled()).toBeFalse();
      expect(service.preferences()).toBeNull();
    });

    it('where the browser has no push (iPhone Safari outside a Home Screen app), nothing is offered or sent', async () => {
      localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
      localStorage.setItem('notifications-enabled', 'true');
      setupService(current(), {}, { available: false });
      await settle();
      expect(service.supported).toBeFalse();
      expect(postCalls).toEqual([]);
      expect(await service.setPreferences({ news: false })).toBeFalse();
    });

    it('does not claim to be on when the browser cannot be asked for a subscription at all', async () => {
      spyOn(console, 'error');
      setupService(null, {}, { subscription: async () => { throw new TypeError('pushManager is undefined'); } });
      expect(await service.setEnabled(true)).toBeFalse();
      expect(service.enabled()).toBeFalse();
      expect(localStorage.getItem('notifications-enabled')).toBe('false');
    });

    it('a visit where the subscription cannot be read changes nothing (the next visit tries again)', async () => {
      localStorage.setItem(vapidStorageKey, environment.vapidPublicKey);
      localStorage.setItem('notifications-enabled', 'true');
      spyOn(console, 'error');
      setupService(null, {}, { subscription: async () => { throw new Error('The service worker did not start.'); } });
      await settle();
      expect(postCalls).toEqual([]);
      expect(requestSubscriptionCalls).toEqual([]);
      expect(service.enabled()).toBeTrue();
      expect(localStorage.getItem(vapidStorageKey)).toBe(environment.vapidPublicKey);
    });

    it('a switch that cannot be saved because the subscription cannot be read reports failure instead of waiting', async () => {
      spyOn(console, 'error');
      setupService(null, {}, { subscription: async () => { throw new Error('The service worker did not start.'); } });
      expect(await service.setPreferences({ news: false })).toBeFalse();
      await expectAsync(service.detachFromAccount()).toBeResolved();
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

  describe('iPhone and iPad: push only from the Home Screen', () => {
    const iphone = (version: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1`;
    const ipadAsDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
    const androidChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
    const tab = { maxTouchPoints: 5, standalone: false, pushAvailable: false };

    it('says so in an iPhone Safari tab, and on an iPad asking for desktop sites', () => {
      expect(pushNeedsHomeScreen({ ...tab, userAgent: iphone('17_5') })).toBeTrue();
      expect(pushNeedsHomeScreen({ ...tab, userAgent: iphone('16_4') })).toBeTrue();
      expect(pushNeedsHomeScreen({ ...tab, userAgent: ipadAsDesktop })).toBeTrue();
    });

    it('not once opened from the Home Screen, nor where push already works', () => {
      expect(pushNeedsHomeScreen({ ...tab, userAgent: iphone('17_5'), standalone: true })).toBeFalse();
      expect(pushNeedsHomeScreen({ ...tab, userAgent: iphone('17_5'), pushAvailable: true })).toBeFalse();
    });

    it('not where the Home Screen would not help: iOS before 16.4, a Mac, other phones', () => {
      expect(pushNeedsHomeScreen({ ...tab, userAgent: iphone('16_3') })).toBeFalse();
      expect(pushNeedsHomeScreen({ ...tab, userAgent: iphone('15_8') })).toBeFalse();
      expect(pushNeedsHomeScreen({ ...tab, userAgent: ipadAsDesktop, maxTouchPoints: 0 })).toBeFalse();   // a real Mac
      expect(pushNeedsHomeScreen({ ...tab, userAgent: androidChrome })).toBeFalse();
    });
  });
});
