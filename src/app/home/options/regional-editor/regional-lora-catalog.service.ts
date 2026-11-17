import { Injectable, inject, signal } from '@angular/core';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { CatalogLora } from './regional-loras';

/**
 * The LoRA catalog for "LoRAs for this box": the same list the LoRA panel shows (`getLoras()`, cached by the
 * service), loaded the first time a region with LoRA support is opened and shared by the inline editor and the dialog.
 */
@Injectable({ providedIn: 'root' })
export class RegionalLoraCatalogService {
  private readonly api = inject(StableDiffusionService);

  readonly catalog = signal<CatalogLora[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  private loaded = false;

  ensureLoaded(): void {
    if (this.loaded || this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    this.api.getLoras().subscribe({
      next: (rows: unknown) => {
        this.catalog.set(Array.isArray(rows) ? (rows as CatalogLora[]) : []);
        this.loaded = true;
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
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
