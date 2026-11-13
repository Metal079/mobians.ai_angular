import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SharedService } from '../shared.service';
import {
  AuthExchangeResponse,
  CurrentUserResponse,
  DailyBonusResponse,
  StableDiffusionService,
  UserCreditsResponse
} from '../stable-diffusion.service';
import { sessionInvalid$ } from './auth.interceptor';
import { CompletedSignupTracker } from './signup-tracking';
import { buildSignupAttribution } from '../first-touch';

export type AuthProvider = 'discord' | 'google';
type AuthMode = 'login' | 'link';

// --- Sign-in round trip -------------------------------------------------------
// Signing in leaves the site for Google or Discord and comes back to
// /auth/callback. What the visitor was doing is remembered here across that trip,
// tied to a one-time random value that also travels in the provider's `state`.
// Only a return that carries the same value is trusted to (a) go back to the page
// the visitor started from and (b) link a second sign-in method to the current
// account. Without that check, a crafted link could attach someone else's Discord
// or Google account to a signed-in visitor's account.
const PENDING_SIGN_IN_KEY = 'pending-sign-in';
const PENDING_SIGN_IN_MAX_AGE_MS = 15 * 60 * 1000;

interface PendingSignIn {
  nonce: string;
  provider: AuthProvider;
  mode: AuthMode;
  returnPath: string;
  /** Which prompt opened the sign-in, e.g. 'wait-screen'. */
  cta?: string;
  startedAt: number;
}

/** What the callback page learns from the provider's `state` plus the remembered trip. */
export interface SignInReturn {
  provider: AuthProvider;
  /** The return asks to link a second sign-in method to the current account. */
  link: boolean;
  /** The return matches a sign-in this browser started in the last few minutes. */
  verified: boolean;
  /** Where to go afterwards; always a safe in-site path. */
  returnPath: string;
  cta?: string;
}

/** The result of the most recent completed sign-in, for one-time follow-ups such as the welcome message. */
export interface AuthOutcome {
  provider: AuthProvider;
  userId: string | null;
  isNewUser: boolean;
  linked: boolean;
  response: AuthExchangeResponse;
}

/** Only ever send a visitor to a page of this site, never to sign-in plumbing or the admin area. */
export function safeReturnPath(path: unknown): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
  const clean = path.split(/[?#]/)[0];
  if (clean.startsWith('/auth') || clean.startsWith('/admin')) return '/';
  return clean;
}

export interface UserCredits {
  credits: number;
  canClaimDailyBonus: boolean;
  dailyBonusStreak: number;
  lastDailyBonus?: string | null;
  nextDailyBonus?: number;
  nextDailyBonusStreak?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly signupTracker = new CompletedSignupTracker();
  private _credits$ = new BehaviorSubject<UserCredits | null>(null);
  public credits$ = this._credits$.asObservable();
  private readonly sessionValidationRetryDelaysMs = [500, 1500];
  
  // Subject to notify components that session is invalid and login is required
  private _sessionInvalid$ = new Subject<void>();
  public sessionInvalid$ = this._sessionInvalid$.asObservable();

  /** Set once each time a sign-in completes; null until then. */
  readonly authOutcome = signal<AuthOutcome | null>(null);

  constructor(
    private router: Router,
    private shared: SharedService,
    private api: StableDiffusionService
  ) {
    // Initialize credits from stored user data
    this.initializeCreditsFromStorage();
    
    // Subscribe to global session invalid events from interceptor
    sessionInvalid$.subscribe(() => {
      this.handleSessionInvalid();
    });
  }

  /**
   * Handle session invalidation - clear local state and notify subscribers
   */
  private handleSessionInvalid(): void {
    // Clear the BehaviorSubject state
    this.shared.setUserData(null);
    this._credits$.next(null);
    // Notify subscribers (e.g., to show login modal)
    this._sessionInvalid$.next();
  }

  /**
   * Validate the current session token with the backend.
   * Returns true if session is valid, false otherwise.
   * If invalid, clears local auth state.
   */
  async validateSession(): Promise<boolean> {
    // If no token stored, session is invalid
    const token = this.getToken();
    if (!token) {
      return false;
    }
    
    try {
      const response = await this.getCurrentUserWithRetry();
      if (response?.status === 'success' && response?.user) {
        // Token is valid - optionally update local user data with fresh info
        const userData = this.shared.getUserDataValue();
        if (userData && response.user) {
          // Update credits and other fields that may have changed
          this.shared.setUserData({
            ...userData,
            credits: response.user.credits ?? userData.credits,
            is_banned: response.user.is_banned ?? userData.is_banned,
          });
          // Update credits observable
          if (response.user.credits !== undefined) {
            const current = this._credits$.value;
            this._credits$.next({
              credits: response.user.credits,
              canClaimDailyBonus: this.normalizeCanClaimDailyBonus(current?.canClaimDailyBonus),
              dailyBonusStreak: response.user.daily_bonus_streak ?? current?.dailyBonusStreak ?? 0,
              lastDailyBonus: response.user.last_daily_bonus ?? current?.lastDailyBonus ?? null,
              nextDailyBonus: current?.nextDailyBonus,
              nextDailyBonusStreak: current?.nextDailyBonusStreak
            });
          }
        }
        return true;
      }
      // Response didn't have expected data
      this.clearAuthState();
      return false;
    } catch (err: any) {
      // 401 will be handled by interceptor, but also handle here for completeness
      if (err?.status === 401) {
        this.clearAuthState();
        return false;
      }
      if (this.isTransientSessionValidationError(err)) {
        console.warn('Session validation could not reach the backend; keeping stored auth state.', err);
        return true;
      }
      return false;
    }
  }

  private async getCurrentUserWithRetry(): Promise<CurrentUserResponse> {
    let lastError: unknown;
    const attempts = this.sessionValidationRetryDelaysMs.length + 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await firstValueFrom(this.api.getCurrentUser());
      } catch (err) {
        lastError = err;
        if (!this.isTransientSessionValidationError(err) || attempt === attempts - 1) {
          throw err;
        }
        await this.delay(this.sessionValidationRetryDelaysMs[attempt]);
      }
    }

    throw lastError;
  }

  private isTransientSessionValidationError(err: unknown): boolean {
    const status = (err as { status?: number } | null)?.status;
    return status === 0 || status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear all local authentication state
   */
  private clearAuthState(): void {
    try {
      localStorage.removeItem('userData');
      localStorage.removeItem('authToken');
    } catch {}
    this.shared.setUserData(null);
    this._credits$.next(null);
  }

  private initializeCreditsFromStorage(): void {
    const userData = this.shared.getUserDataValue();
    if (userData?.credits !== undefined) {
      // Default canClaimDailyBonus to false until server confirms
      // This prevents showing the claim button before we verify with the server
      this._credits$.next({
        credits: userData.credits,
        canClaimDailyBonus: false,
        dailyBonusStreak: userData.daily_bonus_streak || 0,
        lastDailyBonus: userData.last_daily_bonus ?? null
      });
    }
  }

  /**
   * Check if daily bonus can be claimed based on last claim date.
   * Uses UTC to match server-side logic.
   */
  private canClaimDaily(lastDailyBonus: string | null): boolean {
    if (!lastDailyBonus) return true;
    // Use UTC date to match server
    const now = new Date();
    const todayUTC = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    return lastDailyBonus !== todayUTC;
  }

  private normalizeCanClaimDailyBonus(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value > 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1';
    }
    return false;
  }

  getToken(): string | null {
    const userData = this.shared.getUserDataValue();
    return userData?.token || null;
  }

  getCredits(): number {
    return this._credits$.value?.credits || 0;
  }

  updateCredits(credits: number): void {
    const current = this._credits$.value;
    if (current) {
      this._credits$.next({ ...current, credits });
    } else {
      this._credits$.next({
        credits,
        canClaimDailyBonus: true,
        dailyBonusStreak: 0
      });
    }
    // Also update in shared service
    const userData = this.shared.getUserDataValue();
    if (userData) {
      this.shared.setUserData({ ...userData, credits });
    }
  }

  async refreshCredits(): Promise<UserCredits | null> {
    if (!this.isLoggedIn()) return null;
    
    try {
      const response: UserCreditsResponse = await firstValueFrom(this.api.getUserCredits());
      if (response?.status === 'success') {
        const creditsData: UserCredits = {
          credits: response.credits,
          canClaimDailyBonus: this.normalizeCanClaimDailyBonus(response.can_claim_daily_bonus),
          dailyBonusStreak: response.daily_bonus_streak,
          lastDailyBonus: response.last_daily_bonus,
          nextDailyBonus: response.next_daily_bonus,
          nextDailyBonusStreak: response.next_daily_bonus_streak
        };
        this._credits$.next(creditsData);
        
        // Update stored user data
        const userData = this.shared.getUserDataValue();
        if (userData) {
          this.shared.setUserData({
            ...userData,
            credits: response.credits,
            last_daily_bonus: response.last_daily_bonus ?? userData.last_daily_bonus ?? null,
            daily_bonus_streak: response.daily_bonus_streak
          });
        }
        return creditsData;
      }
    } catch (err) {
      console.error('Failed to refresh credits:', err);
    }
    return null;
  }

  async claimDailyBonus(): Promise<{ success: boolean; message: string; newBalance?: number; streak?: number; creditsAwarded?: number }> {
    if (!this.isLoggedIn()) {
      return { success: false, message: 'Not logged in' };
    }
    
    try {
      const response: DailyBonusResponse = await firstValueFrom(this.api.claimDailyBonus());
      if (response?.status === 'success') {
        // Update credits
        this._credits$.next({
          credits: response.new_balance,
          canClaimDailyBonus: false,
          dailyBonusStreak: response.streak
        });
        
        // Update stored user data
        const userData = this.shared.getUserDataValue();
        if (userData) {
          this.shared.setUserData({
            ...userData,
            credits: response.new_balance,
            last_daily_bonus: new Date().toISOString().split('T')[0],
            daily_bonus_streak: response.streak
          });
        }
        
        return {
          success: true,
          message: response.message,
          newBalance: response.new_balance,
          streak: response.streak,
          creditsAwarded: response.credits_awarded
        };
      }
      return { success: false, message: 'Failed to claim daily bonus' };
    } catch (err: any) {
      const message = err?.error?.detail || 'Failed to claim daily bonus';
      return { success: false, message };
    }
  }

  hasDiscord(): boolean {
    return !!(environment.discordClientId && environment.oauthRedirectUri);
  }

  hasGoogle(): boolean {
    return !!(environment.googleClientId && environment.oauthRedirectUri);
  }

  hasAuth0(): boolean {
    return false; // Auth0 is not currently configured
  }

  loginAuth0() {
    // Auth0 is not currently configured
  }

  isLoggedIn(): boolean {
    const user = this.shared.getUserDataValue();
    return !!user && (user.discord_user_id || user.google_user_id || user.user_id);
  }

  getUserId(): string | null {
    const user = this.shared.getUserDataValue();
    return user?.user_id ? String(user.user_id) : null;
  }

  /**
   * Leave for the provider's sign-in page. `cta` names the prompt that led here
   * (kept for the sign-up report); the page the visitor is on is remembered so the
   * callback can bring them back to it.
   */
  startLogin(provider: AuthProvider, mode: AuthMode = 'login', cta?: string) {
    const nonce = this.newNonce();
    this.rememberPendingSignIn({
      nonce, provider, mode, cta,
      returnPath: safeReturnPath(this.router.url),
      startedAt: Date.now()
    });
    const state = encodeURIComponent(`p=${provider}&m=${mode}&n=${nonce}`);
    const redirectUri = encodeURIComponent(environment.oauthRedirectUri || environment.discordRedirectUri);
    if (provider === 'discord') {
      const clientId = environment.discordClientId || '';
      const scope = encodeURIComponent('identify guilds');
      this.redirect(`https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`);
      return;
    }
    if (provider === 'google') {
      const clientId = environment.googleClientId || '';
      const scope = encodeURIComponent('openid email profile');
      this.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=online&include_granted_scopes=true&state=${state}`);
      return;
    }
  }

  startLink(provider: AuthProvider) {
    this.startLogin(provider, 'link');
  }

  /**
   * Read the provider's `state` on the callback page and match it against the
   * sign-in this browser started. The remembered trip is used up by this call.
   */
  readSignInReturn(state: string | null): SignInReturn {
    const fields = new URLSearchParams(state || '');
    const provider: AuthProvider = fields.get('p') === 'google' ? 'google' : 'discord';
    const mode: AuthMode = fields.get('m') === 'link' ? 'link' : 'login';
    const pending = this.takePendingSignIn();
    const verified = !!pending && !!pending.nonce && pending.nonce === fields.get('n')
      && pending.provider === provider && pending.mode === mode
      && Date.now() - pending.startedAt <= PENDING_SIGN_IN_MAX_AGE_MS;
    return {
      provider,
      link: mode === 'link',
      verified,
      returnPath: verified ? safeReturnPath(pending!.returnPath) : '/',
      cta: verified ? pending!.cta : undefined
    };
  }

  /** Complete a sign-in with the one-time code the provider sent back. */
  async exchangeCode(
    provider: AuthProvider,
    code: string,
    link = false,
    context: Pick<SignInReturn, 'cta' | 'returnPath'> = { returnPath: '/' }
  ): Promise<void> {
    const redirect_uri = environment.oauthRedirectUri || environment.discordRedirectUri;
    // Where this visitor came from; the backend stores it only if this creates a new account.
    const attribution = link ? undefined : buildSignupAttribution({
      signup_cta: context.cta,
      signup_path: context.cta || context.returnPath !== '/' ? context.returnPath : undefined
    });
    const request = { code, link, redirect_uri, attribution };
    const resp = await firstValueFrom(provider === 'google' ? this.api.googleLogin(request) : this.api.discordLogin(request));

    this.shared.setUserData(resp);
    // Store token separately for HTTP interceptor
    if (resp.token) {
      try {
        localStorage.setItem('authToken', resp.token);
      } catch {}
    }
    // Initialize credits - default canClaimDailyBonus to false, server will confirm
    if (resp.credits !== undefined) {
      this._credits$.next({
        credits: resp.credits,
        canClaimDailyBonus: false,
        dailyBonusStreak: resp.daily_bonus_streak || 0
      });
      // Refresh from server to get accurate can_claim_daily_bonus
      this.refreshCredits();
    }
    this.signupTracker.record(resp, provider, link);
    this.authOutcome.set({
      provider,
      userId: resp.user_id != null ? String(resp.user_id) : null,
      isNewUser: !link && resp.is_new_user === true,
      linked: link,
      response: resp
    });
  }

  /** Separate so tests can observe the destination without leaving the page. */
  private redirect(url: string): void {
    window.location.href = url;
  }

  private newNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // localStorage rather than sessionStorage: on phones the provider often returns
  // in a new tab of the same browser, which does not share session storage.
  private rememberPendingSignIn(pending: PendingSignIn): void {
    try {
      localStorage.setItem(PENDING_SIGN_IN_KEY, JSON.stringify(pending));
    } catch {
      // Without storage the return cannot be verified: a plain sign-in still
      // works and lands on the home page; linking is refused.
    }
  }

  private takePendingSignIn(): PendingSignIn | null {
    try {
      const stored = localStorage.getItem(PENDING_SIGN_IN_KEY);
      localStorage.removeItem(PENDING_SIGN_IN_KEY);
      const pending = stored ? JSON.parse(stored) : null;
      return pending && typeof pending.nonce === 'string' && typeof pending.startedAt === 'number' ? pending : null;
    } catch {
      return null;
    }
  }

  logout() {
    try {
      localStorage.removeItem('userData');
      localStorage.removeItem('authToken');
    } catch {}
    this.shared.setUserData(null);
    this._credits$.next(null);
    this.router.navigateByUrl('/');
  }

  /**
   * Check if the current user has admin/mod privileges.
   * This is determined by the has_required_role flag from Discord login.
   */
  isAdmin(): boolean {
    const user = this.shared.getUserDataValue();
    return !!user?.has_required_role;
  }
}
