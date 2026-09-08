import { Injectable, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class CharacterDraftsService {
  private drafts = new Set<() => boolean>();
  constructor() {
    window.addEventListener('beforeunload', event => {
      if (this.dirty()) { event.preventDefault(); event.returnValue = ''; }
    });
  }
  register(check: () => boolean): () => void { this.drafts.add(check); return () => this.drafts.delete(check); }
  dirty(): boolean { return [...this.drafts].some(check => check()); }
  canLeave(): boolean { return !this.dirty() || window.confirm('Discard your unsaved character changes and leave?'); }
}
export const characterDraftGuard: CanDeactivateFn<unknown> = () => inject(CharacterDraftsService).canLeave();
