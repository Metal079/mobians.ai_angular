import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RegionalStatus } from './regional-state';

/** "Regions on · 3" / "Regions paused" / warnings, next to the prompt (SPEC 5). Opens the full-screen editor. */
@Component({
  selector: 'app-regional-status-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (status.kind !== 'hidden') {
      <button type="button" class="rs-chip" [class]="'rs-chip rs-' + status.kind" (click)="open.emit()" [disabled]="disabled"
        [attr.title]="status.detail" aria-haspopup="dialog"
        [attr.aria-label]="status.label + '. ' + status.detail + ' Open the region editor.'">
        <i class="bi" [class.bi-bounding-box]="status.kind === 'on' || status.kind === 'off'"
          [class.bi-pause-circle]="status.kind === 'paused'" [class.bi-exclamation-triangle]="status.kind === 'warning'" aria-hidden="true"></i>
        <span class="rs-label">{{ status.label }}</span>
      </button>
    }
  `,
  styles: [`
    :host { display: inline-flex; min-width: 0; }
    .rs-chip {
      display: inline-flex; align-items: center; gap: .4rem; min-width: 0; max-width: 100%; min-height: 44px;
      padding: .4rem .65rem; border: 1px solid transparent; border-radius: 8px; background: transparent;
      color: var(--theme-surface-text); font-size: .82rem; font-weight: 700; cursor: pointer; white-space: nowrap;
    }
    .rs-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .rs-chip:hover:not(:disabled) { filter: brightness(1.08); background: color-mix(in srgb, var(--theme-surface-text) 8%, transparent); }
    .rs-chip:disabled { opacity: .55; cursor: not-allowed; }
    .rs-chip:focus-visible { outline: 3px solid var(--theme-surface-text); outline-offset: 3px; }
    .rs-on { background: var(--theme-primary); border-color: var(--theme-primary-border); color: var(--theme-primary-text); }
    .rs-on:hover:not(:disabled) { background: var(--theme-primary-hover); }
    /* Fixed warning colours read the same on every theme. */
    .rs-warning { border-color: #f0b429; background: #fff6db; color: #3f2c00; }
    .rs-warning i { color: #b7791f; }
    .rs-warning:hover:not(:disabled) { background: #ffedb8; }
    .rs-paused { border: 1px dashed currentColor; background: color-mix(in srgb, var(--theme-surface-text) 10%, transparent); }
  `],
})
export class RegionalStatusChipComponent {
  @Input({ required: true }) status!: RegionalStatus;
  @Input() disabled = false;
  @Output() open = new EventEmitter<void>();
}
