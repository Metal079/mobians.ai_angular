import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { GenerationModeSwitchComponent } from '../generation-mode-switch/generation-mode-switch.component';
import { NotificationService, PushPreferences } from '../notification.service';
import { WhatsNewDialogComponent } from './whats-new-dialog.component';
import { Announcement, WhatsNewService } from './whats-new.service';

const post = (id: number, changes: Partial<Announcement> = {}): Announcement =>
  ({ id, title: 'Post ' + id, body: 'Body ' + id, link_url: null, link_label: null, published_at: '2026-11-13T18:00:00+00:00', ...changes });

describe("What's new", () => {
  let http: HttpTestingController;
  let service: WhatsNewService;
  let notifications: any;
  const url = environment.apiBaseUrl + '/announcements';

  beforeEach(() => {
    localStorage.removeItem('whats-new:last-seen-id');
    notifications = {
      supported: true, blockedByBrowser: false, enabled: signal(false), preferences: signal<PushPreferences | null>(null),
      setEnabled: jasmine.createSpy('setEnabled').and.resolveTo(true),
      setPreferences: jasmine.createSpy('setPreferences').and.resolveTo(true)
    };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations(),
        { provide: NotificationService, useValue: notifications }]
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(WhatsNewService);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('whats-new:last-seen-id');
  });

  async function loaded(posts: Announcement[]): Promise<void> {
    service.load();
    http.expectOne(url).flush({ announcements: posts });
    await Promise.resolve();
    await Promise.resolve();
  }

  describe('service', () => {
    it('loads the published posts once, without credentials, and marks them unread', async () => {
      service.load();
      service.load();
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({ announcements: [post(3), post(2)] });
      await Promise.resolve();
      await Promise.resolve();
      expect(service.posts().map(p => p.id)).toEqual([3, 2]);
      expect(service.hasUnread()).toBeTrue();
    });

    it('opening the list clears the dot, and it stays cleared on the next visit until something newer arrives', async () => {
      await loaded([post(3), post(2)]);
      service.open();
      expect(service.isOpen()).toBeTrue();
      expect(service.hasUnread()).toBeFalse();
      expect(localStorage.getItem('whats-new:last-seen-id')).toBe('3');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
      const nextVisit = TestBed.inject(WhatsNewService);
      const nextHttp = TestBed.inject(HttpTestingController);
      nextVisit.load();
      nextHttp.expectOne(url).flush({ announcements: [post(3), post(2)] });
      await Promise.resolve(); await Promise.resolve();
      expect(nextVisit.hasUnread()).toBeFalse();
      const again = nextVisit.refresh();
      nextHttp.expectOne(url).flush({ announcements: [post(4), post(3), post(2)] });
      await again;
      expect(nextVisit.hasUnread()).toBeTrue();
      nextHttp.verify();
    });

    it("after an admin's change, fetches past the browser's stored copy and replaces it", async () => {
      const fresh = [{ id: 9, title: 'Just published', body: 'Now', link_url: null, link_label: null, published_at: '2026-11-13T00:00:00Z' }];
      const fetched = spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify({ announcements: fresh }), { headers: { 'content-type': 'application/json' } }));
      const service = TestBed.inject(WhatsNewService);
      await service.refresh(true);
      expect(fetched).toHaveBeenCalledOnceWith(`${environment.apiBaseUrl}/announcements`, { cache: 'reload' });
      expect(service.posts().map(post => post.title)).toEqual(['Just published']);
      http.expectNone(`${environment.apiBaseUrl}/announcements`);            // the ordinary, cacheable request was not used
    });

    it('shows nothing and can try again when the request fails', async () => {
      service.load();
      http.expectOne(url).flush('down', { status: 503, statusText: 'Unavailable' });
      await Promise.resolve(); await Promise.resolve();
      expect(service.posts()).toEqual([]);
      expect(service.hasUnread()).toBeFalse();
      service.load();
      http.expectOne(url).flush({ announcements: [post(1)] });
    });
  });

  describe('bell in the page switch', () => {
    let fixture: ComponentFixture<GenerationModeSwitchComponent>;
    const bell = () => fixture.nativeElement.querySelector('.whats-new-bell') as HTMLButtonElement | null;

    async function show(posts: Announcement[]): Promise<void> {
      fixture = TestBed.createComponent(GenerationModeSwitchComponent);
      http.expectOne(url).flush({ announcements: posts });
      await Promise.resolve(); await Promise.resolve();
      fixture.detectChanges();
    }

    it('is absent until something has been published, leaving the switch as it was', async () => {
      await show([]);
      expect(bell()).toBeNull();
      expect(fixture.nativeElement.querySelector('.mode-switch').classList).not.toContain('with-bell');
      expect(fixture.nativeElement.querySelectorAll('a').length).toBe(3);
    });

    it('shows a dot for unread posts and opens the list, which clears it', async () => {
      await show([post(5)]);
      expect(bell()!.getAttribute('aria-label')).toBe("What's new: unread posts");
      expect(fixture.nativeElement.querySelector('.unread-dot')).not.toBeNull();
      bell()!.click();
      fixture.detectChanges();
      expect(service.isOpen()).toBeTrue();
      expect(fixture.nativeElement.querySelector('.unread-dot')).toBeNull();
      expect(bell()!.getAttribute('aria-label')).toBe("What's new");
    });
  });

  describe('list of posts', () => {
    let fixture: ComponentFixture<WhatsNewDialogComponent>;
    const text = () => (document.body.textContent || '').replace(/\s+/g, ' ');

    async function open(posts: Announcement[]): Promise<void> {
      await loaded(posts);
      fixture = TestBed.createComponent(WhatsNewDialogComponent);
      service.open();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    afterEach(() => { service.close(); fixture?.destroy(); });

    it('shows text exactly as typed, never as HTML', async () => {
      await open([post(1, { title: 'Krea 2 <b>is</b> here', body: 'Line one\nLine two <img src=x onerror=alert(1)>' })]);
      expect(text()).toContain('Krea 2 <b>is</b> here');
      expect(text()).toContain('<img src=x onerror=alert(1)>');
      expect(document.querySelector('.whats-new img')).toBeNull();
      expect(document.querySelector('.whats-new b')).toBeNull();
    });

    it('opens one of our own pages inside the site and closes the list', async () => {
      await open([post(1, { link_url: '/video', link_label: 'Try video' })]);
      const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
      const button = document.querySelector('.whats-new button.link') as HTMLButtonElement;
      expect(button.textContent).toContain('Try video');
      button.click();
      expect(navigate).toHaveBeenCalledOnceWith('/video');
      expect(service.isOpen()).toBeFalse();
    });

    it('opens any other link in a new tab without handing it our window', async () => {
      await open([post(1, { link_url: 'https://discord.gg/mobians' })]);
      const link = document.querySelector('.whats-new a.link') as HTMLAnchorElement;
      expect(link.href).toBe('https://discord.gg/mobians');
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener');
      expect(document.querySelector('.whats-new button.link')).toBeNull();
    });

    it('lets someone ask for news notifications, turning notifications on if they were off', async () => {
      await open([post(1)]);
      const box = document.querySelector('.news-switch input') as HTMLInputElement;
      expect(box.checked).toBeFalse();
      box.click();
      await fixture.whenStable();
      expect(notifications.setEnabled).toHaveBeenCalledOnceWith(true, { jobs: true, news: true });

      notifications.enabled.set(true);
      notifications.preferences.set({ jobs: true, reminders: false, news: true });
      fixture.detectChanges();
      expect(box.checked).toBeTrue();
      box.click();
      await fixture.whenStable();
      expect(notifications.setPreferences).toHaveBeenCalledOnceWith({ news: false });
    });

    it('offers no notification switch where the browser cannot do push', async () => {
      notifications.supported = false;
      await open([post(1)]);
      expect(document.querySelector('.news-switch')).toBeNull();
    });
  });
});
