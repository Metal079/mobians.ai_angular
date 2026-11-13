import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { NotificationService } from '../notification.service';
import { Announcement, WhatsNewService } from './whats-new.service';

/**
 * The list of "What's new" posts, opened from the bell. Post text is shown as
 * plain text with its line breaks; a post may carry one link, which stays on
 * the site when it is one of our own pages.
 */
@Component({
  selector: 'app-whats-new-dialog',
  standalone: true,
  imports: [DialogModule, DatePipe],
  template: `
    <p-dialog [visible]="whatsNew.isOpen()" (visibleChange)="onVisibleChange($event)" [modal]="true" [closable]="true"
              [dismissableMask]="true" [draggable]="false" [resizable]="false" header="What's new"
              [style]="{ width: '90vw', maxWidth: '480px' }" [contentStyle]="{ 'max-height': '70vh' }">
      <div class="whats-new">
        @for (post of whatsNew.posts(); track post.id) {
          <article class="post">
            <h3>{{ post.title }}</h3>
            @if (post.published_at) { <time [attr.datetime]="post.published_at">{{ post.published_at | date: 'mediumDate' }}</time> }
            <p class="body">{{ post.body }}</p>
            @if (post.link_url) {
              @if (isOwnPage(post)) {
                <button type="button" class="link" (click)="openOwnPage(post)">{{ post.link_label || 'Open' }}</button>
              } @else {
                <a class="link" [href]="post.link_url" target="_blank" rel="noopener">{{ post.link_label || 'Open link' }}</a>
              }
            }
          </article>
        } @empty {
          <p class="body">Nothing new yet.</p>
        }

        @if (notifications.supported && !notifications.blockedByBrowser) {
          <label class="news-switch">
            <input type="checkbox" [checked]="wantsNews()" [disabled]="busy()" (change)="setNews($event)">
            <span>Notify me about bigger announcements <small>Rare, and you can turn it off from the notification itself.</small></span>
          </label>
        }
      </div>
    </p-dialog>
  `,
  styles: [`
    .whats-new { display: grid; gap: 1rem; }
    .post { display: grid; gap: .25rem; padding-bottom: 1rem; border-bottom: 1px solid rgb(0 0 0 / 10%); }
    .post:last-of-type { border-bottom: 0; padding-bottom: 0; }
    h3 { margin: 0; font-size: 1.05rem; font-weight: 700; }
    time { font-size: .78rem; opacity: .7; }
    .body { margin: .2rem 0 0; white-space: pre-line; overflow-wrap: anywhere; }
    .link { justify-self: start; margin-top: .35rem; padding: .35rem .8rem; border-radius: 7px; border: 1px solid #0f9d6b; background: #10b981;
      color: #fff; font-weight: 600; font-size: .9rem; text-decoration: none; cursor: pointer; }
    .news-switch { display: flex; align-items: flex-start; gap: .5rem; margin: 0; padding-top: .85rem; border-top: 1px solid rgb(0 0 0 / 10%); font-size: .85rem; cursor: pointer; }
    .news-switch input { margin-top: .2rem; flex: none; width: 1rem; height: 1rem; }
    .news-switch small { display: block; font-size: .75rem; opacity: .75; }
    .link:focus-visible, input:focus-visible { outline: 2px solid #0f9d6b; outline-offset: 2px; }
  `]
})
export class WhatsNewDialogComponent {
  readonly whatsNew = inject(WhatsNewService);
  readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  readonly busy = signal(false);

  isOwnPage(post: Announcement): boolean {
    return !!post.link_url && post.link_url.startsWith('/') && !post.link_url.startsWith('//');
  }

  openOwnPage(post: Announcement): void {
    this.whatsNew.close();
    void this.router.navigateByUrl(post.link_url!);
  }

  wantsNews(): boolean {
    return this.notifications.enabled() && !!this.notifications.preferences()?.news;
  }

  async setNews(event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const wanted = checkbox.checked;
    this.busy.set(true);
    // Someone who has not turned notifications on at all gets finished jobs too: that is what "on" means here.
    const saved = this.notifications.enabled()
      ? await this.notifications.setPreferences({ news: wanted })
      : wanted && await this.notifications.setEnabled(true, { jobs: true, news: true });
    this.busy.set(false);
    if (!saved) checkbox.checked = !wanted;
  }

  onVisibleChange(visible: boolean): void {
    if (!visible) this.whatsNew.close();
  }
}
