import { Injectable, signal } from '@angular/core';

/** A shortcut button a visitor can show on the images they generate. */
export type ResultImageAction = 'favorite' | 'character' | 'edit' | 'video' | 'download';

export interface ResultImageActionOption {
  id: ResultImageAction;
  label: string;
  icon: string;
  /** Shown until the visitor says otherwise. */
  defaultOn: boolean;
}

/** In display order, left to right: Download sits in the corner of the image. */
export const RESULT_IMAGE_ACTIONS: readonly ResultImageActionOption[] = [
  { id: 'favorite', label: 'Favorite', icon: 'bi-star', defaultOn: false },
  { id: 'character', label: 'Save as a character', icon: 'bi-bookmark-heart', defaultOn: false },
  { id: 'edit', label: 'Edit with AI', icon: 'bi-stars', defaultOn: false },
  { id: 'video', label: 'Make a video', icon: 'bi-camera-reels', defaultOn: true },
  { id: 'download', label: 'Download', icon: 'bi-download', defaultOn: true },
];

type Choices = Record<ResultImageAction, boolean>;

const STORAGE_KEY = 'mobians:result-image-buttons:v1';

/**
 * Which buttons the visitor wants on their result images. Chosen in the Options panel, read by the
 * image grid, and kept in this browser like the site theme.
 */
@Injectable({ providedIn: 'root' })
export class ResultImageActionsService {
  /** Only what the visitor has switched themselves, so every other button keeps following its default. */
  private chosen: Partial<Choices> = this.load();

  readonly enabled = signal<Choices>(this.withDefaults());

  isOn(id: ResultImageAction): boolean {
    return this.enabled()[id];
  }

  set(id: ResultImageAction, on: boolean): void {
    this.chosen = { ...this.chosen, [id]: on };
    this.enabled.set(this.withDefaults());
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.chosen));
    } catch {
      // Storage unavailable: the choice lasts until the page is closed.
    }
  }

  /** "Reset Saved Options": back to the default buttons. */
  reset(): void {
    this.chosen = {};
    this.enabled.set(this.withDefaults());
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing was stored.
    }
  }

  private withDefaults(): Choices {
    return Object.fromEntries(
      RESULT_IMAGE_ACTIONS.map(action => [action.id, this.chosen[action.id] ?? action.defaultOn])
    ) as Choices;
  }

  private load(): Partial<Choices> {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      const chosen: Partial<Choices> = {};
      for (const action of RESULT_IMAGE_ACTIONS) {
        if (typeof stored?.[action.id] === 'boolean') chosen[action.id] = stored[action.id];
      }
      return chosen;
    } catch {
      return {};
    }
  }
}
