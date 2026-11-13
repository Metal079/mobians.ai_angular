import { ChangeDetectorRef } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { BehaviorSubject, of } from 'rxjs';
import { NotificationService } from '../notification.service';
import { SharedService } from '../shared.service';
import { AccountCtaService } from './account-cta.service';
import { AuthService, UserCredits } from './auth.service';
import { ProfileMenuComponent } from './profile-menu.component';

describe('ProfileMenuComponent', () => {
  let credits: BehaviorSubject<UserCredits | null>;
  let auth: jasmine.SpyObj<AuthService>;
  let cdr: jasmine.SpyObj<ChangeDetectorRef>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let calls: string[];

  function create(): ProfileMenuComponent {
    const shared = jasmine.createSpyObj<SharedService>('SharedService', ['getUserData']);
    shared.getUserData.and.returnValue(of({ user_id: 'user-1' }));
    const messages = jasmine.createSpyObj<MessageService>('MessageService', ['add']);
    const accountCta = jasmine.createSpyObj<AccountCtaService>('AccountCtaService', ['requestCreditPurchase']);
    return TestBed.runInInjectionContext(() => new ProfileMenuComponent(shared, auth, messages, accountCta, cdr));
  }

  beforeEach(() => {
    calls = [];
    credits = new BehaviorSubject<UserCredits | null>({ credits: 100, canClaimDailyBonus: false, dailyBonusStreak: 0 });
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn', 'refreshCredits', 'claimDailyBonus', 'logout']);
    Object.defineProperty(auth, 'credits$', { value: credits.asObservable() });
    auth.isLoggedIn.and.returnValue(false);
    auth.logout.and.callFake(() => { calls.push('logout'); });
    cdr = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['markForCheck']);
    notifications = jasmine.createSpyObj<NotificationService>('NotificationService', ['detachFromAccount']);
    notifications.detachFromAccount.and.callFake(async () => { calls.push('detach'); });
    TestBed.configureTestingModule({ providers: [{ provide: NotificationService, useValue: notifications }] });
  });

  it('marks the minimized credit badge for refresh when the shared balance changes', fakeAsync(() => {
    const component = create();

    component.ngOnInit();
    tick();
    cdr.markForCheck.calls.reset();

    credits.next({ credits: 200, canClaimDailyBonus: false, dailyBonusStreak: 0 });
    tick();

    expect(component.credits).toBe(200);
    expect(cdr.markForCheck).toHaveBeenCalled();
    component.ngOnDestroy();
  }));

  it('detaches this device from the account before signing out', async () => {
    const component = create();
    component.justClaimedDaily = true;
    await component.logout();
    expect(calls).toEqual(['detach', 'logout']);
    expect(component.justClaimedDaily).toBeFalse();
  });

  it('offers a streak reminder only after a successful daily claim', async () => {
    const component = create();
    auth.claimDailyBonus.and.resolveTo({ success: false, message: 'Already claimed' });
    await component.claimDaily();
    expect(component.justClaimedDaily).toBeFalse();
    auth.claimDailyBonus.and.resolveTo({ success: true, message: 'ok', newBalance: 130, streak: 1, creditsAwarded: 30 });
    await component.claimDaily();
    expect(component.justClaimedDaily).toBeTrue();
  });
});
