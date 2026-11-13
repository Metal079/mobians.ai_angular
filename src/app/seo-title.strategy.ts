import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * Per-page search and link-preview tags.
 *
 * index.html carries the same home-page values as static tags, because link
 * previews (Discord, X, etc.) never run JavaScript. This strategy keeps the
 * tags right for crawlers that do, as the visitor moves between pages.
 *
 * A route sets its text with `title` and `data: { description, noindex }`.
 */
export const SITE_ORIGIN = 'https://mobians.ai';
export const DEFAULT_TITLE = 'Mobians.ai: Free AI Sonic OC Generator for Images and Video';
export const DEFAULT_DESCRIPTION =
  'Create Sonic-style original characters, furry and anime art with AI. Free to use, no account needed. ' +
  'Edit images, save your characters and turn pictures into videos.';

const PRODUCTION_HOSTS = ['mobians.ai', 'www.mobians.ai'];

@Injectable()
export class SeoTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const route = this.deepestRoute(snapshot.root);
    const title = this.buildTitle(snapshot) || DEFAULT_TITLE;
    const description: string = route.data['description'] || DEFAULT_DESCRIPTION;
    const canonical = SITE_ORIGIN + (snapshot.url.split(/[?#]/)[0] || '/');

    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.setCanonical(canonical);

    // Staging, previews and localhost must never compete with the real site
    // in search results; private pages stay out everywhere.
    const hidden = route.data['noindex'] === true || !PRODUCTION_HOSTS.includes(this.document.location.hostname);
    if (hidden) {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    } else {
      this.meta.removeTag('name="robots"');
    }
  }

  private deepestRoute(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    while (route.firstChild) route = route.firstChild;
    return route;
  }

  private setCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = url;
  }
}
