import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SeoTitleStrategy } from './seo-title.strategy';

@Component({ template: '', standalone: true })
class BlankPage {}

describe('SeoTitleStrategy', () => {
  let router: Router;
  let meta: Meta;
  const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  const content = (selector: string) => meta.getTag(selector)?.content;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: BlankPage },
          { path: 'video', component: BlankPage, title: 'Video | Mobians.ai', data: { description: 'Make a video.' } },
          { path: 'admin', component: BlankPage, title: 'Admin | Mobians.ai', data: { noindex: true } },
          { path: 'train', title: 'Train | Mobians.ai', data: { noindex: true },
            children: [{ path: 'new', component: BlankPage }] }
        ]),
        { provide: TitleStrategy, useClass: SeoTitleStrategy }
      ]
    });
    router = TestBed.inject(Router);
    meta = TestBed.inject(Meta);
  });

  afterEach(() => {
    document.head.querySelector('link[rel="canonical"]')?.remove();
    for (const selector of ['name="robots"', 'name="description"', 'property="og:title"', 'property="og:description"',
      'property="og:url"', 'name="twitter:title"', 'name="twitter:description"']) meta.removeTag(selector);
  });

  it('uses the site defaults on the home page', async () => {
    await router.navigateByUrl('/');
    expect(TestBed.inject(Title).getTitle()).toBe(DEFAULT_TITLE);
    expect(content('name="description"')).toBe(DEFAULT_DESCRIPTION);
    expect(content('property="og:title"')).toBe(DEFAULT_TITLE);
    expect(canonical()).toBe('https://mobians.ai/');
  });

  it("uses each page's own title and description, and a canonical address without the query string", async () => {
    await router.navigateByUrl('/video?utm_source=discord#top');
    expect(TestBed.inject(Title).getTitle()).toBe('Video | Mobians.ai');
    expect(content('name="description"')).toBe('Make a video.');
    expect(content('property="og:description"')).toBe('Make a video.');
    expect(content('name="twitter:title"')).toBe('Video | Mobians.ai');
    expect(content('property="og:url"')).toBe('https://mobians.ai/video');
    expect(canonical()).toBe('https://mobians.ai/video');
  });

  it('keeps private pages and their child pages out of search results', async () => {
    await router.navigateByUrl('/admin');
    expect(content('name="robots"')).toBe('noindex');
    await router.navigateByUrl('/train/new');
    expect(TestBed.inject(Title).getTitle()).toBe('Train | Mobians.ai');
    expect(content('name="robots"')).toBe('noindex');
  });

  it('keeps every page out of search results away from the production address', async () => {
    // Tests run on localhost, which must behave like staging and preview builds.
    expect(['mobians.ai', 'www.mobians.ai']).not.toContain(document.location.hostname);
    await router.navigateByUrl('/video');
    expect(content('name="robots"')).toBe('noindex');
  });
});
