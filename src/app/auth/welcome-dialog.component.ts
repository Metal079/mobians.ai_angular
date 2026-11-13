import { Component, OnDestroy, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { AuthOutcome, AuthService } from './auth.service';
import { trackEvent } from '../analytics';

/**
 * A one-time welcome for a brand-new account, pointing at video as the best
 * first use of the 200 sign-up credits.
 *
 * It is shown to HALF of new accounts on purpose (decided 2026-11-13). New
 * accounts that make a video on their first day come back twice as often, but
 * that could simply be the kind of person who makes videos. Showing this to
 * every other new account tells us whether steering people to video causes more
 * of them to return. The half is chosen from the account id alone, so the two
 * groups can be compared in the database with no extra tracking:
 *
 *   -- welcome group = even last hex digit of users.id
 *   SELECT ('x' || right(u.id::text, 1))::bit(4)::int % 2 = 0 AS saw_welcome, COUNT(*) AS signups, ...
 *   FROM users u WHERE u.created_at >= '<date this shipped>' GROUP BY 1;
 *
 * Compare first-day video use (credit_transactions.transaction_type = 'video_generation')
 * and activity on days 1 to 7 (credit_transactions and generation_job_history).
 * When the question is answered, show it to everyone (or drop it) by changing isInWelcomeGroup.
 */
export function isInWelcomeGroup(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const lastDigit = parseInt(userId.trim().slice(-1), 16);
  return Number.isInteger(lastDigit) && lastDigit % 2 === 0;
}

/** Give the post-sign-in navigation time to finish before deciding where the visitor is. */
const SHOW_DELAY_MS = 800;
const FIRST_DAILY_BONUS = 30;

@Component({
  selector: 'app-welcome-dialog',
  templateUrl: './welcome-dialog.component.html',
  styleUrls: ['./welcome-dialog.component.css'],
  standalone: true,
  imports: [DialogModule, ButtonModule]
})
export class WelcomeDialogComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly credits = toSignal(this.auth.credits$, { initialValue: null });
  private handled: AuthOutcome | null = null;
  private timer?: ReturnType<typeof setTimeout>;

  readonly visible = signal(false);
  readonly claiming = signal(false);
  /** Shown under the buttons after a claim attempt. */
  readonly claimMessage = signal('');
  readonly claimed = signal(false);

  constructor() {
    effect(() => {
      const outcome = this.auth.authOutcome();
      if (!outcome || outcome === this.handled) return;
      this.handled = outcome;
      if (!outcome.isNewUser || !isInWelcomeGroup(outcome.userId)) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.showUnlessAlreadyOnVideo(), SHOW_DELAY_MS);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  get creditBalance(): number {
    return this.credits()?.credits ?? 200;
  }

  get dailyBonusAmount(): number {
    return this.credits()?.nextDailyBonus || FIRST_DAILY_BONUS;
  }

  makeVideo(): void {
    trackEvent('welcome_dialog_action', { action: 'video' });
    this.visible.set(false);
    void this.router.navigateByUrl('/video');
  }

  async claimDailyBonus(): Promise<void> {
    if (this.claiming() || this.claimed()) return;
    trackEvent('welcome_dialog_action', { action: 'claim' });
    this.claiming.set(true);
    const result = await this.auth.claimDailyBonus();
    this.claiming.set(false);
    this.claimed.set(result.success);
    this.claimMessage.set(result.success
      ? `+${result.creditsAwarded ?? this.dailyBonusAmount} credits added. Come back tomorrow for more: the bonus grows each day you claim it.`
      : result.message);
  }

  later(): void {
    trackEvent('welcome_dialog_action', { action: 'later' });
    this.visible.set(false);
  }

  /** Closing with the X or by clicking outside counts as "later". */
  onVisibleChange(visible: boolean): void {
    if (!visible && this.visible()) this.later();
  }

  private showUnlessAlreadyOnVideo(): void {
    // Someone who signed up through "make a video from this image" is already where this would send them.
    if ((this.router.url || '').split(/[?#]/)[0].startsWith('/video')) return;
    this.claimMessage.set('');
    this.claimed.set(false);
    this.visible.set(true);
    trackEvent('welcome_dialog_action', { action: 'shown' });
  }
}
