import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NotificationService, PushPreferences } from '../notification.service';
import { NotificationSettingsComponent } from './notification-settings.component';
import { NotifyMeComponent } from './notify-me.component';
import { PushOptOutComponent } from './push-opt-out.component';

/** Stands in for the service: records what the UI asked for and lets a test decide the outcome. */
class FakeNotifications {
  supported = true;
  blockedByBrowser = false;
  enabled = signal(false);
  preferences = signal<PushPreferences | null>(null);
  subscribeSucceeds = true;
  saveSucceeds = true;
  asked: unknown[] = [];

  async setEnabled(on: boolean, chosen?: Partial<PushPreferences>): Promise<boolean> {
    this.asked.push(['setEnabled', on, chosen]);
    const result = on && this.subscribeSucceeds;
    this.enabled.set(result);
    this.preferences.set(result ? { jobs: true, reminders: !!chosen?.reminders, news: !!chosen?.news } : null);
    return result;
  }

  async setPreferences(changes: Partial<PushPreferences>): Promise<boolean> {
    this.asked.push(['setPreferences', changes]);
    if (this.saveSucceeds) this.preferences.set({ ...(this.preferences() ?? { jobs: true, reminders: false, news: false }), ...changes });
    return this.saveSucceeds;
  }
}

describe('notification controls', () => {
  let notifications: FakeNotifications;
  let router: jasmine.SpyObj<Router>;
  const text = (fixture: ComponentFixture<unknown>) => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();
  const settle = async (fixture: ComponentFixture<unknown>) => { await fixture.whenStable(); fixture.detectChanges(); };

  beforeEach(() => {
    notifications = new FakeNotifications();
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    TestBed.configureTestingModule({
      providers: [{ provide: NotificationService, useValue: notifications }, { provide: Router, useValue: router }]
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

    it('starts with a single Turn on button, which enables finished-job notifications only', async () => {
      const fixture = create();
      expect(boxes(fixture).length).toBe(0);
      fixture.nativeElement.querySelector('.turn-on').click();
      await settle(fixture);
      expect(notifications.asked).toEqual([['setEnabled', true, { jobs: true }]]);
      expect(boxes(fixture).map(box => box.checked)).toEqual([true, false, false]);   // jobs on; reminders and news stay off
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

    it('turns everything off on this device in one step', async () => {
      notifications.enabled.set(true);
      const fixture = create();
      fixture.nativeElement.querySelector('.turn-off').click();
      await settle(fixture);
      expect(notifications.asked).toEqual([['setEnabled', false, undefined]]);
      expect(text(fixture)).toContain('Notifications are off on this device.');
    });

    it('after a daily claim offers a reminder, turning notifications on with it if needed', async () => {
      const fresh = create(true, true);
      fresh.nativeElement.querySelector('.offer button').click();
      await settle(fresh);
      expect(notifications.asked).toEqual([['setEnabled', true, { jobs: true, reminders: true }]]);
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
      expect(notifications.asked).toEqual([['setEnabled', true, { jobs: true }]]);
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

    it('does the same for news, and can simply be closed', async () => {
      const fixture = arrive('?push=news');
      expect(text(fixture)).toContain('Turn off news notifications');
      fixture.nativeElement.querySelector('.close').click();
      await settle(fixture);
      expect(text(fixture)).toBe('');
      expect(notifications.asked).toEqual([]);
      expect(router.navigate).toHaveBeenCalled();
    });
  });
});
