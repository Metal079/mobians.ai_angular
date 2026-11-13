import { Component, Input, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { SharedService } from 'src/app/shared.service';
import { AccountCtaService } from 'src/app/auth/account-cta.service';
import { trackEvent } from 'src/app/analytics';

/**
 * A sign-up prompt for visitors with no account, shown where an account would
 * help them: while they wait in the free queue ('wait', placed inside the image
 * grid) and under a finished result ('result'). It never limits or blocks
 * anything; it can be closed, and it disappears for anyone who is signed in.
 */
export type SignupNudgeVariant = 'wait' | 'result';

/** A wait shorter than this is not worth interrupting. */
export const WAIT_NUDGE_DELAY_MS = 8000;
const RESULT_NUDGE_QUIET_MS = 7 * 24 * 60 * 60 * 1000;
const WAIT_DISMISSED_KEY = 'signup-nudge-wait-dismissed';            // sessionStorage: until the tab closes
const RESULT_DISMISSED_UNTIL_KEY = 'signup-nudge-result-quiet-until'; // localStorage: a week

@Component({
  selector: 'app-signup-nudge',
  templateUrl: './signup-nudge.component.html',
  styleUrls: ['./signup-nudge.component.css'],
  standalone: true
})
export class SignupNudgeComponent implements OnInit, OnDestroy {
  @Input() variant: SignupNudgeVariant = 'wait';
  /** One short line, for a grid too low to show the full text without covering the queue status. */
  @Input() compact = false;

  private readonly shared = inject(SharedService);
  private readonly accountCta = inject(AccountCtaService);
  private readonly signedIn = toSignal(this.shared.getUserData().pipe(map(user => !!user)),
    { initialValue: !!this.shared.getUserDataValue() });
  private readonly ready = signal(false);
  private readonly dismissed = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  private viewReported = false;

  readonly visible = computed(() => this.ready() && !this.dismissed() && !this.signedIn());

  constructor() {
    effect(() => {
      if (this.visible() && !this.viewReported) {
        this.viewReported = true;
        trackEvent('signup_prompt_view', { placement: this.variant });
      }
    });
  }

  ngOnInit(): void {
    this.dismissed.set(this.wasDismissed());
    if (this.variant === 'wait') {
      this.timer = setTimeout(() => this.ready.set(true), WAIT_NUDGE_DELAY_MS);
    } else {
      this.ready.set(true);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  signIn(): void {
    trackEvent('signup_prompt_click', { placement: this.variant });
    this.accountCta.requestLogin({ reason: this.variant === 'wait' ? 'wait-screen' : 'results' });
  }

  dismiss(): void {
    this.dismissed.set(true);
    try {
      if (this.variant === 'wait') sessionStorage.setItem(WAIT_DISMISSED_KEY, '1');
      else localStorage.setItem(RESULT_DISMISSED_UNTIL_KEY, String(Date.now() + RESULT_NUDGE_QUIET_MS));
    } catch {
      // Storage unavailable: it stays closed until this component is created again.
    }
  }

  private wasDismissed(): boolean {
    try {
      if (this.variant === 'wait') return sessionStorage.getItem(WAIT_DISMISSED_KEY) === '1';
      return Number(localStorage.getItem(RESULT_DISMISSED_UNTIL_KEY)) > Date.now();
    } catch {
      return false;
    }
  }
}
