import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { AuthOutcome, AuthService, UserCredits } from './auth.service';
import { DiscordRewardCardComponent } from './discord-reward-card.component';

describe('DiscordRewardCardComponent', () => {
  let credits: BehaviorSubject<UserCredits | null>;
  let outcome: ReturnType<typeof signal<AuthOutcome | null>>;
  let startLink: jasmine.Spy;
  let tag: jasmine.Spy;
  let originalTag: any;
  const balance = (reward: UserCredits['discordJoinReward']): UserCredits =>
    ({ credits: 200, canClaimDailyBonus: false, dailyBonusStreak: 0, discordJoinReward: reward });
  const signInResult = (status: string, extra: Record<string, unknown> = {}): AuthOutcome =>
    ({ provider: 'discord', userId: 'u1', isNewUser: false, linked: true, response: { discord_reward: { status, credits: 100, ...extra } } });

  function create(signedIn = true, hasDiscord = false): ComponentFixture<DiscordRewardCardComponent> {
    const fixture = TestBed.createComponent(DiscordRewardCardComponent);
    fixture.componentRef.setInput('signedIn', signedIn);
    fixture.componentRef.setInput('hasDiscord', hasDiscord);
    fixture.detectChanges();
    return fixture;
  }
  const text = (fixture: ComponentFixture<unknown>) => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    credits = new BehaviorSubject<UserCredits | null>(balance({ claimed: false, credits: 100 }));
    outcome = signal<AuthOutcome | null>(null);
    startLink = jasmine.createSpy('startLink');
    originalTag = (window as any).gtag;
    tag = (window as any).gtag = jasmine.createSpy('gtag');
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { credits$: credits.asObservable(), authOutcome: outcome, startLink } }]
    });
  });

  afterEach(() => {
    if (originalTag === undefined) delete (window as any).gtag;
    else (window as any).gtag = originalTag;
  });

  it('offers the reward to a signed-in account that has not had it, with the invite and a connect step', () => {
    const fixture = create(true, false);
    expect(text(fixture)).toContain('Join our Discord: +100 credits');
    expect(text(fixture)).toContain('connect your Discord account');
    const invite = fixture.nativeElement.querySelector('.steps a') as HTMLAnchorElement;
    expect(invite.href).toBe('https://discord.gg/mobians');
    expect(invite.target).toBe('_blank');
    expect(invite.rel).toBe('noopener');
    invite.addEventListener('click', event => event.preventDefault());
    invite.click();
    expect(tag).toHaveBeenCalledOnceWith('event', 'discord_link_click', { placement: 'account_reward', send_to: 'G-NQ1MYQTHLM' });

    fixture.nativeElement.querySelector('.steps button').click();
    expect(startLink).toHaveBeenCalledOnceWith('discord');
  });

  it('asks an account that already has Discord connected only to join and claim', () => {
    const fixture = create(true, true);
    expect(text(fixture)).toContain('Join the server, then claim.');
    expect(fixture.nativeElement.querySelector('.steps button').textContent).toContain("I've joined: claim");
  });

  it('shows nothing when signed out, already claimed, or when the server cannot grant it', () => {
    expect(text(create(false))).toBe('');
    credits.next(balance({ claimed: true, credits: 100 }));
    expect(text(create())).toBe('');
    credits.next(balance(null));
    expect(text(create())).toBe('');
    credits.next(null);
    expect(text(create())).toBe('');
  });

  it('thanks them once the reward has just been paid, even though it now counts as claimed', () => {
    credits.next(balance({ claimed: true, credits: 100 }));
    outcome.set(signInResult('granted', { new_balance: 300 }));
    const fixture = create(true, true);
    expect(text(fixture)).toContain('100 credits added');
    expect(text(fixture)).toContain('Thanks for joining!');
    expect(fixture.nativeElement.querySelector('.steps')).toBeNull();
    expect(text(fixture)).not.toContain('other Mobians account');
  });

  it('thanks someone whose Discord belongs to their other account, and says it was not connected', () => {
    credits.next(balance({ claimed: true, credits: 100 }));
    const paidWithoutConnecting = signInResult('granted', { new_balance: 300 });
    paidWithoutConnecting.response['linked'] = false;              // what the backend answers in that case
    outcome.set(paidWithoutConnecting);
    const fixture = create(true, false);                            // still no Discord on this account
    expect(text(fixture)).toContain('100 credits added');
    expect(text(fixture)).toContain("Your Discord account stays with your other Mobians account; the two can't be merged.");
    expect(fixture.nativeElement.querySelector('.steps')).toBeNull();
  });

  it('appears when the panel learns the visitor is signed in after it first rendered', () => {
    const fixture = create(false);
    expect(text(fixture)).toBe('');
    fixture.componentRef.setInput('signedIn', true);
    fixture.detectChanges();
    expect(text(fixture)).toContain('Join our Discord: +100 credits');
    fixture.componentRef.setInput('hasDiscord', true);
    fixture.detectChanges();
    expect(text(fixture)).toContain('Join the server, then claim.');
  });

  it('is one line on a phone until tapped, but always open when there is something to explain', () => {
    const narrow = spyOn(DiscordRewardCardComponent.prototype, 'wideScreen').and.returnValue(false);
    const fixture = create(true, false);
    expect(text(fixture)).toBe('Join our Discord: +100 credits');
    expect(fixture.nativeElement.querySelector('.steps')).toBeNull();
    fixture.nativeElement.querySelector('.toggle').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.steps')).not.toBeNull();
    fixture.nativeElement.querySelector('.toggle').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.steps')).toBeNull();

    outcome.set(signInResult('not_member'));
    const returned = create(true, true);
    expect(text(returned)).toContain("We couldn't see you in the server yet");
    expect(narrow).toHaveBeenCalled();
  });

  it('explains when they connected Discord but are not in the server yet', () => {
    outcome.set(signInResult('not_member'));
    const fixture = create(true, true);
    expect(text(fixture)).toContain("We couldn't see you in the server yet");
    expect(fixture.nativeElement.querySelector('.steps button')).not.toBeNull();
  });
});
