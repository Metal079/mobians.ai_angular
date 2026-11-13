import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { AccountCtaService } from 'src/app/auth/account-cta.service';
import { SharedService } from 'src/app/shared.service';
import { SignupNudgeComponent, SignupNudgeVariant, WAIT_NUDGE_DELAY_MS } from './signup-nudge.component';

describe('SignupNudgeComponent', () => {
  let user: BehaviorSubject<any>;
  let requestLogin: jasmine.Spy;
  let tag: jasmine.Spy;
  let originalTag: any;

  const card = (fixture: ComponentFixture<SignupNudgeComponent>): HTMLElement | null =>
    fixture.nativeElement.querySelector('.signup-nudge');

  function create(variant: SignupNudgeVariant, compact = false): ComponentFixture<SignupNudgeComponent> {
    const fixture = TestBed.createComponent(SignupNudgeComponent);
    fixture.componentRef.setInput('variant', variant);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return fixture;
  }

  function clearStorage(): void {
    sessionStorage.removeItem('signup-nudge-wait-dismissed');
    localStorage.removeItem('signup-nudge-result-quiet-until');
  }

  beforeEach(() => {
    clearStorage();
    user = new BehaviorSubject<any>(null);
    requestLogin = jasmine.createSpy('requestLogin');
    originalTag = (window as any).gtag;
    tag = (window as any).gtag = jasmine.createSpy('gtag');
    TestBed.configureTestingModule({
      imports: [SignupNudgeComponent],
      providers: [
        { provide: SharedService, useValue: { getUserData: () => user.asObservable(), getUserDataValue: () => user.value } },
        { provide: AccountCtaService, useValue: { requestLogin } }
      ]
    });
  });

  afterEach(() => {
    clearStorage();
    if (originalTag === undefined) delete (window as any).gtag;
    else (window as any).gtag = originalTag;
  });

  it('appears on the wait screen only after a few seconds, and is reported once', fakeAsync(() => {
    const fixture = create('wait');
    expect(card(fixture)).toBeNull();
    tick(WAIT_NUDGE_DELAY_MS - 1);
    fixture.detectChanges();
    expect(card(fixture)).toBeNull();
    tick(1);
    fixture.detectChanges();
    expect(card(fixture)!.textContent).toContain('You keep your place in line');
    expect(card(fixture)!.textContent).toContain('200 credits');
    fixture.detectChanges();
    expect(tag.calls.allArgs()).toEqual([['event', 'signup_prompt_view', { placement: 'wait', send_to: 'G-NQ1MYQTHLM' }]]);
  }));

  it('is never shown to someone who is signed in, and goes away when they sign in', fakeAsync(() => {
    user.next({ user_id: 'u1' });
    const signedIn = create('wait');
    tick(WAIT_NUDGE_DELAY_MS);
    signedIn.detectChanges();
    expect(card(signedIn)).toBeNull();
    expect(tag).not.toHaveBeenCalled();

    user.next(null);
    const guest = create('result');
    expect(card(guest)).not.toBeNull();
    user.next({ user_id: 'u1' });
    guest.detectChanges();
    expect(card(guest)).toBeNull();
  }));

  it('opens sign-in with the reason for the place it was shown', fakeAsync(() => {
    const wait = create('wait');
    tick(WAIT_NUDGE_DELAY_MS);
    wait.detectChanges();
    card(wait)!.querySelector<HTMLButtonElement>('.signup-nudge-cta')!.click();
    expect(requestLogin).toHaveBeenCalledOnceWith({ reason: 'wait-screen' });

    const result = create('result');
    expect(card(result)!.textContent).toContain('synced across devices');
    card(result)!.querySelector<HTMLButtonElement>('.signup-nudge-cta')!.click();
    expect(requestLogin.calls.mostRecent().args).toEqual([{ reason: 'results' }]);
    expect(tag.calls.allArgs().filter(args => args[1] === 'signup_prompt_click').map(args => args[2].placement))
      .toEqual(['wait', 'result']);
  }));

  it('stays closed for the rest of the visit once the wait prompt is closed', fakeAsync(() => {
    const fixture = create('wait');
    tick(WAIT_NUDGE_DELAY_MS);
    fixture.detectChanges();
    card(fixture)!.querySelector<HTMLButtonElement>('.signup-nudge-close')!.click();
    fixture.detectChanges();
    expect(card(fixture)).toBeNull();

    const nextWait = create('wait');
    tick(WAIT_NUDGE_DELAY_MS);
    nextWait.detectChanges();
    expect(card(nextWait)).toBeNull();
    expect(requestLogin).not.toHaveBeenCalled();
  }));

  it('keeps the result prompt closed for a week, then shows it again', () => {
    const fixture = create('result');
    card(fixture)!.querySelector<HTMLButtonElement>('.signup-nudge-close')!.click();
    fixture.detectChanges();
    expect(card(fixture)).toBeNull();
    expect(card(create('result'))).toBeNull();

    const quietUntil = Number(localStorage.getItem('signup-nudge-result-quiet-until'));
    expect(quietUntil - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    localStorage.setItem('signup-nudge-result-quiet-until', String(Date.now() - 1000));
    expect(card(create('result'))).not.toBeNull();
  });

  it('uses one short line when the grid is low', fakeAsync(() => {
    const fixture = create('wait', true);
    tick(WAIT_NUDGE_DELAY_MS);
    fixture.detectChanges();
    expect(card(fixture)!.classList).toContain('compact');
    expect(card(fixture)!.textContent).toContain('Sign in free for 200 credits.');
    expect(card(fixture)!.textContent).not.toContain('place in line');
  }));

  it('does not let clicks reach whatever is behind it', () => {
    const fixture = create('result');
    const behind = jasmine.createSpy('behind');
    fixture.nativeElement.addEventListener('click', behind);
    card(fixture)!.click();
    card(fixture)!.querySelector<HTMLButtonElement>('.signup-nudge-cta')!.click();
    expect(behind).not.toHaveBeenCalled();
  });

  it('works when storage is unavailable', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    const fixture = create('result');
    expect(card(fixture)).not.toBeNull();
    expect(() => fixture.componentInstance.dismiss()).not.toThrow();
    fixture.detectChanges();
    expect(card(fixture)).toBeNull();
  });
});
