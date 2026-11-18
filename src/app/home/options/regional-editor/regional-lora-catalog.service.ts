import { Injectable, inject, signal } from '@angular/core';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { CatalogLora } from './regional-loras';

/**
 * The LoRA catalog for "LoRAs for this box": the same list the LoRA panel shows (`getLoras()`, cached by the
 * service). Loaded with the page when saved regions have LoRAs (options.component.ts: it decides which are sent and
 * charged), otherwise the first time a region with LoRA support is opened in the editor.
 */
@Injectable({ providedIn: 'root' })
export class RegionalLoraCatalogService {
  private readonly api = inject(StableDiffusionService);

  readonly catalog = signal<CatalogLora[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  private loaded = false;
  private waiting: Array<(catalog: CatalogLora[] | null) => void> = [];

  ensureLoaded(): void {
    if (this.loaded || this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    this.api.getLoras().subscribe({
      next: (rows: unknown) => {
        this.catalog.set(Array.isArray(rows) ? (rows as CatalogLora[]) : []);
        this.loaded = true;
        this.loading.set(false);
        this.settle(this.catalog());
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
        this.settle(null);
      },
    });
  }

  /** The catalog once loaded (starts loading if needed); null when it could not be loaded. */
  whenLoaded(): Promise<CatalogLora[] | null> {
    if (this.loaded) return Promise.resolve(this.catalog());
    const result = new Promise<CatalogLora[] | null>(resolve => this.waiting.push(resolve));
    this.ensureLoaded();
    return result;
  }

  private settle(catalog: CatalogLora[] | null): void {
    const waiting = this.waiting;
    this.waiting = [];
    waiting.forEach(resolve => resolve(catalog));
  }

  /** The LoRA panel's "show NSFW LoRAs" choice (kept in this browser). */
  showNsfw(): boolean {
    try {
      return localStorage.getItem('showNSFWLoras') === 'true';
    } catch {
      return false;
    }
  }
}
