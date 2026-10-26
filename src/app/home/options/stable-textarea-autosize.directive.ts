import { AfterViewChecked, AfterViewInit, Directive, ElementRef, HostListener, NgZone, OnDestroy, inject } from '@angular/core';

// Copy only properties that affect text wrapping or the textarea's box model.
const MEASUREMENT_STYLES = [
  'width', 'box-sizing', 'font-family', 'font-size', 'font-weight', 'font-style',
  'font-stretch', 'font-variant', 'line-height', 'letter-spacing', 'word-spacing',
  'text-transform', 'text-indent', 'white-space', 'word-break', 'overflow-wrap',
  'tab-size', 'direction', 'padding-top', 'padding-right', 'padding-bottom',
  'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width',
  'border-left-width',
] as const;

/** Measures outside the page flow so autosizing cannot clamp the page's scroll. */
@Directive({ selector: 'textarea[appStableAutosize]', standalone: true })
export class StableTextareaAutosizeDirective implements AfterViewInit, AfterViewChecked, OnDestroy {
  private readonly textarea = inject(ElementRef<HTMLTextAreaElement>).nativeElement;
  private readonly zone = inject(NgZone);
  private measurement?: HTMLTextAreaElement;
  private observer?: ResizeObserver;
  private resizeFrame?: number;
  private lastMeasurement = '';
  private observedWidth = -1;
  private destroyed = false;
  private readonly onFontsLoaded = () => this.resize(true);

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(entries => {
          const width = entries[0]?.contentRect.width;
          // Our own height changes and mobile toolbar movement are not new widths.
          if (width === undefined || width === this.observedWidth) return;
          this.observedWidth = width;
          // Changing the observed element's height inside the notification can
          // produce a ResizeObserver loop error, even when width is unchanged.
          this.scheduleResize();
        });
        this.observer.observe(this.textarea);
      }
      const fonts = this.textarea.ownerDocument.fonts;
      fonts?.addEventListener('loadingdone', this.onFontsLoaded);
      void fonts?.ready.then(() => this.resize(true));
    });
  }

  ngAfterViewChecked(): void {
    // Also catches programmatic prompt loads and changes to dynamic-prompt styles.
    this.resize();
  }

  @HostListener('input')
  onInput(): void {
    this.resize();
  }

  private scheduleResize(): void {
    const view = this.textarea.ownerDocument.defaultView;
    if (this.destroyed || this.resizeFrame !== undefined || !view) return;
    this.resizeFrame = view.requestAnimationFrame(() => {
      this.resizeFrame = undefined;
      this.resize();
    });
  }

  private resize(force = false): void {
    const textarea = this.textarea;
    if (this.destroyed || !textarea.isConnected || textarea.getBoundingClientRect().width === 0) return;
    const view = textarea.ownerDocument.defaultView;
    if (!view) return;
    const styles = view.getComputedStyle(textarea);
    const values = MEASUREMENT_STYLES.map(property => styles.getPropertyValue(property));
    const key = JSON.stringify([textarea.value, textarea.placeholder, textarea.wrap, ...values, styles.minHeight, styles.maxHeight]);
    if (!force && key === this.lastMeasurement) return;

    const measure = this.measurement ??= this.createMeasurement();
    MEASUREMENT_STYLES.forEach((property, index) => measure.style.setProperty(property, values[index]));
    measure.value = textarea.value;
    measure.placeholder = textarea.placeholder;
    measure.wrap = textarea.wrap;
    const pixels = (value: string) => Number.parseFloat(value) || 0;
    const padding = pixels(styles.paddingTop) + pixels(styles.paddingBottom);
    const border = pixels(styles.borderTopWidth) + pixels(styles.borderBottomWidth);
    const naturalHeight = measure.scrollHeight + (styles.boxSizing === 'border-box' ? border : -padding);
    const maxHeight = styles.maxHeight === 'none' ? Infinity : pixels(styles.maxHeight);
    const height = Math.max(pixels(styles.minHeight), Math.min(naturalHeight, maxHeight));
    const nextHeight = `${Math.ceil(height)}px`;
    const overflowY = naturalHeight > height ? 'auto' : 'hidden';

    // Never temporarily collapse the live textarea. Unrelated scroll checks must
    // not mutate it either, since WebKit may already have clamped the viewport.
    if (textarea.style.height !== nextHeight) textarea.style.height = nextHeight;
    if (textarea.style.overflowX !== 'hidden') textarea.style.overflowX = 'hidden';
    if (textarea.style.overflowY !== overflowY) textarea.style.overflowY = overflowY;
    this.lastMeasurement = key;
  }

  private createMeasurement(): HTMLTextAreaElement {
    const measure = this.textarea.ownerDocument.createElement('textarea');
    measure.setAttribute('data-stable-autosize-measure', '');
    measure.setAttribute('aria-hidden', 'true');
    measure.tabIndex = -1;
    measure.readOnly = true;
    measure.rows = 1;
    measure.style.cssText = 'position:fixed;top:0;left:0;height:0;min-height:0;max-height:none;visibility:hidden;pointer-events:none;overflow:hidden;resize:none;border-style:solid;';
    this.textarea.ownerDocument.body.appendChild(measure);
    return measure;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    if (this.resizeFrame !== undefined) this.textarea.ownerDocument.defaultView?.cancelAnimationFrame(this.resizeFrame);
    this.textarea.ownerDocument.fonts?.removeEventListener('loadingdone', this.onFontsLoaded);
    this.measurement?.remove();
  }
}
