import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TextareaModule } from 'primeng/textarea';
import { StableTextareaAutosizeDirective } from './stable-textarea-autosize.directive';

@Component({
  standalone: true,
  imports: [FormsModule, TextareaModule, StableTextareaAutosizeDirective],
  template: `
    <div class="prompt-width" [style.width.px]="width" [style.display]="hidden ? 'none' : ''">
      <textarea pInputTextarea appStableAutosize [(ngModel)]="value" rows="1"
        [class.dynamic]="dynamic" placeholder="Enter Prompt"></textarea>
    </div>
  `,
  styles: [`
    textarea {
      display: block;
      width: 100%;
      box-sizing: border-box;
      font: 14px / 20px monospace;
      padding: 6px 8px;
      border: 1px solid black;
      min-height: 40px;
      resize: none;
    }
    textarea.dynamic { padding-top: 26px; border-left-width: 4px; }
  `],
})
class AutosizeHostComponent {
  value = '';
  width = 320;
  hidden = false;
  dynamic = false;
}

describe('StableTextareaAutosizeDirective', () => {
  let fixture: ComponentFixture<AutosizeHostComponent>;
  let host: AutosizeHostComponent;
  let textarea: HTMLTextAreaElement;
  let container: HTMLDivElement;

  const longPrompt = Array(8).fill('Sonic the hedgehog, blue fur, green eyes, red shoes.').join(' ');
  const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const layoutSettled = async () => {
    // Let native ResizeObserver notifications and their deferred sizing run.
    await nextPaint();
    await nextPaint();
    await nextPaint();
  };
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await layoutSettled();
  };
  const expectTextFits = () => {
    expect(textarea.clientHeight).toBeGreaterThan(0);
    expect(textarea.scrollHeight).toBeLessThanOrEqual(textarea.clientHeight + 1);
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AutosizeHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(AutosizeHostComponent);
    host = fixture.componentInstance;
    textarea = fixture.nativeElement.querySelector('textarea');
    container = fixture.nativeElement.querySelector('.prompt-width');
  });

  afterEach(() => fixture.destroy());

  it('grows and shrinks for programmatic prompt loads through ngModel', async () => {
    await render();
    const emptyHeight = textarea.offsetHeight;
    host.value = longPrompt;
    await render();
    const loadedHeight = textarea.offsetHeight;
    expect(textarea.value).toBe(longPrompt);
    expect(loadedHeight).toBeGreaterThan(emptyHeight + 100);
    expectTextFits();

    host.value = 'A short replacement';
    await render();
    expect(textarea.offsetHeight).toBeLessThan(loadedHeight);
    expect(textarea.offsetHeight).toBeGreaterThanOrEqual(emptyHeight);
    expectTextFits();
  });

  it('resizes typed content without changing focus or the selection', async () => {
    await render();
    const initialHeight = textarea.offsetHeight;
    textarea.focus({ preventScroll: true });
    textarea.value = longPrompt;
    textarea.setSelectionRange(7, 18, 'forward');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await render();

    expect(host.value).toBe(longPrompt);
    expect(textarea.offsetHeight).toBeGreaterThan(initialHeight);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(18);
    expectTextFits();

    textarea.value = 'Short';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await render();
    expect(host.value).toBe('Short');
    expect(textarea.offsetHeight).toBe(initialHeight);
  });

  it('adapts to container width changes without a model update or window resize', async () => {
    host.value = longPrompt;
    await render();
    const wideHeight = textarea.offsetHeight;

    container.style.width = '160px';
    await layoutSettled();
    expect(textarea.offsetHeight).toBeGreaterThan(wideHeight);
    expectTextFits();

    container.style.width = '400px';
    await layoutSettled();
    expect(textarea.offsetHeight).toBeLessThan(wideHeight);
    expectTextFits();
    expect(textarea.value).toBe(longPrompt);
  });

  it('measures a prompt after its initially hidden container becomes visible', async () => {
    host.hidden = true;
    host.value = longPrompt;
    await render();
    expect(textarea.offsetHeight).toBe(0);

    container.style.display = '';
    await layoutSettled();
    expect(textarea.offsetHeight).toBeGreaterThan(100);
    expectTextFits();
  });

  it('makes no style mutations for unchanged view checks or scrolling', async () => {
    host.value = longPrompt;
    await render();
    const height = textarea.offsetHeight;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(textarea, { attributes: true, attributeFilter: ['style'] });
    try {
      for (let index = 0; index < 5; index++) {
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
        fixture.detectChanges();
      }
      await layoutSettled();
      mutations.push(...observer.takeRecords());
      expect(mutations.length).toBe(0);
      expect(textarea.offsetHeight).toBe(height);
    } finally {
      observer.disconnect();
    }
  });

  it('never collapses the visible textarea while measuring a changed prompt', async () => {
    host.value = longPrompt;
    await render();
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(textarea, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
    try {
      host.value = longPrompt + ' ' + longPrompt;
      await render();
      mutations.push(...observer.takeRecords());
      expect(mutations.length).toBeGreaterThan(0);
      // A transient height:auto/0 is what clamps WebKit's document scroll.
      const collapsedHeight = /(?:^|;)\s*height:\s*(?:auto|0(?:px)?)\s*(?:;|$)/;
      expect(mutations.some(record => collapsedHeight.test(record.oldValue || ''))).toBeFalse();
      expect(collapsedHeight.test(textarea.getAttribute('style') || '')).toBeFalse();
      expectTextFits();
    } finally {
      observer.disconnect();
    }
  });

  it('accounts for dynamic prompt padding and borders without changing the text', async () => {
    host.value = 'One line';
    await render();
    const plainHeight = textarea.offsetHeight;
    host.dynamic = true;
    await render();
    expect(textarea.offsetHeight).toBeGreaterThan(plainHeight);
    expectTextFits();

    host.dynamic = false;
    await render();
    expect(textarea.offsetHeight).toBe(plainHeight);
    expect(textarea.value).toBe('One line');
  });

  it('fits the text when content-box sizing includes extra padding', async () => {
    textarea.style.boxSizing = 'content-box';
    textarea.style.padding = '12px 10px';
    host.value = longPrompt;
    await render();
    expectTextFits();
    const fullHeight = textarea.offsetHeight;

    host.value = 'Short';
    await render();
    expect(textarea.offsetHeight).toBeLessThan(fullHeight);
    expectTextFits();
  });

  it('allows internal scrolling at max-height and removes it when text shrinks', async () => {
    textarea.style.maxHeight = '100px';
    host.value = longPrompt;
    await render();
    expect(textarea.offsetHeight).toBe(100);
    expect(getComputedStyle(textarea).overflowY).toBe('auto');
    expect(textarea.scrollHeight).toBeGreaterThan(textarea.clientHeight);

    host.value = 'Short';
    await render();
    expect(textarea.offsetHeight).toBeLessThan(100);
    expect(getComputedStyle(textarea).overflowY).toBe('hidden');
    expectTextFits();
  });

  it('removes the measuring element and disconnects resize observation on destruction', async () => {
    host.value = longPrompt;
    const disconnect = spyOn(ResizeObserver.prototype, 'disconnect').and.callThrough();
    await render();
    expect(document.querySelectorAll('[data-stable-autosize-measure]').length).toBe(1);
    container.style.width = '160px';
    await nextPaint();
    fixture.destroy();
    await layoutSettled();
    expect(document.querySelectorAll('[data-stable-autosize-measure]').length).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  });
});
