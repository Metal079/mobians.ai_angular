import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { asyncScheduler, observeOn, Subscription } from 'rxjs';
import { SharedService } from '../shared.service';
import { AuthService, UserCredits } from './auth.service';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CreditsPurchaseComponent } from './credits-purchase.component';

@Component({
    selector: 'app-profile-menu',
    templateUrl: './profile-menu.component.html',
    styleUrls: ['./profile-menu.component.css'],
    standalone: true,
    imports: [CommonModule, RouterLink, ButtonModule, CreditsPurchaseComponent]
})
export class ProfileMenuComponent implements OnInit, OnDestroy {
  @Output() loginRequest = new EventEmitter<void>();
  
  isLoggedIn = false;
  hasDiscord = false;
  hasGoogle = false;
  isAdmin = false;
  isMinimized = false;
  userName: string | null = null;
  credits = 0;
  canClaimDailyBonus = false;
  dailyStreak = 0;
  nextDailyBonusFromServer: number | null = null;
  claimingBonus = false;
  showPurchaseDialog = false;

  // Daily bonus configuration
  private readonly DAILY_BASE = 30;
  private readonly DAILY_INCREMENT = 10;
  private readonly DAILY_CAP = 50;

  private subscriptions: Subscription[] = [];

  // Responsive panel styles
  panelStyles = {
    padding: '.85rem',
    borderRadius: '.75rem'
  };

  constructor(
    private shared: SharedService, 
    private auth: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    // Subscribe to user data changes
    const userSub = this.shared.getUserData().pipe(observeOn(asyncScheduler)).subscribe(user => {
      this.isLoggedIn = !!user && (!!user.discord_user_id || !!user.google_user_id || !!user.user_id);
      this.hasDiscord = !!user?.discord_user_id;
      this.hasGoogle = !!user?.google_user_id;
      this.isAdmin = !!user?.has_required_role;
      this.userName = user?.display_name || user?.username || null;
    });
    this.subscriptions.push(userSub);

    // Subscribe to credits changes
    const creditsSub = this.auth.credits$.pipe(observeOn(asyncScheduler)).subscribe(creditsData => {
      if (creditsData) {
        this.credits = creditsData.credits;
        this.canClaimDailyBonus = this.coerceBoolean(creditsData.canClaimDailyBonus);
        this.dailyStreak = Math.max(creditsData.dailyBonusStreak || 0, 0);
        this.nextDailyBonusFromServer = this.normalizeServerBonus(creditsData.nextDailyBonus);
      } else {
        this.credits = 0;
        this.canClaimDailyBonus = false;
        this.dailyStreak = 0;
        this.nextDailyBonusFromServer = null;
      }
    });
    this.subscriptions.push(creditsSub);

    // Refresh credits on init if logged in
    if (this.auth.isLoggedIn()) {
      setTimeout(() => {
        void this.auth.refreshCredits();
      }, 0);
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get nextDailyBonus(): number {
    return this.nextDailyBonusFromServer ?? this.calculateDailyBonus(this.dailyStreak);
  }

  async claimDaily() {
    if (this.claimingBonus) return;
    
    const creditsBefore = this.credits;
    this.claimingBonus = true;
    try {
      const result = await this.auth.claimDailyBonus();
      if (result.success) {
        const streakAfterClaim = result.streak ?? this.dailyStreak;
        const claimedAmount = result.creditsAwarded !== undefined
          ? result.creditsAwarded
          : result.newBalance !== undefined
            ? Math.max(result.newBalance - creditsBefore, 0)
            : this.calculateClaimedBonusFromStreak(streakAfterClaim);
        const balanceText = result.newBalance !== undefined ? ` New balance: ${result.newBalance}` : '';

        this.dailyStreak = streakAfterClaim ?? 0;
        this.credits = result.newBalance ?? this.credits;

        this.messageService.add({
          severity: 'success',
          summary: 'Daily Bonus!',
          detail: `+${claimedAmount} credits!${balanceText}`,
          life: 3000
        });
        // Hide the claim button immediately after a successful claim
        this.canClaimDailyBonus = false;
      } else {
        this.messageService.add({
          severity: 'warn',
          summary: 'Already Claimed',
          detail: result.message,
          life: 3000
        });
        // Prevent the button from showing again if already claimed today
        this.canClaimDailyBonus = false;
      }
      // Refresh credits state to stay in sync with the server
      this.auth.refreshCredits();
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to claim daily bonus',
        life: 3000
      });
    } finally {
      this.claimingBonus = false;
    }
  }

  login() {
    this.loginRequest.emit();
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
  }

  link(provider: 'google' | 'discord') {
    this.auth.startLink(provider);
  }

  openPurchaseDialog() {
    this.showPurchaseDialog = true;
  }

  onPurchaseComplete(creditsAdded: number) {
    // Credits are already updated by the purchase component via auth service
    // This is just for any additional handling if needed
  }
  
  logout() { 
    this.auth.logout(); 
  }

  private calculateDailyBonus(streak: number | null | undefined): number {
    const safeStreak = Math.max(streak || 0, 0);
    return Math.min(
      this.DAILY_BASE + safeStreak * this.DAILY_INCREMENT,
      this.DAILY_CAP
    );
  }

  private calculateClaimedBonusFromStreak(streak: number | null | undefined): number {
    if (streak === null || streak === undefined) {
      return this.calculateDailyBonus(this.dailyStreak);
    }
    const previousStreak = Math.max(streak - 1, 0);
    return this.calculateDailyBonus(previousStreak);
  }

  private normalizeServerBonus(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    return Math.round(value);
  }

  private coerceBoolean(value: unknown): boolean {
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
    return !!value;
  }
}
