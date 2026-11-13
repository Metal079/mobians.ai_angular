import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_AUTH } from '../auth/auth.interceptor';

/**
 * "What's new": posts an admin writes (backend: announcements.py), shown behind
 * the bell in the Image / Video / Characters switch. The bell only exists once
 * something has been published, and shows a dot until the newest post has been
 * opened in this browser.
 */
export interface Announcement {
  id: number;
  title: string;
  /** Plain text; line breaks are kept, nothing is treated as HTML. */
  body: string;
  link_url: string | null;
  link_label: string | null;
  published_at: string | null;
}

/** What the admin screen sees in addition. */
export interface AdminAnnouncement extends Announcement {
  status: 'draft' | 'published' | 'archived';
  send_push: boolean;
  post_to_discord: boolean;
  discord_posted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminAnnouncementList {
  announcements: AdminAnnouncement[];
  /** Devices that asked for news notifications: how far a push would reach. */
  news_devices: number;
  discord_configured: boolean;
}

export interface AnnouncementDraft {
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
}

export interface PublishResult {
  announcement: AdminAnnouncement;
  push: 'queued' | 'not_requested';
  discord: 'posted' | 'failed' | 'already_posted' | 'not_configured' | 'not_requested' | 'posting';
}

const LAST_SEEN_KEY = 'whats-new:last-seen-id';

@Injectable({ providedIn: 'root' })
export class WhatsNewService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;
  private loadStarted = false;
  private readonly lastSeenId = signal(this.readLastSeenId());

  readonly posts = signal<Announcement[]>([]);
  readonly isOpen = signal(false);
  readonly hasUnread = computed(() => this.newestId() > this.lastSeenId());

  /** Fetch the published posts once per visit. Failing quietly just means no bell. */
  load(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      // Public and the same for everyone: no credentials, so the browser can cache it.
      const response = await firstValueFrom(this.http.get<{ announcements: Announcement[] }>(
        `${this.base}/announcements`, { context: new HttpContext().set(SKIP_AUTH, true) }));
      this.posts.set(Array.isArray(response?.announcements) ? response.announcements : []);
    } catch {
      this.loadStarted = false;      // allow another try on the next page
    }
  }

  open(): void {
    this.isOpen.set(true);
    this.markSeen();
  }

  close(): void {
    this.isOpen.set(false);
  }

  private newestId(): number {
    return this.posts().reduce((newest, post) => Math.max(newest, post.id), 0);
  }

  private markSeen(): void {
    const newest = this.newestId();
    if (newest <= this.lastSeenId()) return;
    this.lastSeenId.set(newest);
    try {
      localStorage.setItem(LAST_SEEN_KEY, String(newest));
    } catch {
      // Storage unavailable: the dot comes back on the next visit.
    }
  }

  private readLastSeenId(): number {
    try {
      return Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  // --- admin screen (the auth interceptor adds the session; the backend checks the admin role) ---

  adminList(): Promise<AdminAnnouncementList> {
    return firstValueFrom(this.http.get<AdminAnnouncementList>(`${this.base}/admin/announcements`));
  }

  async adminSave(draft: AnnouncementDraft, id?: number): Promise<AdminAnnouncement> {
    const request = id == null
      ? this.http.post<{ announcement: AdminAnnouncement }>(`${this.base}/admin/announcements`, draft)
      : this.http.patch<{ announcement: AdminAnnouncement }>(`${this.base}/admin/announcements/${id}`, draft);
    return (await firstValueFrom(request)).announcement;
  }

  adminPublish(id: number, options: { send_push: boolean; post_to_discord: boolean }): Promise<PublishResult> {
    return firstValueFrom(this.http.post<PublishResult>(`${this.base}/admin/announcements/${id}/publish`, options));
  }

  async adminArchive(id: number): Promise<AdminAnnouncement> {
    return (await firstValueFrom(this.http.post<{ announcement: AdminAnnouncement }>(
      `${this.base}/admin/announcements/${id}/archive`, {}))).announcement;
  }

  async adminDelete(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/admin/announcements/${id}`));
  }
}
