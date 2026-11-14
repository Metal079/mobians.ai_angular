import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MutableCategory, NotificationService } from '../notification.service';

/**
 * The way out for browsers whose notifications have no buttons (Safari, iOS and
 * some others). Reminder and news notifications normally carry a "Turn off"
 * button; where that is not shown, tapping the notification brings the site
 * forward and this bar offers the same thing in one tap. A tap that opens a new
 * tab arrives with ?push=reminders or ?push=news; a tap while the site is
 * already open is reported by the service worker (NotificationService.openedFrom).
 */
type Category = MutableCategory;
const WORDING: Record<Category, { question: string; action: string; done: string }> = {
  reminders: { question: 'You opened a daily bonus reminder.', action: 'Turn off these reminders', done: 'Daily bonus reminders are off on this device.' },
  news: { question: 'You opened a news notification.', action: 'Turn off news notifications', done: 'News notifications are off on this device.' }
};

@Component({
  selector: 'app-push-opt-out',
  standalone: true,
  template: `
    @if (category(); as shown) {
      <div class="push-opt-out" role="status">
        @if (finished()) {
          <span>{{ finished() }} You can change this any time in the Account panel.</span>
        } @else {
          <span>{{ wording(shown).question }}</span>
          <button type="button" class="act" [disabled]="busy()" (click)="turnOff(shown)">{{ wording(shown).action }}</button>
        }
        <button type="button" class="close" aria-label="Close" (click)="close()"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
      </div>
    }
  `,
  styles: [`
    .push-opt-out { position: fixed; left: 50%; top: .6rem; transform: translateX(-50%); z-index: 1100; display: flex; align-items: center; gap: .6rem;
      width: max-content; max-width: calc(100vw - 1rem); padding: .55rem .6rem .55rem .9rem; border-radius: 10px; font-size: .85rem;
      color: #0b1220; background: #fff; border: 1px solid rgb(0 0 0 / 15%); box-shadow: 0 6px 24px rgb(0 0 0 / 25%); }
    .act { flex: none; padding: .35rem .7rem; border-radius: 7px; border: 1px solid #b91c1c; background: #fff; color: #b91c1c; font-weight: 600; cursor: pointer; }
    .act:disabled { opacity: .6; cursor: default; }
    .close { flex: none; display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border: 0; border-radius: 6px; background: none; color: inherit; opacity: .7; cursor: pointer; }
    @media (max-width: 480px) { .push-opt-out { flex-wrap: wrap; width: calc(100vw - 1rem); font-size: .8rem; } .push-opt-out > span { flex: 1 1 60%; } }
  `]
})
export class PushOptOutComponent implements OnInit {
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  readonly category = signal<Category | null>(null);
  readonly busy = signal(false);
  readonly finished = signal('');

  constructor() {
    effect(() => {
      const tapped = this.notifications.openedFrom();
      if (!tapped) return;
      this.finished.set('');
      this.category.set(tapped);
    });
  }

  ngOnInit(): void {
    const asked = new URLSearchParams(this.addressQuery()).get('push');
    if (asked === 'reminders' || asked === 'news') this.category.set(asked);
  }

  /** The query string the page was opened with (its own method so tests can supply one). */
  addressQuery(): string {
    return window.location.search;
  }

  wording(category: Category) {
    return WORDING[category];
  }

  async turnOff(category: Category): Promise<void> {
    this.busy.set(true);
    const saved = await this.notifications.setPreferences({ [category]: false });
    this.busy.set(false);
    this.finished.set(saved ? WORDING[category].done : "That didn't save. Open the Account panel to change notifications.");
    this.forgetAddress();
  }

  close(): void {
    this.category.set(null);
    this.notifications.openedFrom.set(null);
    this.forgetAddress();
  }

  /** Drop ?push= from the address so a reload or a shared link does not bring the bar back. */
  private forgetAddress(): void {
    void this.router.navigate([], { queryParams: { push: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
