import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { RegionalPromptRegion } from 'src/_shared/regional-prompting.interface';
import {
  drawBox, moveBox, nudgeBox, RESIZE_HANDLES, ResizeHandle, resizeBox, SnapGuides, SnapOptions, SnapTargets, snapTargets,
} from './regional-geometry';
import { promptSnippet, regionColor, REGIONAL_LIMITS, RegionBox } from './regional-state';

export type RegionalCanvasCommand = 'delete' | 'duplicate' | 'undo' | 'redo';

interface DragState {
  kind: 'move' | 'resize' | 'draw';
  pointerId: number;
  regionId: string | null;
  handle?: ResizeHandle;
  start: RegionBox;
  origin: { x: number; y: number };
  rect: DOMRect;
  moved: boolean;
  targets: SnapTargets;
  tolerance: number;
}

/**
 * Interactive layout canvas (SPEC 5): draw on empty space, move, 8 resize handles, snapping (Alt disables it),
 * keyboard editing, and touch that does not trap page scrolling (only the selected box, its handles and draw mode
 * capture a gesture; a tap selects a box).
 */
@Component({
  selector: 'app-regional-canvas',
  standalone: true,
  templateUrl: './regional-canvas.component.html',
  styleUrls: ['./regional-canvas.component.css'],
})
export class RegionalCanvasComponent implements OnDestroy {
  @Input({ required: true }) regions: RegionalPromptRegion[] = [];
  @Input() selectedId: string | null = null;
  /** Width / height of the generated image. */
  @Input() ratio = 1;
  @Input() backgroundUrl: string | null = null;
  @Input() drawMode = false;
  /** No more regions can be added (the model's limit). */
  @Input() full = false;
  @Input() size: 'inline' | 'dialog' = 'inline';

  @Output() selectRegion = new EventEmitter<string | null>();
  /** Fired once before a change; the key merges repeated keyboard nudges into one undo step. */
  @Output() editStart = new EventEmitter<string | undefined>();
  /** Fired when a change is finished (pointer released, nudging paused): time to save. */
  @Output() editEnd = new EventEmitter<void>();
  @Output() createRegion = new EventEmitter<RegionBox>();
  @Output() command = new EventEmitter<RegionalCanvasCommand>();
  @Output() drawModeChange = new EventEmitter<boolean>();

  @ViewChild('frame', { static: true }) frameRef!: ElementRef<HTMLElement>;

  readonly handles = RESIZE_HANDLES;
  readonly coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  guides: SnapGuides = { x: [], y: [] };
  ghost: RegionBox | null = null;
  announcement = '';
  readonly helpId = `rc-help-${Math.random().toString(36).slice(2, 8)}`;

  private drag: DragState | null = null;
  private suppressClick = false;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;

  get selected(): RegionalPromptRegion | undefined {
    return this.selectedId ? this.regions.find(region => region.id === this.selectedId) : undefined;
  }

  get selectedIndex(): number {
    return this.selectedId ? this.regions.findIndex(region => region.id === this.selectedId) : -1;
  }

  ngOnDestroy(): void {
    if (this.nudgeTimer) {
      clearTimeout(this.nudgeTimer);
      this.editEnd.emit();
    }
  }

  color(index: number): string { return regionColor(index); }

  label(region: RegionalPromptRegion): string {
    return promptSnippet(region.prompt, 36) || 'No prompt yet';
  }

  /**
   * The CSS value for the boxes' background, built once per image: quoted so URLs with spaces or brackets work,
   * and the same string instance on every check, so a long (data:) URL is not rebuilt and compared per pointer move.
   */
  get backgroundCss(): string | null {
    const url = this.backgroundUrl;
    if (this.bgCache.url !== url) {
      this.bgCache = { url, css: url ? `url("${url.replace(/["\\]/g, '\\$&').replace(/[\r\n]/g, '')}")` : null };
    }
    return this.bgCache.css;
  }
  private bgCache: { url: string | null; css: string | null } = { url: null, css: null };

  /** With an image underneath, each box shows its own part of the image undimmed (the rest is dimmed and hatched). */
  backgroundSize(box: RegionBox): string {
    return `${100 / Math.max(box.width, 0.0001)}% ${100 / Math.max(box.height, 0.0001)}%`;
  }

  backgroundPosition(box: RegionBox): string {
    const axis = (start: number, size: number) => (size >= 0.9999 ? 0 : (start / (1 - size)) * 100);
    return `${axis(box.x, box.width)}% ${axis(box.y, box.height)}%`;
  }

  boxAriaLabel(region: RegionalPromptRegion, index: number): string {
    return `Region ${index + 1}: ${promptSnippet(region.prompt, 60) || 'no prompt'}. ${this.describeBox(region)}`;
  }

  onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A drag that ends on touch may get no trailing click; a stale flag would swallow the next real tap.
    this.suppressClick = false;
    const frame = this.frameRef.nativeElement;
    const rect = frame.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset['handle'] as ResizeHandle | undefined;
    const boxEl = target.closest<HTMLElement>('[data-region-id]');
    const point = this.toPoint(event, rect);
    const mouse = event.pointerType === 'mouse';
    const selected = this.selected;

    if (handle && selected) {
      this.beginDrag(event, 'resize', selected, rect, point, handle);
      return;
    }
    if (this.drawMode || (!boxEl && mouse)) {
      if (this.full) {
        if (!boxEl) this.selectRegion.emit(null);
        return;
      }
      this.beginDrag(event, 'draw', null, rect, point);
      return;
    }
    if (boxEl) {
      const id = boxEl.dataset['regionId'] ?? null;
      const region = this.regions.find(item => item.id === id);
      if (!region) return;
      const wasSelected = id === this.selectedId;
      // Touch on a box that is not selected yet: leave the gesture to the page (scroll); a tap selects it.
      if (!mouse && !wasSelected) return;
      if (!wasSelected) this.selectRegion.emit(id);
      this.beginDrag(event, 'move', region, rect, point);
    }
  }

  onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = this.toPoint(event, drag.rect);
    const dx = point.x - drag.origin.x;
    const dy = point.y - drag.origin.y;
    if (!drag.moved) {
      if (Math.hypot(dx * drag.rect.width, dy * drag.rect.height) < 3) return;
      drag.moved = true;
      if (drag.kind !== 'draw') this.editStart.emit(undefined);
    }
    const snap: SnapOptions | undefined = event.altKey ? undefined : {
      targets: drag.targets,
      thresholdX: drag.tolerance / drag.rect.width,
      thresholdY: drag.tolerance / drag.rect.height,
    };
    if (drag.kind === 'draw') {
      const result = drawBox(drag.origin, point, snap);
      this.ghost = result.box;
      this.guides = result.guides;
    } else {
      const region = this.regions.find(item => item.id === drag.regionId);
      if (!region) return;
      const result = drag.kind === 'move'
        ? moveBox(drag.start, dx, dy, snap)
        : resizeBox(drag.start, drag.handle ?? 'se', dx, dy, snap);
      region.x = result.box.x;
      region.y = result.box.y;
      region.width = result.box.width;
      region.height = result.box.height;
      this.guides = result.guides;
    }
    event.preventDefault();
  }

  onPointerUp(event: PointerEvent, cancelled = false): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    this.guides = { x: [], y: [] };
    const frame = this.frameRef.nativeElement;
    if (frame.hasPointerCapture?.(event.pointerId)) frame.releasePointerCapture(event.pointerId);

    if (drag.kind === 'draw') {
      const box = this.ghost;
      this.ghost = null;
      const bigEnough = !!box
        && box.width >= REGIONAL_LIMITS.minSize && box.height >= REGIONAL_LIMITS.minSize
        && box.width * drag.rect.width >= 12 && box.height * drag.rect.height >= 12;
      if (!cancelled && drag.moved && box && bigEnough) {
        this.suppressClick = true;
        this.createRegion.emit({ ...box });
        if (this.drawMode) this.drawModeChange.emit(false);
      } else if (!drag.moved && !this.drawMode) {
        this.selectRegion.emit(null);
      }
      return;
    }
    if (drag.moved) {
      this.suppressClick = true;
      this.editEnd.emit();
      const region = this.regions.find(item => item.id === drag.regionId);
      if (region) this.announce(`Region ${this.regions.indexOf(region) + 1}: ${this.describeBox(region)}`);
    }
  }

  /** Taps that started no drag (touch on an unselected box or on empty canvas) select a box or clear the selection;
   *  gestures that started a drag already settled the selection on press/release (suppressClick). */
  onFrameClick(event: MouseEvent): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (this.drawMode) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-handle]')) return;
    const boxEl = target.closest<HTMLElement>('[data-region-id]');
    const id = boxEl?.dataset['regionId'] ?? null;
    if (id !== this.selectedId) this.selectRegion.emit(id);
  }

  onKeyDown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (mod && (key === 'z' || key === 'Z')) {
      event.preventDefault();
      this.command.emit(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (mod && (key === 'y' || key === 'Y')) {
      event.preventDefault();
      this.command.emit('redo');
      return;
    }
    if (key === 'Tab' && !mod && !event.altKey && this.regions.length) {
      const index = this.selectedIndex;
      if (index === -1) {
        event.preventDefault();
        this.selectAndAnnounce(event.shiftKey ? this.regions.length - 1 : 0);
        return;
      }
      const next = event.shiftKey ? index - 1 : index + 1;
      if (next >= 0 && next < this.regions.length) {
        event.preventDefault();
        this.selectAndAnnounce(next);
      }
      return;
    }
    const region = this.selected;
    if (!region) return;
    if (mod && (key === 'd' || key === 'D')) {
      event.preventDefault();
      this.command.emit('duplicate');
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      this.command.emit('delete');
      return;
    }
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const move = moves[key];
    if (!move) return;
    event.preventDefault();
    this.editStart.emit(`nudge:${region.id}`);
    const box = nudgeBox(region, move[0], move[1]);
    region.x = box.x;
    region.y = box.y;
    this.announce(`Region ${this.selectedIndex + 1}: ${this.describeBox(region)}`);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => {
      this.nudgeTimer = null;
      this.editEnd.emit();
    }, 450);
  }

  private selectAndAnnounce(index: number): void {
    const region = this.regions[index];
    if (!region) return;
    this.selectRegion.emit(region.id);
    this.announce(`${this.boxAriaLabel(region, index)} Selected.`);
  }

  private beginDrag(event: PointerEvent, kind: DragState['kind'], region: RegionalPromptRegion | null, rect: DOMRect,
    point: { x: number; y: number }, handle?: ResizeHandle): void {
    const index = region ? this.regions.indexOf(region) : -1;
    this.drag = {
      kind,
      pointerId: event.pointerId,
      regionId: region?.id ?? null,
      handle,
      start: region ? { x: region.x, y: region.y, width: region.width, height: region.height } : { x: point.x, y: point.y, width: 0, height: 0 },
      origin: point,
      rect,
      moved: false,
      targets: snapTargets(this.regions, index),
      tolerance: event.pointerType === 'mouse' ? 8 : 14,
    };
    const frame = this.frameRef.nativeElement;
    try { frame.setPointerCapture(event.pointerId); } catch { /* the pointer may already be gone */ }
    // With the pointer captured, the browser fires this gesture's click on the frame itself, not on the box that was
    // pressed, so onFrameClick would read it as a click on empty canvas and clear the selection that pointer-down
    // just made. Selection for this gesture is settled on press/release; its click must be ignored.
    this.suppressClick = true;
    frame.focus({ preventScroll: true });
    event.preventDefault();
  }

  private toPoint(event: PointerEvent | MouseEvent, rect: DOMRect): { x: number; y: number } {
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  private describeBox(box: RegionBox): string {
    const pct = (value: number) => Math.round(value * 100);
    return `left ${pct(box.x)}%, top ${pct(box.y)}%, ${pct(box.width)}% wide, ${pct(box.height)}% tall`;
  }

  private announce(text: string): void {
    this.announcement = text;
  }
}
