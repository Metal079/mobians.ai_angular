import { Component, inject, signal } from '@angular/core';
import { NotificationService } from '../notification.service';

/**
 * "Notify me when it's ready", offered while someone is actually waiting for an
 * image: the moment a notification is worth having. It turns on finished-job
 * notifications for this device and nothing else. Hidden where notifications
 * are already on, unsupported, or blocked in the browser.
 */
@Component({
  selector: 'app-notify-me',
  standalone: true,
  template: `
    @if (justEnabled()) {
      <span class="notify-me-on" role="status"><i class="bi bi-bell-fill" aria-hidden="true"></i> We'll notify you when it's ready</span>
    } @else if (notifications.supported && !notifications.enabled() && !notifications.blockedByBrowser) {
      <!-- stopPropagation: the image grid behind this opens a file picker on click. -->
      <button type="button" class="notify-me" [disabled]="busy()" (click)="enable($event)">
        <i class="bi bi-bell" aria-hidden="true"></i> Notify me when it's ready
      </button>
    }
  `,
  styles: [`
    :host { display: block; margin-top: .5rem; }
    .notify-me { padding: .3rem .7rem; border-radius: 999px; border: 1px solid var(--theme-border-strong); background: var(--theme-surface-alt-bg);
      color: var(--theme-surface-text); font-size: .85rem; white-space: nowrap; cursor: pointer; }
    .notify-me:hover { border-color: var(--theme-primary); }
    .notify-me:disabled { opacity: .6; cursor: default; }
    .notify-me:focus-visible { outline: 3px solid var(--theme-primary-outline); outline-offset: 2px; }
    .notify-me-on { font-size: .85rem; }
  `]
})
export class NotifyMeComponent {
  readonly notifications = inject(NotificationService);
  readonly busy = signal(false);
  readonly justEnabled = signal(false);

  async enable(event: Event): Promise<void> {
    event.stopPropagation();
    if (this.busy()) return;
    this.busy.set(true);
    const subscribed = await this.notifications.setEnabled(true);
    this.busy.set(false);
    this.justEnabled.set(subscribed);
  }
}
