import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SharedService } from '../shared.service';
import { CurrentUserResponse, StableDiffusionService } from '../stable-diffusion.service';
import { AuthService } from './auth.service';

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

    api = jasmine.createSpyObj<StableDiffusionService>('StableDiffusionService', ['getCurrentUser']);
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
