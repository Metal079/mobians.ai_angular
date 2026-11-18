import { Component, computed, input } from '@angular/core';
import { environment } from 'src/environments/environment';

interface BodyPart {
  text: string;
  bold: boolean;
  italic: boolean;
  image?: string;
}

export function imageSource(value: string | null): string | undefined {
  if (!value || /[\\\s]/.test(value)) return;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (!/^https:\/\//i.test(value)) return;
  try {
    return new URL(value).href;
  } catch {
    return;
  }
}

export function announcementImageUrl(source: string): string {
  return source.startsWith('/announcement-images/') ? environment.apiBaseUrl + source : source;
}

/** Read an inert template into text and image data. Source elements never enter the page. */
export function readAnnouncementHtml(source: string): BodyPart[] {
  const template = document.createElement('template');
  template.innerHTML = source;
  const parts: BodyPart[] = [];
  function visit(node: Node, bold: boolean, italic: boolean): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push({ text: node.textContent || '', bold, italic });
      return;
    }
    if (!(node instanceof Element)) return;
    switch (node.localName) {
      case 'br':
        parts.push({ text: '\n', bold, italic });
        break;
      case 'img': {
        const image = imageSource(node.getAttribute('src'));
        if (image) parts.push({ image, text: node.getAttribute('alt') || '', bold, italic });
        break;
      }
      case 'strong': case 'b': case 'em': case 'i':
        node.childNodes.forEach(child => visit(child,
          bold || node.localName === 'strong' || node.localName === 'b',
          italic || node.localName === 'em' || node.localName === 'i'));
        break;
    }
  }
  template.content.childNodes.forEach(node => visit(node, false, false));
  return parts;
}

@Component({
  selector: 'app-announcement-body',
  standalone: true,
  template: `
    @for (part of parts(); track $index) {
      @if (part.image) {
        <img [src]="imageUrl(part.image)" [alt]="part.text" loading="lazy" referrerpolicy="no-referrer">
      } @else if (part.bold && part.italic) {
        <strong><em>{{ part.text }}</em></strong>
      } @else if (part.bold) {
        <strong>{{ part.text }}</strong>
      } @else if (part.italic) {
        <em>{{ part.text }}</em>
      } @else {
        <ng-container>{{ part.text }}</ng-container>
      }
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; white-space: pre-line; overflow-wrap: anywhere; }
    img { display: block; max-width: 100%; height: auto; margin: .4rem 0; }
  `]
})
export class AnnouncementBodyComponent {
  readonly imageUrl = announcementImageUrl;
  readonly source = input.required<string>();
  readonly parts = computed(() => readAnnouncementHtml(this.source()));
}
