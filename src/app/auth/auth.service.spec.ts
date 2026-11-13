import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SharedService } from '../shared.service';
import { CurrentUserResponse, StableDiffusionService } from '../stable-diffusion.service';
import { AuthService, safeReturnPath } from './auth.service';
import { CompletedSignupTracker } from './signup-tracking';

interface MutableSessionValidationDelays {
  sessionValidationRetryDelaysMs: number[];
}

describe('AuthService', () => {
  let api: jasmine.SpyObj<StableDiffusionService>;
  let router: jasmine.SpyObj<Router>;
  let service: AuthService;
  let shared: jasmine.SpyObj<SharedService>;
  let userData: any;

  beforeEach(() => {
    userData = {
      user_id: 'user-1',
      token: 'stored-token',
      credits: 12,
      daily_bonus_streak: 1,
      last_daily_bonus: null
    };

    try {
      localStorage.setItem('authToken', 'stored-token');
      localStorage.setItem('userData', JSON.stringify(userData));
    } catch {}

    api = jasmine.createSpyObj<StableDiffusionService>('StableDiffusionService', ['getCurrentUser', 'googleLogin', 'discordLogin']);
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    shared = jasmine.createSpyObj<SharedService>('SharedService', ['getUserDataValue', 'setUserData']);
    shared.getUserDataValue.and.callFake(() => userData);
    shared.setUserData.and.callFake((value: any) => {
      userData = value;
    });
    spyOn(console, 'warn');

    service = new AuthService(router, shared, api);
    (service as unknown as MutableSessionValidationDelays).sessionValidationRetryDelaysMs = [1, 1];
    shared.setUserData.calls.reset();
  });

  afterEach(() => {
    try {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
    } catch {}
  });

  for (const provider of ['google', 'discord'] as const) {
    it(`tracks the backend result only after a successful ${provider} exchange`, async () => {
      const record = spyOn(CompletedSignupTracker.prototype, 'record');
      const response = { status: 'success', is_new_user: true, user_id: 'new-user', token: 'new-token' };
      const login = provider === 'google' ? api.googleLogin : api.discordLogin;
      login.and.returnValue(of(response));
      await service.exchangeCode(provider, 'test-code');
      expect(record).toHaveBeenCalledOnceWith(response, provider, false);
      expect(localStorage.getItem('authToken')).toBe('new-token');
    });

    it(`sends where the visitor came from with a ${provider} sign-in`, async () => {
      localStorage.setItem('first-touch', JSON.stringify({ utm_source: 'discord', landing_path: '/video', first_seen_at: '2026-11-01T10:00:00.000Z' }));
      localStorage.setItem('notifications-user-id', 'browser-id-1234');
      const login = provider === 'google' ? api.googleLogin : api.discordLogin;
      login.and.returnValue(of({ status: 'success', is_new_user: true, user_id: 'new-user', token: 'new-token' }));
      try {
        await service.exchangeCode(provider, 'test-code');
      } finally {
        localStorage.removeItem('first-touch');
        localStorage.removeItem('notifications-user-id');
      }
      expect(login).toHaveBeenCalledOnceWith(jasmine.objectContaining({
        code: 'test-code', link: false,
        attribution: { utm_source: 'discord', landing_path: '/video', first_seen_at: '2026-11-01T10:00:00.000Z', client_id: 'browser-id-1234' }
      }));
    });

    it(`does not track a failed ${provider} exchange`, async () => {
      const record = spyOn(CompletedSignupTracker.prototype, 'record');
      const login = provider === 'google' ? api.googleLogin : api.discordLogin;
      login.and.returnValue(throwError(() => new Error('exchange failed')));
      await expectAsync(service.exchangeCode(provider, 'bad-code')).toBeRejected();
      expect(record).not.toHaveBeenCalled();
    });
  }

  it('preserves the account-link flag for signup exclusion', async () => {
    const record = spyOn(CompletedSignupTracker.prototype, 'record');
    const response = { status: 'success', is_new_user: false, user_id: 'linked-user', token: 'new-token' };
    api.googleLogin.and.returnValue(of(response));
    await service.exchangeCode('google', 'link-code', true);
    expect(record).toHaveBeenCalledOnceWith(response, 'google', true);
    // Linking a second sign-in method is not a new arrival, so no source is sent.
    expect(api.googleLogin).toHaveBeenCalledOnceWith(jasmine.objectContaining({ link: true, attribution: undefined }));
  });

  it('learns from the server that a second sign-in method has been connected', async () => {
    userData = { ...userData, google_user_id: 'g-me' };
    api.getCurrentUser.and.returnValue(of({
      status: 'success', user: { credits: 12, is_banned: false, discord_user_id: 'd-me', google_user_id: 'g-me' }
    } as CurrentUserResponse));
    expect(await service.validateSession()).toBeTrue();
    expect(userData.discord_user_id).toBe('d-me');
    expect(userData.google_user_id).toBe('g-me');
  });

  it('keeps the Discord reward offer through a credits refresh and a daily claim', async () => {
    const withReward = jasmine.createSpyObj<StableDiffusionService>('StableDiffusionService',
      ['getCurrentUser', 'googleLogin', 'discordLogin', 'getUserCredits', 'claimDailyBonus']);
    withReward.getUserCredits.and.returnValue(of({
      status: 'success', credits: 200, can_claim_daily_bonus: true, daily_bonus_streak: 0,
      discord_join_reward: { claimed: false, credits: 100 }
    }));
    withReward.claimDailyBonus.and.returnValue(of({ status: 'success', new_balance: 230, streak: 1, credits_awarded: 30, message: 'ok' } as any));
    const fresh = new AuthService(router, shared, withReward);
    let latest: any;
    fresh.credits$.subscribe(value => latest = value);

    await fresh.refreshCredits();
    expect(latest.discordJoinReward).toEqual({ claimed: false, credits: 100 });
    await fresh.claimDailyBonus();
    expect(latest.credits).toBe(230);
    expect(latest.discordJoinReward).toEqual({ claimed: false, credits: 100 });

    withReward.getUserCredits.and.returnValue(of({ status: 'success', credits: 230, can_claim_daily_bonus: false, daily_bonus_streak: 1 }));
    await fresh.refreshCredits();
    expect(latest.discordJoinReward).toBeNull();          // an older server that does not report it: nothing is offered
  });

  it('keeps stored auth state when startup session validation is temporarily unavailable', async () => {
    api.getCurrentUser.and.returnValue(throwError(() => ({ status: 503 })));

    const isValid = await service.validateSession();

    expect(isValid).toBeTrue();
    expect(api.getCurrentUser).toHaveBeenCalledTimes(3);
    expect(shared.setUserData).not.toHaveBeenCalledWith(null);
    expect(localStorage.getItem('authToken')).toBe('stored-token');
  });

  it('retries transient validation errors before accepting a valid session', async () => {
    const validResponse: CurrentUserResponse = {
      status: 'success',
      user: {
        credits: 30,
        daily_bonus_streak: 2,
        last_daily_bonus: '2026-06-26',
        is_banned: false
      }
    };
    api.getCurrentUser.and.returnValues(
      throwError(() => ({ status: 503 })),
      of(validResponse)
    );

    const isValid = await service.validateSession();

    expect(isValid).toBeTrue();
    expect(api.getCurrentUser).toHaveBeenCalledTimes(2);
    expect(shared.setUserData).toHaveBeenCalledWith(jasmine.objectContaining({
      credits: 30,
      daily_bonus_streak: 1,
      token: 'stored-token'
    }));
  });

  it('clears stored auth state when session validation receives a real 401', async () => {
    api.getCurrentUser.and.returnValue(throwError(() => ({ status: 401 })));

    const isValid = await service.validateSession();

    expect(isValid).toBeFalse();
    expect(api.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(shared.setUserData).toHaveBeenCalledWith(null);
    expect(localStorage.getItem('authToken')).toBeNull();
  });

  describe('sign-in round trip', () => {
    let redirect: jasmine.Spy;
    const sentTo = () => new URL(redirect.calls.mostRecent().args[0]);
    const sentState = () => sentTo().searchParams.get('state')!;

    beforeEach(() => {
      redirect = spyOn(service as any, 'redirect');
      localStorage.removeItem('pending-sign-in');
    });
    afterEach(() => localStorage.removeItem('pending-sign-in'));

    it('sends a one-time value to the provider and comes back to the page the visitor was on', () => {
      (router as any).url = '/video?ref=x#top';
      service.startLogin('google', 'login', 'animate');
      expect(sentTo().origin + sentTo().pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      const state = new URLSearchParams(sentState());
      expect(state.get('p')).toBe('google');
      expect(state.get('m')).toBe('login');
      expect(state.get('n')).toMatch(/^[0-9a-f]{32}$/);
      expect(service.readSignInReturn(sentState())).toEqual(
        { provider: 'google', link: false, verified: true, returnPath: '/video', cta: 'animate' });
    });

    it('uses a new value for every sign-in and accepts each return only once', () => {
      service.startLogin('discord');
      const first = sentState();
      expect(sentTo().origin + sentTo().pathname).toBe('https://discord.com/api/oauth2/authorize');
      service.startLogin('discord');
      const second = sentState();
      expect(first).not.toBe(second);
      expect(service.readSignInReturn(first).verified).toBeFalse();       // replaced by the second attempt
      service.startLogin('discord');
      const third = sentState();
      expect(service.readSignInReturn(third).verified).toBeTrue();
      expect(service.readSignInReturn(third).verified).toBeFalse();       // already used
    });

    it('does not trust a return this browser did not start', () => {
      const forged = service.readSignInReturn('p=discord&m=link&n=' + 'a'.repeat(32));
      expect(forged).toEqual({ provider: 'discord', link: true, verified: false, returnPath: '/', cta: undefined });
      expect(service.readSignInReturn(null)).toEqual(
        { provider: 'discord', link: false, verified: false, returnPath: '/', cta: undefined });

      // A real sign-in whose return was altered to ask for linking, or for the other provider.
      service.startLogin('discord');
      expect(service.readSignInReturn(sentState().replace('m=login', 'm=link'))).toEqual(
        jasmine.objectContaining({ link: true, verified: false }));
      service.startLogin('discord');
      expect(service.readSignInReturn(sentState().replace('p=discord', 'p=google')).verified).toBeFalse();
    });

    it('confirms a link request only when this browser started it', () => {
      (router as any).url = '/';
      service.startLink('discord');
      expect(new URLSearchParams(sentState()).get('m')).toBe('link');
      expect(service.readSignInReturn(sentState())).toEqual(
        { provider: 'discord', link: true, verified: true, returnPath: '/', cta: undefined });
    });

    it('stops trusting a sign-in that took longer than fifteen minutes', () => {
      service.startLogin('google');
      const state = sentState();
      const pending = JSON.parse(localStorage.getItem('pending-sign-in')!);
      localStorage.setItem('pending-sign-in', JSON.stringify({ ...pending, startedAt: Date.now() - 16 * 60 * 1000 }));
      expect(service.readSignInReturn(state).verified).toBeFalse();
    });

    it('still lets a plain sign-in start when storage is unavailable', () => {
      spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
      expect(() => service.startLogin('google')).not.toThrow();
      expect(redirect).toHaveBeenCalled();
    });

    it('never returns to sign-in plumbing, the admin area or another site', () => {
      const cases: [unknown, string][] = [
        ['/video', '/video'], ['/characters/abc?x=1#y', '/characters/abc'], ['/', '/'],
        ['/auth/callback?code=x', '/'], ['/admin', '/'], ['/admin/users', '/'],
        ['//evil.example/path', '/'], ['https://evil.example/', '/'], ['/\\evil.example', '/'],
        ['video', '/'], ['', '/'], [undefined, '/'], [null, '/'], [42, '/']
      ];
      for (const [path, expected] of cases) expect(safeReturnPath(path)).withContext(String(path)).toBe(expected);
    });

    it('reports the prompt and page behind a new sign-up, and announces the outcome once it completes', async () => {
      const response = { status: 'success', is_new_user: true, user_id: 'new-user', token: 'new-token' };
      api.googleLogin.and.returnValue(of(response));
      expect(service.authOutcome()).toBeNull();
      await service.exchangeCode('google', 'test-code', false, { cta: 'wait-screen', returnPath: '/video' });
      expect(api.googleLogin).toHaveBeenCalledOnceWith(jasmine.objectContaining({
        code: 'test-code', link: false,
        attribution: jasmine.objectContaining({ signup_cta: 'wait-screen', signup_path: '/video' })
      }));
      expect(service.authOutcome()).toEqual(
        { provider: 'google', userId: 'new-user', isNewUser: true, linked: false, response });
    });

    it('does not announce a returning user or a linked sign-in method as a new account', async () => {
      api.discordLogin.and.returnValue(of({ status: 'success', is_new_user: false, user_id: 'user-1', token: 't' }));
      await service.exchangeCode('discord', 'test-code');
      expect(service.authOutcome()).toEqual(jasmine.objectContaining({ isNewUser: false, linked: false }));
      api.discordLogin.and.returnValue(of({ status: 'success', is_new_user: true, user_id: 'user-1', token: 't' }));
      await service.exchangeCode('discord', 'link-code', true);
      expect(service.authOutcome()).toEqual(jasmine.objectContaining({ isNewUser: false, linked: true }));
    });

    it('announces nothing when the exchange fails', async () => {
      api.googleLogin.and.returnValue(throwError(() => ({ status: 400, error: { detail: 'Bad code' } })));
      await expectAsync(service.exchangeCode('google', 'bad-code')).toBeRejected();
      expect(service.authOutcome()).toBeNull();
    });
  });
});
