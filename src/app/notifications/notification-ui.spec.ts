import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MutableCategory, NotificationService, PushPreferences } from '../notification.service';
import { NotificationSettingsComponent } from './notification-settings.component';
import { NotifyMeComponent } from './notify-me.component';
import { PushOptOutComponent } from './push-opt-out.component';
import { WhatsNewService } from '../whats-new/whats-new.service';

/** Stands in for the service: records what the UI asked for and lets a test decide the outcome. */
class FakeNotifications {
  supported = true;
  needsHomeScreen = false;
  blockedByBrowser = false;
  enabled = signal(false);
  preferences = signal<PushPreferences | null>(null);
  openedFrom = signal<MutableCategory | null>(null);
  subscribeSucceeds = true;
  saveSucceeds = true;
  asked: unknown[] = [];

  async setEnabled(on: boolean, chosen?: Partial<PushPreferences>): Promise<boolean> {
    this.asked.push(['setEnabled', on, chosen]);
    const result = on && this.subscribeSucceeds;
    this.enabled.set(result);
    // Like the real service: a device that is turned on starts with finished jobs and new features.
    this.preferences.set(result ? { jobs: true, reminders: !!chosen?.reminders, news: true } : null);
    return result;
  }

  async setPreferences(changes: Partial<PushPreferences>): Promise<boolean> {
    this.asked.push(['setPreferences', changes]);
    if (this.saveSucceeds) {
      const now = { ...(this.preferences() ?? { jobs: true, reminders: false, news: false }), ...changes };
      this.preferences.set(now);
      // Like the real service: with the last switch off, the device is off.
      if (!now.jobs && !now.reminders && !now.news) { this.enabled.set(false); this.preferences.set(null); }
    }
    return this.saveSucceeds;
  }
}

describe('notification controls', () => {
  afterAll(() => localStorage.removeItem('reminder-offer-dismissed'));
  let notifications: FakeNotifications;
  let router: jasmine.SpyObj<Router>;
  let whatsNew: jasmine.SpyObj<WhatsNewService>;
  const text = (fixture: ComponentFixture<unknown>) => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();
  const settle = async (fixture: ComponentFixture<unknown>) => { await fixture.whenStable(); fixture.detectChanges(); };

  beforeEach(() => {
    localStorage.removeItem('reminder-offer-dismissed');
    notifications = new FakeNotifications();
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    whatsNew = jasmine.createSpyObj<WhatsNewService>('WhatsNewService', ['openFromNotification']);
    whatsNew.openFromNotification.and.resolveTo();
    TestBed.configureTestingModule({
      providers: [{ provide: NotificationService, useValue: notifications }, { provide: Router, useValue: router },
        { provide: WhatsNewService, useValue: whatsNew }]
    });
  });

  describe('Account panel switches', () => {
    function create(signedIn = true, offerReminder = false, expanded = true): ComponentFixture<NotificationSettingsComponent> {
      const fixture = TestBed.createComponent(NotificationSettingsComponent);
      fixture.componentRef.setInput('signedIn', signedIn);
      fixture.componentRef.setInput('offerReminder', offerReminder);
      fixture.componentInstance.expanded.set(expanded);
      fixture.detectChanges();
      return fixture;
    }
    const boxes = (fixture: ComponentFixture<unknown>) =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type=checkbox]'));

    it('is a single line until opened, saying whether notifications are on', () => {
      const fixture = create(true, false, false);
      expect(text(fixture)).toBe('Notifications Off');
      expect(fixture.nativeElement.querySelector('.turn-on')).toBeNull();
      fixture.nativeElement.querySelector('.heading').click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.turn-on')).not.toBeNull();
      notifications.enabled.set(true);
      fixture.nativeElement.querySelector('.heading').click();
      fixture.detectChanges();
      expect(text(fixture)).toBe('Notifications On');
    });

    it('offers the streak reminder even while closed', () => {
      const fixture = create(true, true, false);
      expect(fixture.nativeElement.querySelector('.offer button')).not.toBeNull();
      expect(boxes(fixture).length).toBe(0);
    });

    it('shows nothing where the browser cannot do push', () => {
      notifications.supported = false;
      expect(text(create())).toBe('');
    });

    it('in an iPhone or iPad browser tab, says how to get notifications (Home Screen) instead of offering switches', () => {
      notifications.supported = false;
      notifications.needsHomeScreen = true;
      notifications.enabled.set(true);                   // left over from before: still not claimed as on
      const closed = create(true, true, false);
      expect(text(closed)).toBe('Notifications Off');    // one line until opened; no streak-reminder offer either
      closed.nativeElement.querySelector('.heading').click();
      closed.detectChanges();
      expect(text(closed)).toContain('Add to Home Screen');
      expect(closed.nativeElement.querySelector('.turn-on')).toBeNull();
      expect(boxes(closed).length).toBe(0);
    });

    it('starts with a single Turn on button, which says what it turns on: finished jobs and new features', async () => {
      const fixture = create();
      expect(boxes(fixture).length).toBe(0);
      expect(text(fixture)).toContain('and about big new features');
      fixture.nativeElement.querySelector('.turn-on').click();
      await settle(fixture);
      expect(notifications.asked).toEqual([['setEnabled', true, undefined]]);          // the service decides what "on" starts with
      expect(boxes(fixture).map(box => box.checked)).toEqual([true, false, true]);     // jobs and new features on; reminders stay off
    });

    it('before the server has answered, an on device shows what every device starts with: finished jobs and new features', () => {
      notifications.enabled.set(true);
      const fixture = create();
      expect(boxes(fixture).map(box => box.checked)).toEqual([true, false, true]);
      expect(text(fixture)).toContain('Notifications On');
    });

    it('says so when the browser blocks notifications instead of offering a button that cannot work', () => {
      notifications.blockedByBrowser = true;
      const fixture = create();
      expect(text(fixture)).toContain('blocked for this site');
      expect(fixture.nativeElement.querySelector('.turn-on')).toBeNull();
    });

    it('saves each switch as it is changed, and puts it back if saving fails', async () => {
      notifications.enabled.set(true);
      notifications.preferences.set({ jobs: true, reminders: false, news: false });
      const fixture = create();
      const [, , news] = boxes(fixture);
      news.click();
      await settle(fixture);
      expect(notifications.asked).toEqual([['setPreferences', { news: true }]]);
      expect(boxes(fixture)[2].checked).toBeTrue();

      notifications.saveSucceeds = false;
      boxes(fixture)[0].click();
      await settle(fixture);
      expect(boxes(fixture)[0].checked).toBeTrue();
      expect(text(fixture)).toContain("That didn't save");
    });

    it('keeps the reminder switch for people who are signed in', () => {
      notifications.enabled.set(true);
      notifications.preferences.set({ jobs: true, reminders: true, news: false });
      const fixture = create(false);
      const reminders = boxes(fixture)[1];
      expect(reminders.disabled).toBeTrue();
      expect(reminders.checked).toBeFalse();
      expect(text(fixture)).toContain('Sign in to use this.');
    });

    it('has no separate turn-all-off button: unticking the last switch turns notifications off', async () => {
      notifications.enabled.set(true);
      notifications.preferences.set({ jobs: true, reminders: false, news: true });
      const fixture = create();
      expect(text(fixture)).not.toContain('Turn all off');
      expect(fixture.nativeElement.querySelector('.turn-off')).toBeNull();

      boxes(fixture)[2].click();                                   // new features off: finished jobs is still on
      await settle(fixture);
      expect(notifications.enabled()).toBeTrue();
      expect(text(fixture)).not.toContain('Notifications are off');

      boxes(fixture)[0].click();                                   // the last one
      await settle(fixture);
      expect(notifications.asked).toEqual([['setPreferences', { news: false }], ['setPreferences', { jobs: false }]]);
      expect(text(fixture)).toContain('Notifications Off');
      expect(text(fixture)).toContain('Notifications are off on this device.');
      expect(fixture.nativeElement.querySelector('.turn-on')).not.toBeNull();        // and can be turned on again
      expect(boxes(fixture).length).toBe(0);
    });

    it('says Off for a device that is subscribed with every switch off', () => {
      notifications.enabled.set(true);
      notifications.preferences.set({ jobs: false, reminders: false, news: false });
      expect(text(create(true, false, false))).toBe('Notifications Off');
    });

    it('after a daily claim offers a reminder, turning notifications on with it if needed', async () => {
      const fresh = create(true, true);
      fresh.nativeElement.querySelector('.offer button').click();
      await settle(fresh);
      expect(notifications.asked).toEqual([['setEnabled', true, { reminders: true }]]);
      expect(text(fresh)).toContain('at most once a day');
      expect(fresh.nativeElement.querySelector('.offer')).toBeNull();          // already on: no longer offered

      notifications.asked = [];
      notifications.preferences.set({ jobs: true, reminders: false, news: false });
      const subscribed = create(true, true);
      subscribed.nativeElement.querySelector('.offer button').click();
      await settle(subscribed);
      expect(notifications.asked).toEqual([['setPreferences', { reminders: true }]]);
    });

    it('never offers a reminder to someone signed out or already getting them', () => {
      expect(create(false, true).nativeElement.querySelector('.offer')).toBeNull();
      notifications.enabled.set(true);
      notifications.preferences.set({ jobs: true, reminders: true, news: false });
      expect(create(true, true).nativeElement.querySelector('.offer')).toBeNull();
    });

    it('the reminder offer can be closed, and stays closed after later claims in this browser', async () => {
      const fixture = create(true, true);
      fixture.nativeElement.querySelector('.offer .dismiss').click();
      await settle(fixture);
      expect(fixture.nativeElement.querySelector('.offer')).toBeNull();
      expect(notifications.asked).toEqual([]);                                  // closing it changes no setting
      expect(localStorage.getItem('reminder-offer-dismissed')).toBe('1');
      expect(create(true, true).nativeElement.querySelector('.offer')).toBeNull();  // the next claim, or a reload
      notifications.enabled.set(true);
      notifications.preferences.set({ jobs: true, reminders: false, news: true });
      const opened = create(true, true, true);
      expect(opened.nativeElement.querySelector('.offer')).toBeNull();
      expect(text(opened)).toContain('Daily bonus reminder');                    // the switch is still there
    });
  });

  describe('Notify me on the wait screen', () => {
    it('turns on finished-job notifications without the click reaching the grid behind it', async () => {
      const fixture = TestBed.createComponent(NotifyMeComponent);
      fixture.detectChanges();
      const behind = jasmine.createSpy('behind');
      fixture.nativeElement.addEventListener('click', behind);
      fixture.nativeElement.querySelector('.notify-me').click();
      await settle(fixture);
      expect(behind).not.toHaveBeenCalled();
      expect(notifications.asked).toEqual([['setEnabled', true, undefined]]);
      expect(text(fixture)).toContain("We'll notify you when it's ready");
    });

    it('is not offered when notifications are already on, blocked or unsupported', () => {
      for (const change of [() => notifications.enabled.set(true), () => { notifications.blockedByBrowser = true; }, () => { notifications.supported = false; }]) {
        notifications = new FakeNotifications();
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [{ provide: NotificationService, useValue: notifications }] });
        change();
        const fixture = TestBed.createComponent(NotifyMeComponent);
        fixture.detectChanges();
        expect(text(fixture)).toBe('');
      }
    });

    it('offers the button again if the browser refuses', async () => {
      notifications.subscribeSucceeds = false;
      const fixture = TestBed.createComponent(NotifyMeComponent);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.notify-me').click();
      await settle(fixture);
      expect(fixture.nativeElement.querySelector('.notify-me')).not.toBeNull();
      expect(text(fixture)).not.toContain("We'll notify you");
    });
  });

  describe('opt-out bar for notifications without buttons', () => {
    function arrive(search: string): ComponentFixture<PushOptOutComponent> {
      spyOn(PushOptOutComponent.prototype, 'addressQuery').and.returnValue(search);
      const fixture = TestBed.createComponent(PushOptOutComponent);
      fixture.detectChanges();
      return fixture;
    }

    it('stays hidden on ordinary visits and for unknown values', () => {
      expect(text(arrive('?utm_source=discord&push=everything'))).toBe('');
    });

    it('turns reminders off in one tap and removes the marker from the address', async () => {
      const fixture = arrive('?push=reminders');
      expect(text(fixture)).toContain('You opened a daily bonus reminder.');
      fixture.nativeElement.querySelector('.act').click();
      await settle(fixture);
      expect(notifications.asked).toEqual([['setPreferences', { reminders: false }]]);
      expect(text(fixture)).toContain('Daily bonus reminders are off on this device.');
      expect(router.navigate).toHaveBeenCalledWith([], { queryParams: { push: null }, queryParamsHandling: 'merge', replaceUrl: true });
    });

    it('also appears when a reminder is tapped while the site is already open, and can simply be closed', async () => {
      const fixture = arrive('');
      expect(text(fixture)).toBe('');
      notifications.openedFrom.set('reminders');             // reported by the service worker
      fixture.detectChanges();
      expect(text(fixture)).toContain('You opened a daily bonus reminder.');
      fixture.nativeElement.querySelector('.close').click();
      await settle(fixture);
      expect(text(fixture)).toBe('');
      expect(notifications.asked).toEqual([]);
      expect(notifications.openedFrom()).toBeNull();
      notifications.openedFrom.set('reminders');             // a later tap brings it back
      fixture.detectChanges();
      expect(text(fixture)).toContain('You opened a daily bonus reminder.');
    });

    it('a news notification opens the posts instead of the bar, from a new tab or an open one', async () => {
      const fixture = arrive('?push=news');
      expect(text(fixture)).toBe('');
      expect(whatsNew.openFromNotification).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith([], { queryParams: { push: null }, queryParamsHandling: 'merge', replaceUrl: true });
      notifications.openedFrom.set('news');                  // a later tap while the site is open
      fixture.detectChanges();
      expect(text(fixture)).toBe('');
      expect(whatsNew.openFromNotification).toHaveBeenCalledTimes(2);
      expect(notifications.openedFrom()).toBeNull();
      expect(notifications.asked).toEqual([]);
    });
  });
});
