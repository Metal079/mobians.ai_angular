import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { AuthCallbackComponent } from './auth-callback.component';
import { AuthService, SignInReturn } from './auth.service';

describe('AuthCallbackComponent', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  let logged: jasmine.Spy[];

  const verifiedReturn: SignInReturn = { provider: 'google', link: false, verified: true, returnPath: '/video', cta: 'animate' };

  // One route object for the whole test; each arrival swaps in its own address.
  const route: { snapshot?: { queryParamMap: ReturnType<typeof convertToParamMap> } } = {};

  async function arrive(query: Record<string, string>, signIn: SignInReturn = verifiedReturn): Promise<AuthCallbackComponent> {
    auth.readSignInReturn.and.returnValue(signIn);
    route.snapshot = { queryParamMap: convertToParamMap(query) };
    const fixture = TestBed.createComponent(AuthCallbackComponent);
    await fixture.componentInstance.handleCallback();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['readSignInReturn', 'exchangeCode']);
    auth.exchangeCode.and.resolveTo();
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);
    logged = [spyOn(console, 'log'), spyOn(console, 'error'), spyOn(console, 'warn')];
    TestBed.configureTestingModule({
      imports: [AuthCallbackComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route }
      ]
    });
  });

  it('completes a verified sign-in and returns to the page the visitor started from', async () => {
    const page = await arrive({ code: 'one-time-code', state: 'p=google&m=login&n=abc' });
    expect(auth.readSignInReturn).toHaveBeenCalledOnceWith('p=google&m=login&n=abc');
    expect(auth.exchangeCode).toHaveBeenCalledOnceWith('google', 'one-time-code', false, verifiedReturn);
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/video');
    expect(page.error).toBeNull();
  });

  it('still completes a plain sign-in it cannot verify, landing on the home page', async () => {
    const unverified: SignInReturn = { provider: 'discord', link: false, verified: false, returnPath: '/', cta: undefined };
    await arrive({ code: 'one-time-code', state: 'p=discord&m=login' }, unverified);
    expect(auth.exchangeCode).toHaveBeenCalledOnceWith('discord', 'one-time-code', false, unverified);
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/');
  });

  it('refuses to link a sign-in method for a request this browser did not start', async () => {
    const page = await arrive({ code: 'attackers-code', state: 'p=discord&m=link&n=forged' },
      { provider: 'discord', link: true, verified: false, returnPath: '/', cta: undefined });
    expect(auth.exchangeCode).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(page.error).toContain('start again from the Account panel');
  });

  it('links when this browser started the request', async () => {
    const link: SignInReturn = { provider: 'discord', link: true, verified: true, returnPath: '/', cta: undefined };
    await arrive({ code: 'one-time-code', state: 'p=discord&m=link&n=abc' }, link);
    expect(auth.exchangeCode).toHaveBeenCalledOnceWith('discord', 'one-time-code', true, link);
  });

  it("shows the provider's or the server's own message when sign-in fails", async () => {
    let page = await arrive({ error: 'access_denied', error_description: 'You cancelled the sign-in.' });
    expect(page.error).toBe('You cancelled the sign-in.');
    expect(auth.readSignInReturn).not.toHaveBeenCalled();

    page = await arrive({ state: 'p=google&m=login&n=abc' });
    expect(page.error).toContain('No authorization code');

    auth.exchangeCode.and.rejectWith({ status: 409, error: { detail: 'That Discord account already has its own Mobians account.' } });
    page = await arrive({ code: 'one-time-code', state: 'p=discord&m=link&n=abc' },
      { provider: 'discord', link: true, verified: true, returnPath: '/', cta: undefined });
    expect(page.error).toBe('That Discord account already has its own Mobians account.');

    auth.exchangeCode.and.rejectWith(new Error('network'));
    page = await arrive({ code: 'one-time-code', state: 'p=google&m=login&n=abc' });
    expect(page.error).toBe('Failed to complete sign in. Please try again.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('never writes the one-time code to the console', async () => {
    await arrive({ code: 'SECRET-ONE-TIME-CODE', state: 'p=google&m=login&n=abc' });
    auth.exchangeCode.and.rejectWith({ status: 400, error: { detail: 'Bad code' } });
    await arrive({ code: 'SECRET-ONE-TIME-CODE', state: 'p=google&m=login&n=abc' });
    for (const spy of logged) expect(JSON.stringify(spy.calls.allArgs())).not.toContain('SECRET-ONE-TIME-CODE');
  });
});
