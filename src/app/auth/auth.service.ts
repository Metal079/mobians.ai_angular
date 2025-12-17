import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SharedService } from '../shared.service';
import { StableDiffusionService } from '../stable-diffusion.service';
import { sessionInvalid$ } from './auth.interceptor';

export type AuthProvider = 'discord' | 'google';
type AuthMode = 'login' | 'link';

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
  private _credits$ = new BehaviorSubject<UserCredits | null>(null);
  public credits$ = this._credits$.asObservable();
  
  // Subject to notify components that session is invalid and login is required
  private _sessionInvalid$ = new Subject<void>();
  public sessionInvalid$ = this._sessionInvalid$.asObservable();

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
      const response = await this.api.getCurrentUser().toPromise();
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
              canClaimDailyBonus: current?.canClaimDailyBonus ?? false,
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
      }
      return false;
    }
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
      const response = await this.api.getUserCredits().toPromise();
      if (response?.status === 'success') {
        const creditsData: UserCredits = {
          credits: response.credits,
          canClaimDailyBonus: response.can_claim_daily_bonus,
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
      const response = await this.api.claimDailyBonus().toPromise();
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

  startLogin(provider: AuthProvider, mode: AuthMode = 'login') {
    const state = encodeURIComponent(`p=${provider}&m=${mode}`);
    const redirectUri = encodeURIComponent(environment.oauthRedirectUri || environment.discordRedirectUri);
    if (provider === 'discord') {
      const clientId = environment.discordClientId || '';
      const scope = encodeURIComponent('identify guilds');
      const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
      window.location.href = url;
      return;
    }
    if (provider === 'google') {
      const clientId = environment.googleClientId || '';
      const scope = encodeURIComponent('openid email profile');
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=online&include_granted_scopes=true&state=${state}`;
      window.location.href = url;
      return;
    }
  }

  startLink(provider: AuthProvider) {
    this.startLogin(provider, 'link');
  }

  async exchangeCode(provider: AuthProvider, code: string, link = false): Promise<void> {
    const redirect_uri = environment.oauthRedirectUri || environment.discordRedirectUri;
    if (provider === 'discord') {
      return new Promise((resolve, reject) => {
        this.api.discordLogin({ code, link, redirect_uri }).subscribe({
          next: (resp) => {
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
            resolve();
          },
          error: (err) => reject(err)
        });
      });
    }
    if (provider === 'google') {
      return new Promise((resolve, reject) => {
        this.api.googleLogin({ code, link, redirect_uri }).subscribe({
          next: (resp) => {
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
            resolve();
          },
          error: (err) => reject(err)
        });
      });
    }
    return Promise.resolve();
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
