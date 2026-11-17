import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { RegionalPromptingConfig } from 'src/_shared/regional-prompting.interface';
import { cloneRegionalConfig, restoreRegionalConfig } from './regional-state';
import { UndoStack } from './regional-undo';

export interface RegionalReuseRequest {
  /** The stored regional settings of a history image (version 1 or 2). */
  regional: unknown;
  /** Open the full-screen editor after loading. */
  openEditor: boolean;
}

/**
 * Editor state shared by the inline editor, the full-screen dialog and the status chip: selection, undo history,
 * dialog visibility and "reuse layout" requests from the image history. The regional settings themselves stay in
 * the generation request (`generationRequest.regional_prompting`).
 */
@Injectable({ providedIn: 'root' })
export class RegionalEditorService {
  readonly dialogOpen = signal(false);
  readonly selectedId = signal<string | null>(null);
  /** Bumped after undo/redo so views refresh derived values. */
  readonly revision = signal(0);

  private readonly history = new UndoStack<RegionalPromptingConfig>(60);
  private readonly reuseSubject = new Subject<RegionalReuseRequest>();
  readonly reuseRequests$ = this.reuseSubject.asObservable();

  get canUndo(): boolean { return this.history.canUndo; }
  get canRedo(): boolean { return this.history.canRedo; }

  /** Call before changing the config. A key merges repeated changes (typing, nudging) into one undo step. */
  checkpoint(config: RegionalPromptingConfig, key?: string): void {
    this.history.record(cloneRegionalConfig(config), key);
  }

  /** Ends a merge window (for example when the user moves to another field). */
  sealHistory(): void { this.history.seal(); }

  undo(config: RegionalPromptingConfig): boolean {
    const previous = this.history.undo(cloneRegionalConfig(config));
    if (!previous) return false;
    this.restore(config, previous);
    return true;
  }

  redo(config: RegionalPromptingConfig): boolean {
    const next = this.history.redo(cloneRegionalConfig(config));
    if (!next) return false;
    this.restore(config, next);
    return true;
  }

  openDialog(): void { this.dialogOpen.set(true); }
  closeDialog(): void { this.dialogOpen.set(false); }

  requestReuse(regional: unknown, openEditor = true): void {
    this.reuseSubject.next({ regional, openEditor });
  }

  private restore(config: RegionalPromptingConfig, snapshot: RegionalPromptingConfig): void {
    restoreRegionalConfig(config, snapshot);
    const selected = this.selectedId();
    if (selected && !config.regions.some(region => region.id === selected)) {
      this.selectedId.set(config.regions[0]?.id ?? null);
    }
    this.revision.update(value => value + 1);
  }
}
