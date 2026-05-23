import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { finalize, shareReplay, tap } from 'rxjs/operators';
import { DynamicPromptLibraryResponse, StableDiffusionService } from './stable-diffusion.service';

@Injectable({ providedIn: 'root' })
export class DynamicPromptLibraryStateService {
  private readonly stableDiffusionService = inject(StableDiffusionService);
  private libraryRequest$?: Observable<DynamicPromptLibraryResponse>;

  readonly library = signal<DynamicPromptLibraryResponse | null>(null);
  readonly loading = signal(false);
  readonly loaded = computed(() => this.library() !== null);
  readonly validWildcardIds = computed(() => {
    const wildcardIds = new Set<string>();
    for (const category of this.library()?.categories ?? []) {
      this.addWildcardId(wildcardIds, category.id);
    }
    return wildcardIds;
  });

  ensureLoaded(): Observable<DynamicPromptLibraryResponse> {
    const currentLibrary = this.library();
    if (currentLibrary) {
      return of(currentLibrary);
    }
    return this.loadLibrary();
  }

  refresh(): Observable<DynamicPromptLibraryResponse> {
    this.libraryRequest$ = undefined;
    return this.loadLibrary();
  }

  isKnownWildcardId(id: string | undefined): boolean {
    const normalizedId = String(id || '').trim();
    return !!normalizedId && this.validWildcardIds().has(normalizedId);
  }

  hasKnownWildcardToken(value: string | undefined): boolean {
    const prompt = String(value || '');
    const wildcardPattern = /(?<!_)_([A-Za-z0-9](?:[-\w/]*[A-Za-z0-9])?)_(?!_)/g;
    let match: RegExpExecArray | null;
    while ((match = wildcardPattern.exec(prompt)) !== null) {
      if (this.isKnownWildcardId(match[1])) {
        return true;
      }
    }
    return false;
  }

  hasUnknownWildcardToken(value: string | undefined): boolean {
    const prompt = String(value || '');
    const wildcardPattern = /(?<!_)_([A-Za-z0-9](?:[-\w/]*[A-Za-z0-9])?)_(?!_)/g;
    let match: RegExpExecArray | null;
    while ((match = wildcardPattern.exec(prompt)) !== null) {
      if (!this.isKnownWildcardId(match[1])) {
        return true;
      }
    }
    return false;
  }

  private loadLibrary(): Observable<DynamicPromptLibraryResponse> {
    if (this.libraryRequest$) {
      return this.libraryRequest$;
    }

    this.loading.set(true);
    this.libraryRequest$ = this.stableDiffusionService.getDynamicPromptLibrary().pipe(
      tap((library) => this.library.set(library)),
      finalize(() => {
        this.loading.set(false);
        this.libraryRequest$ = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.libraryRequest$;
  }

  private addWildcardId(wildcardIds: Set<string>, value: string | undefined): void {
    const normalizedValue = String(value || '').trim();
    if (normalizedValue) {
      wildcardIds.add(normalizedValue);
    }
  }
}