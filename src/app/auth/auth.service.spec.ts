import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SharedService } from '../shared.service';
import { CurrentUserResponse, StableDiffusionService } from '../stable-diffusion.service';
import { AuthService } from './auth.service';
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
});
