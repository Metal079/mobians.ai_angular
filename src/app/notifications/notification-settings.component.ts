import { Component, Input, inject, signal } from '@angular/core';
import { NotificationService, PushPreferences } from '../notification.service';

/**
 * "Notifications on this device": the three switches a person controls, shown in
 * the Account panel. Finished jobs is what turning notifications on has always
 * meant; the daily-bonus reminder and news are separate, off until chosen, and
 * each can be switched off again here or from the notification itself.
 */
@Component({
  selector: 'app-notification-settings',
  standalone: true,
  template: `
    @if (notifications.supported) {
      <section class="notification-settings" aria-label="Notifications on this device">
        <div class="heading">
          <i class="bi bi-bell" aria-hidden="true"></i> Notifications on this device
        </div>

        @if (!notifications.enabled()) {
          @if (notifications.blockedByBrowser) {
            <p class="note">Notifications are blocked for this site in your browser's settings.</p>
          } @else {
            <button type="button" class="turn-on" [disabled]="busy()" (click)="turnOn()">Turn on</button>
            <p class="note">Get told when your image or video is ready, even with the tab closed.</p>
          }
        } @else {
          <label class="switch-row">
            <input type="checkbox" [checked]="value('jobs')" [disabled]="busy()" (change)="set('jobs', $event)">
            <span>Finished images and videos</span>
          </label>
          <label class="switch-row" [class.unavailable]="!signedIn">
            <input type="checkbox" [checked]="signedIn && value('reminders')" [disabled]="busy() || !signedIn" (change)="set('reminders', $event)">
            <span>Daily bonus reminder
              <small>{{ signedIn ? 'At most once a day, only while you have a streak to keep.' : 'Sign in to use this.' }}</small>
            </span>
          </label>
          <label class="switch-row">
            <input type="checkbox" [checked]="value('news')" [disabled]="busy()" (change)="set('news', $event)">
            <span>New features <small>Only for bigger announcements.</small></span>
          </label>
          <button type="button" class="turn-off" [disabled]="busy()" (click)="turnOff()">Turn all off on this device</button>
        }

        @if (offerReminder && signedIn && !value('reminders') && !notifications.blockedByBrowser) {
          <div class="offer" role="status">
            <span>Don't lose your streak.</span>
            <button type="button" [disabled]="busy()" (click)="remindMe()">Remind me before it resets</button>
          </div>
        }
        @if (message()) { <p class="note" role="status">{{ message() }}</p> }
      </section>
    }
  `,
  styles: [`
    .notification-settings { display: grid; gap: .35rem; padding: .6rem 0 .2rem; border-top: 1px solid rgb(0 0 0 / 10%); font-size: .82rem; text-align: left; }
    .heading { font-weight: 600; }
    .note { margin: 0; font-size: .75rem; opacity: .8; }
    .switch-row { display: flex; align-items: flex-start; gap: .5rem; margin: 0; cursor: pointer; }
    .switch-row input { margin-top: .2rem; flex: none; width: 1rem; height: 1rem; }
    .switch-row small { display: block; font-size: .72rem; opacity: .75; line-height: 1.3; }
    .switch-row.unavailable { cursor: default; opacity: .7; }
    .turn-on, .offer button { justify-self: start; padding: .3rem .7rem; border-radius: 6px; border: 1px solid #0f9d6b; background: #10b981; color: #fff; font-weight: 600; cursor: pointer; }
    .turn-off { justify-self: start; padding: 0; border: 0; background: none; color: inherit; font-size: .75rem; text-decoration: underline; opacity: .75; cursor: pointer; }
    .offer { display: grid; gap: .3rem; padding: .45rem .55rem; border-radius: 8px; background: rgb(16 185 129 / 12%); }
    button:disabled { opacity: .6; cursor: default; }
    button:focus-visible, input:focus-visible { outline: 2px solid #0f9d6b; outline-offset: 2px; }
  `]
})
export class NotificationSettingsComponent {
  /** Reminders belong to an account, so that switch needs someone signed in. */
  @Input() signedIn = false;
  /** Show the "remind me before my streak resets" offer (right after a daily claim). */
  @Input() offerReminder = false;

  readonly notifications = inject(NotificationService);
  readonly busy = signal(false);
  readonly message = signal('');

  /** Until the server has answered, a subscribed device is assumed to have what every device starts with. */
  value(name: keyof PushPreferences): boolean {
    const preferences = this.notifications.preferences();
    return preferences ? preferences[name] : name === 'jobs';
  }

  async turnOn(): Promise<void> {
    await this.run(async () => {
      const subscribed = await this.notifications.setEnabled(true, { jobs: true });
      this.message.set(subscribed ? '' : this.refusedMessage());
    });
  }

  async turnOff(): Promise<void> {
    await this.run(async () => {
      await this.notifications.setEnabled(false);
      this.message.set('Notifications are off on this device.');
    });
  }

  async set(name: keyof PushPreferences, event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const wanted = checkbox.checked;
    await this.run(async () => {
      const saved = await this.notifications.setPreferences({ [name]: wanted });
      if (!saved) {
        checkbox.checked = !wanted;
        this.message.set("That didn't save. Please try again.");
      } else {
        this.message.set('');
      }
    });
  }

  async remindMe(): Promise<void> {
    await this.run(async () => {
      const done = this.notifications.enabled()
        ? await this.notifications.setPreferences({ reminders: true })
        : await this.notifications.setEnabled(true, { jobs: true, reminders: true });
      this.message.set(done ? "Done. We'll remind you at most once a day." : this.refusedMessage());
    });
  }

  private refusedMessage(): string {
    return this.notifications.blockedByBrowser
      ? "Notifications are blocked for this site in your browser's settings."
      : "Notifications couldn't be turned on in this browser.";
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await action();
    } finally {
      this.busy.set(false);
    }
  }
}
