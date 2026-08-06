import { ChangeDetectorRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { BehaviorSubject, of } from 'rxjs';
import { SharedService } from '../shared.service';
import { AccountCtaService } from './account-cta.service';
import { AuthService, UserCredits } from './auth.service';
import { ProfileMenuComponent } from './profile-menu.component';

describe('ProfileMenuComponent', () => {
  it('marks the minimized credit badge for refresh when the shared balance changes', fakeAsync(() => {
    const credits = new BehaviorSubject<UserCredits | null>({
      credits: 100,
      canClaimDailyBonus: false,
      dailyBonusStreak: 0,
    });
    const shared = jasmine.createSpyObj<SharedService>('SharedService', ['getUserData']);
    shared.getUserData.and.returnValue(of({ user_id: 'user-1' }));
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn', 'refreshCredits']);
    Object.defineProperty(auth, 'credits$', { value: credits.asObservable() });
    auth.isLoggedIn.and.returnValue(false);
    const messages = jasmine.createSpyObj<MessageService>('MessageService', ['add']);
    const accountCta = jasmine.createSpyObj<AccountCtaService>('AccountCtaService', ['requestCreditPurchase']);
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['markForCheck']);
    const component = new ProfileMenuComponent(shared, auth, messages, accountCta, cdr);

    component.ngOnInit();
    tick();
    cdr.markForCheck.calls.reset();

    credits.next({ credits: 200, canClaimDailyBonus: false, dailyBonusStreak: 0 });
    tick();

    expect(component.credits).toBe(200);
    expect(cdr.markForCheck).toHaveBeenCalled();
    component.ngOnDestroy();
  }));
});
