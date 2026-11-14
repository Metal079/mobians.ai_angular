import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminAnnouncement, AnnouncementDraft, WhatsNewService } from 'src/app/whats-new/whats-new.service';

/**
 * Admin tab for "What's new": write a post, keep it as a draft, publish it to
 * the site, and optionally push it to devices with news switched on and post it
 * to the Discord announcements channel. The backend refuses a second news push
 * within 72 hours and only ever posts to Discord once per post.
 */
const EMPTY: AnnouncementDraft = { title: '', body: '', link_url: null, link_label: null };
export const TITLE_LIMIT = 120;
export const BODY_LIMIT = 4000;

@Component({
  selector: 'app-announcements-admin',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './announcements-admin.component.html',
  styleUrls: ['./announcements-admin.component.css']
})
export class AnnouncementsAdminComponent implements OnInit {
  private readonly whatsNew = inject(WhatsNewService);
  readonly titleLimit = TITLE_LIMIT;
  readonly bodyLimit = BODY_LIMIT;

  readonly posts = signal<AdminAnnouncement[]>([]);
  readonly newsDevices = signal(0);
  readonly discordConfigured = signal(false);
  readonly loading = signal(true);
  readonly busy = signal(false);
  /** What happened last, shown above the list. */
  readonly notice = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /** The post being written; `editingId` is null for a new one. */
  draft: AnnouncementDraft = { ...EMPTY };
  readonly editingId = signal<number | null>(null);
  /** The post whose publish options are open. */
  readonly publishing = signal<AdminAnnouncement | null>(null);
  alsoPush = false;
  alsoDiscord = false;
  readonly confirmingDelete = signal<number | null>(null);


  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.whatsNew.adminList();
      this.posts.set(list.announcements);
      this.newsDevices.set(list.news_devices);
      this.discordConfigured.set(list.discord_configured);
    } catch (error) {
      this.fail(error, "Couldn't load the posts.");
    } finally {
      this.loading.set(false);
    }
  }

  get draftIsValid(): boolean {
    return !!this.draft.title.trim() && !!this.draft.body.trim()
      && this.draft.title.length <= TITLE_LIMIT && this.draft.body.length <= BODY_LIMIT;
  }

  edit(post: AdminAnnouncement): void {
    this.editingId.set(post.id);
    this.draft = { title: post.title, body: post.body, link_url: post.link_url, link_label: post.link_label };
    this.notice.set(null);
  }

  startNew(): void {
    this.editingId.set(null);
    this.draft = { ...EMPTY };
  }

  /** Save the draft form. A post that is already published is corrected in place. */
  async save(): Promise<AdminAnnouncement | null> {
    if (!this.draftIsValid || this.busy()) return null;
    return this.run(async () => {
      const saved = await this.whatsNew.adminSave({
        title: this.draft.title.trim(),
        body: this.draft.body.trim(),
        link_url: this.draft.link_url?.trim() || null,
        link_label: this.draft.link_label?.trim() || null
      }, this.editingId() ?? undefined);
      this.say('ok', saved.status === 'published' ? 'Saved. The post on the site is updated.' : 'Saved as a draft. It is not on the site yet.');
      this.startNew();
      await this.reload();
      return saved;
    }, "Couldn't save the post.");
  }

  askPublish(post: AdminAnnouncement): void {
    this.publishing.set(post);
    this.alsoPush = false;
    this.alsoDiscord = false;
  }

  async publish(): Promise<void> {
    const post = this.publishing();
    if (!post || this.busy()) return;
    await this.run(async () => {
      const result = await this.whatsNew.adminPublish(post.id, { send_push: this.alsoPush, post_to_discord: this.alsoDiscord });
      const parts = ['Published on the site.'];
      if (result.push === 'queued') parts.push(`A push is going out to devices with "New features" switched on (${this.newsDevices()} right now): within about 10 minutes for those in their daytime, the rest when their morning comes.`);
      if (result.discord === 'posted') parts.push('Posted to Discord.');
      if (result.discord === 'already_posted') parts.push('It was already on Discord, so it was not posted again.');
      if (result.discord === 'not_configured') parts.push('Discord posting is not set up on the server, so nothing was posted there.');
      this.say(result.discord === 'failed' ? 'error' : 'ok',
        result.discord === 'failed' ? parts.join(' ') + ' Discord did not accept the post; you can publish again to retry.' : parts.join(' '));
      this.publishing.set(null);
      await this.reload();
      await this.whatsNew.refresh(true);
    }, "Couldn't publish the post.");
  }

  async archive(post: AdminAnnouncement): Promise<void> {
    await this.run(async () => {
      await this.whatsNew.adminArchive(post.id);
      this.say('ok', 'Taken off the site. It is kept here and can be published again.');
      await this.reload();
      await this.whatsNew.refresh(true);
    }, "Couldn't archive the post.");
  }

  async remove(post: AdminAnnouncement): Promise<void> {
    if (this.confirmingDelete() !== post.id) {
      this.confirmingDelete.set(post.id);       // first click asks, second click deletes
      return;
    }
    await this.run(async () => {
      await this.whatsNew.adminDelete(post.id);
      this.confirmingDelete.set(null);
      if (this.editingId() === post.id) this.startNew();
      this.say('ok', 'Deleted.');
      await this.reload();
      await this.whatsNew.refresh(true);
    }, "Couldn't delete the post.");
  }

  private async run<T>(action: () => Promise<T>, fallback: string): Promise<T | null> {
    this.busy.set(true);
    try {
      return await action();
    } catch (error) {
      this.fail(error, fallback);
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  private say(kind: 'ok' | 'error', text: string): void {
    this.notice.set({ kind, text });
  }

  /** Prefer the server's own explanation (for example the 72-hour push rule). */
  private fail(error: unknown, fallback: string): void {
    const detail = (error as { error?: { detail?: unknown } })?.error?.detail;
    this.say('error', typeof detail === 'string' && detail ? detail : fallback);
  }
}
