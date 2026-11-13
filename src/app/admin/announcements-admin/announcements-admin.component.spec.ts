import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminAnnouncement, WhatsNewService } from 'src/app/whats-new/whats-new.service';
import { AnnouncementsAdminComponent } from './announcements-admin.component';

const post = (id: number, changes: Partial<AdminAnnouncement> = {}): AdminAnnouncement => ({
  id, title: 'Post ' + id, body: 'Body ' + id, link_url: null, link_label: null, published_at: null, status: 'draft',
  send_push: false, post_to_discord: false, discord_posted_at: null, created_at: null, updated_at: null, ...changes
});

describe('AnnouncementsAdminComponent', () => {
  let fixture: ComponentFixture<AnnouncementsAdminComponent>;
  let component: AnnouncementsAdminComponent;
  let api: jasmine.SpyObj<WhatsNewService>;
  const text = () => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();
  const buttons = (label: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
    .filter(button => button.textContent!.trim() === label) as HTMLButtonElement[];

  async function start(list = { announcements: [post(2, { status: 'published', published_at: '2026-11-13T18:00:00+00:00' }), post(1)], news_devices: 12, discord_configured: true }) {
    api.adminList.and.resolveTo(list);
    fixture = TestBed.createComponent(AnnouncementsAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<WhatsNewService>('WhatsNewService', ['adminList', 'adminSave', 'adminPublish', 'adminArchive', 'adminDelete', 'refresh']);
    api.refresh.and.resolveTo();
    TestBed.configureTestingModule({ imports: [AnnouncementsAdminComponent], providers: [{ provide: WhatsNewService, useValue: api }] });
  });

  it('lists posts with their status and what was done with them', async () => {
    await start({ announcements: [post(2, { status: 'published', published_at: '2026-11-13T18:00:00+00:00', send_push: true, discord_posted_at: '2026-11-13T18:00:05+00:00' }), post(1)],
      news_devices: 12, discord_configured: true });
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.posts li')).map(row => ({
      status: row.querySelector('.status')!.textContent!.trim(),
      title: row.querySelector('strong')!.textContent!.trim(),
      meta: row.querySelector('.meta')!.textContent!.replace(/\s+/g, ' ').trim()
    }));
    expect(rows.map(row => [row.status, row.title])).toEqual([['published', 'Post 2'], ['draft', 'Post 1']]);
    expect(rows[0].meta).toContain('· pushed');
    expect(rows[0].meta).toContain('· on Discord');
    expect(rows[1].meta).toBe('not published');
  });

  it('explains the empty state and a load failure', async () => {
    await start({ announcements: [], news_devices: 0, discord_configured: false });
    expect(text()).toContain('No posts yet.');
    api.adminList.and.rejectWith({ status: 403, error: { detail: 'Admin access denied' } });
    await component.reload();
    fixture.detectChanges();
    expect(text()).toContain('Admin access denied');
  });

  it('saves a trimmed draft and says it is not on the site yet', async () => {
    await start();
    api.adminSave.and.resolveTo(post(3));
    component.draft = { title: '  Krea 2 is here ', body: ' A new model.\n', link_url: ' /video ', link_label: '' };
    expect(component.draftIsValid).toBeTrue();
    await component.save();
    await settle();
    expect(api.adminSave).toHaveBeenCalledOnceWith({ title: 'Krea 2 is here', body: 'A new model.', link_url: '/video', link_label: null }, undefined);
    expect(text()).toContain('Saved as a draft. It is not on the site yet.');
    expect(component.draft.title).toBe('');
    expect(api.adminList).toHaveBeenCalledTimes(2);
  });

  it('will not save without a title and text, or past the limits', async () => {
    await start();
    for (const draft of [{ title: '', body: 'B' }, { title: 'T', body: '  ' }, { title: 'T'.repeat(121), body: 'B' }, { title: 'T', body: 'B'.repeat(4001) }]) {
      component.draft = { ...draft, link_url: null, link_label: null };
      expect(component.draftIsValid).toBeFalse();
      await component.save();
    }
    expect(api.adminSave).not.toHaveBeenCalled();
  });

  it('edits an existing post in place', async () => {
    await start();
    buttons('Edit')[0].click();
    fixture.detectChanges();
    expect(component.editingId()).toBe(2);
    expect(component.draft.title).toBe('Post 2');
    api.adminSave.and.resolveTo(post(2, { status: 'published' }));
    component.draft.body = 'Corrected';
    await component.save();
    await settle();
    expect(api.adminSave.calls.mostRecent().args[1]).toBe(2);
    expect(text()).toContain('The post on the site is updated.');
  });

  it('publishes with nothing extra unless the boxes are ticked, and reports what happened', async () => {
    await start();
    buttons('Publish')[0].click();
    fixture.detectChanges();
    expect(text()).toContain('Reaches the 12 devices that asked for news');
    expect(component.alsoPush).toBeFalse();
    expect(component.alsoDiscord).toBeFalse();
    api.adminPublish.and.resolveTo({ announcement: post(1, { status: 'published' }), push: 'not_requested', discord: 'not_requested' });
    await component.publish();
    await settle();
    expect(api.adminPublish).toHaveBeenCalledOnceWith(1, { send_push: false, post_to_discord: false });
    expect(text()).toContain('Published on the site.');
    expect(text()).not.toContain('push is going out');
    expect(api.refresh).toHaveBeenCalled();
  });

  it('reports a queued push and a Discord post', async () => {
    await start();
    component.askPublish(post(1));
    component.alsoPush = true;
    component.alsoDiscord = true;
    api.adminPublish.and.resolveTo({ announcement: post(1, { status: 'published' }), push: 'queued', discord: 'posted' });
    await component.publish();
    await settle();
    expect(api.adminPublish).toHaveBeenCalledOnceWith(1, { send_push: true, post_to_discord: true });
    expect(text()).toContain('A push is going out');
    expect(text()).toContain('Posted to Discord.');
  });

  it("shows the server's own reason when a push is refused, keeping the options open", async () => {
    await start();
    component.askPublish(post(1));
    component.alsoPush = true;
    api.adminPublish.and.rejectWith({ status: 409, error: { detail: '"Post 2" was pushed less than 72 hours ago.' } });
    await component.publish();
    await settle();
    expect(text()).toContain('"Post 2" was pushed less than 72 hours ago.');
    expect(component.publishing()).not.toBeNull();
  });

  it('says when Discord did not accept the post or is not set up', async () => {
    await start({ announcements: [post(1)], news_devices: 0, discord_configured: false });
    component.askPublish(post(1));
    fixture.detectChanges();
    await settle();                                  // form controls apply "disabled" a moment later
    expect(text()).toContain('Not set up on the server yet');
    expect((fixture.nativeElement.querySelector('input[name=alsoDiscord]') as HTMLInputElement).disabled).toBeTrue();
    api.adminPublish.and.resolveTo({ announcement: post(1, { status: 'published' }), push: 'not_requested', discord: 'failed' });
    await component.publish();
    await settle();
    expect(text()).toContain('Discord did not accept the post');
    expect(fixture.nativeElement.querySelector('.notice.error')).not.toBeNull();
  });

  it('asks before deleting and deletes on the second click', async () => {
    await start();
    api.adminDelete.and.resolveTo();
    buttons('Delete')[0].click();
    await settle();
    expect(api.adminDelete).not.toHaveBeenCalled();
    buttons('Really delete?')[0].click();
    await settle();
    expect(api.adminDelete).toHaveBeenCalledOnceWith(2);
    expect(text()).toContain('Deleted.');
  });

  it('takes a published post off the site without deleting it', async () => {
    await start();
    api.adminArchive.and.resolveTo(post(2, { status: 'archived' }));
    buttons('Take off site')[0].click();
    await settle();
    expect(api.adminArchive).toHaveBeenCalledOnceWith(2);
    expect(text()).toContain('Taken off the site.');
  });
});
