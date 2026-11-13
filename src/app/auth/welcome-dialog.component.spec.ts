import { signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthOutcome, AuthService } from './auth.service';
import { WelcomeDialogComponent, isInWelcomeGroup } from './welcome-dialog.component';

describe('WelcomeDialogComponent', () => {
  const EVEN = '11111111-2222-4333-8444-55555555555a';   // last hex digit a = 10
  const ODD = '11111111-2222-4333-8444-55555555555b';
  let fixture: ComponentFixture<WelcomeDialogComponent>;
  let component: WelcomeDialogComponent;
  let outcome: ReturnType<typeof signal<AuthOutcome | null>>;
  let credits: BehaviorSubject<any>;
  let claim: jasmine.Spy;
  let router: { url: string; navigateByUrl: jasmine.Spy };
  let tag: jasmine.Spy;
  let originalTag: any;

  const signedUp = (userId: string, changes: Partial<AuthOutcome> = {}): AuthOutcome =>
    ({ provider: 'google', userId, isNewUser: true, linked: false, response: {}, ...changes });
  const actions = () => tag.calls.allArgs().filter(args => args[1] === 'welcome_dialog_action').map(args => args[2].action);

  function finishSignIn(result: AuthOutcome): void {
    outcome.set(result);
    fixture.detectChanges();
    tick(800);
    fixture.detectChanges();
  }

  beforeEach(() => {
    outcome = signal<AuthOutcome | null>(null);
    credits = new BehaviorSubject<any>({ credits: 200, canClaimDailyBonus: true, dailyBonusStreak: 0, nextDailyBonus: 30 });
    claim = jasmine.createSpy('claimDailyBonus');
    router = { url: '/', navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true) };
    originalTag = (window as any).gtag;
    tag = (window as any).gtag = jasmine.createSpy('gtag');
    TestBed.configureTestingModule({
      imports: [WelcomeDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: AuthService, useValue: { authOutcome: outcome, credits$: credits.asObservable(), claimDailyBonus: claim } },
        { provide: Router, useValue: router }
      ]
    });
    fixture = TestBed.createComponent(WelcomeDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    if (originalTag === undefined) delete (window as any).gtag;
    else (window as any).gtag = originalTag;
  });

  it('puts every other account id in the welcome group, from the id alone', () => {
    for (const digit of '02468ace') expect(isInWelcomeGroup('user-' + digit)).withContext(digit).toBeTrue();
    for (const digit of '13579bdf') expect(isInWelcomeGroup('user-' + digit)).withContext(digit).toBeFalse();
    expect(isInWelcomeGroup(EVEN.toUpperCase())).toBeTrue();
    for (const nothing of [null, undefined, '', 'user-z', '   ']) expect(isInWelcomeGroup(nothing)).toBeFalse();
    const group = Array.from({ length: 2000 }, () => crypto.randomUUID()).filter(isInWelcomeGroup).length;
    expect(group).toBeGreaterThan(900);
    expect(group).toBeLessThan(1100);
  });

  it('welcomes a new account in the group, once the sign-in has settled', fakeAsync(() => {
    outcome.set(signedUp(EVEN));
    fixture.detectChanges();
    tick(799);
    expect(component.visible()).toBeFalse();
    tick(1);
    fixture.detectChanges();
    expect(component.visible()).toBeTrue();
    expect(component.creditBalance).toBe(200);
    expect(actions()).toEqual(['shown']);
  }));

  it('stays away from the other half, from returning users and from linked sign-in methods', fakeAsync(() => {
    finishSignIn(signedUp(ODD));
    finishSignIn(signedUp(EVEN, { isNewUser: false }));
    finishSignIn(signedUp(EVEN, { isNewUser: false, linked: true }));
    finishSignIn(signedUp(null as any));
    expect(component.visible()).toBeFalse();
    expect(tag).not.toHaveBeenCalled();
  }));

  it('does not interrupt someone who signed up on their way to the video page', fakeAsync(() => {
    router.url = '/video';
    finishSignIn(signedUp(EVEN));
    expect(component.visible()).toBeFalse();
    expect(actions()).toEqual([]);
  }));

  it('goes to the video page from the main button', fakeAsync(() => {
    finishSignIn(signedUp(EVEN));
    component.makeVideo();
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/video');
    expect(component.visible()).toBeFalse();
    expect(actions()).toEqual(['shown', 'video']);
  }));

  it('claims the daily bonus in place and says what happened', fakeAsync(() => {
    finishSignIn(signedUp(EVEN));
    expect(component.dailyBonusAmount).toBe(30);
    claim.and.resolveTo({ success: true, message: 'ok', creditsAwarded: 30, newBalance: 230 });
    void component.claimDailyBonus();
    void component.claimDailyBonus();                         // a double click claims once
    tick();
    expect(claim).toHaveBeenCalledTimes(1);
    expect(component.claimed()).toBeTrue();
    expect(component.claimMessage()).toContain('+30 credits added');
    expect(component.visible()).toBeTrue();                   // still open: the video button is the point
    void component.claimDailyBonus();
    tick();
    expect(claim).toHaveBeenCalledTimes(1);
  }));

  it("shows the server's reason when the bonus cannot be claimed, and lets them try again", fakeAsync(() => {
    finishSignIn(signedUp(EVEN));
    claim.and.resolveTo({ success: false, message: 'Daily bonus already claimed today' });
    void component.claimDailyBonus();
    tick();
    expect(component.claimed()).toBeFalse();
    expect(component.claimMessage()).toBe('Daily bonus already claimed today');
    expect(component.claiming()).toBeFalse();
  }));

  it('closes on "Maybe later" or the X, and does not come back for the same sign-in', fakeAsync(() => {
    finishSignIn(signedUp(EVEN));
    component.onVisibleChange(false);
    expect(component.visible()).toBeFalse();
    expect(actions()).toEqual(['shown', 'later']);
    fixture.detectChanges();
    tick(2000);
    fixture.detectChanges();
    expect(component.visible()).toBeFalse();
  }));
});
