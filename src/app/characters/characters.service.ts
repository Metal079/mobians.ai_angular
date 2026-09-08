import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, firstValueFrom, map, timeout, retry } from 'rxjs';
import { environment } from 'src/environments/environment';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { SharedService } from '../shared.service';
import { AccountCtaService } from '../auth/account-cta.service';

export interface CharacterRecipe {
  label: string;
  model: string;
  appearance: string;
  scene: string;
  negative_prompt: string;
  guidance_scale: number;
  width: number;
  height: number;
  loras: any[];
}
export interface CharacterSearchHit extends CharacterImage { character_id: string; name: string; image_count: number; }
export interface CharacterPage<T> { items: T[]; next_cursor: string | null; }
export interface CharacterChoice { characterId: string; imageId?: string; name: string; }

export interface CharacterSummary {
  id: string; name: string; updated_at: string; image_count: number; thumbnail: string | null; default_image_id?: string;
}
export interface CharacterImage {
  id: string; recipe: CharacterRecipe; thumbnail: string; created_at: string;
}
export interface CharacterDetail {
  id: string; name: string; images: CharacterImage[]; default_image_id?: string; image_count?: number; next_cursor?: string | null;
}
export interface CharacterHandoff {
  name: string; recipe: CharacterRecipe; image?: MobiansImage;
  characterId?: string; imageId?: string;
  currentModel?: string; currentLoras?: any[];
}

export function characterPrompt(recipe: CharacterRecipe): string {
  return [recipe.appearance.trim(), recipe.scene.trim()].filter(Boolean).join(', ');
}

// Older looks stored part of their prompt separately. Keep that text visible
// and editable in the single look prompt; scene is now only a handoff field.
export function normalizeSavedRecipe(recipe: CharacterRecipe): CharacterRecipe {
  return { ...structuredClone(recipe), appearance: characterPrompt(recipe), scene: '' };
}

export function recipeFromImage(image: MobiansImage, includeModel = true): CharacterRecipe {
  const portrait = image.aspectRatio === 'portrait' || image.height > image.width * 1.1;
  const landscape = image.aspectRatio === 'landscape' || image.width > image.height * 1.1;
  return {
    label: 'Original look', model: includeModel ? image.model || '' : '', appearance: image.prompt || '', scene: '',
    negative_prompt: image.negativePrompt || '', guidance_scale: image.cfg ?? 4,
    width: landscape ? 768 : 512, height: portrait ? 768 : 512,
    loras: (includeModel ? image.loras || [] : []).map(lora => ({
      id: lora.id || null, version_id: lora.version_id || lora.modelVersionId || null,
      name: lora.name || '', strength: lora.strength ?? 1,
    })),
  };
}

export function characterError(error: any): string {
  const detail = error?.error?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return 'Check the name and saved setup. Some values are missing or too long.';
  return error instanceof Error && !(error as any).status ? error.message : 'Could not reach My Characters. Please try again.';
}

@Injectable({ providedIn: 'root' })
export class CharactersService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly shared = inject(SharedService);
  private readonly accountCta = inject(AccountCtaService);
  private readonly base = `${environment.apiBaseUrl}/characters`;
  readonly saveRequests = new Subject<{ image: MobiansImage; characterId?: string }>();
  readonly saved = new Subject<string>();
  readonly imageHandoffReady = new Subject<void>();
  readonly activeCharacter = signal<{ id: string; name: string; imageId: string } | null>(null);
  private imageHandoff: CharacterHandoff | null = null;
  private videoHandoff: MobiansImage | null = null;
  private lastOwner = '';

  constructor() {
    this.shared.getUserData().subscribe(() => {
      const owner = this.owner;
      if (owner !== this.lastOwner) {
        this.imageHandoff = null;
        this.videoHandoff = null;
        this.clearActiveCharacter();
        this.lastOwner = owner;
      }
    });
  }

  get owner(): string { return this.shared.getUserDataValue()?.token || ''; }

  requestSave(image: MobiansImage, characterId?: string): void {
    if (!this.owner) {
      this.accountCta.requestLogin({ reason: 'generic', message: 'Sign in to save private characters and use them across your devices.' });
      return;
    }
    this.saveRequests.next({ image, characterId });
  }

  list(q = '', cursor?: string) {
    let params = new HttpParams().set('page_size', 40).set('q', q);
    if (cursor) params = params.set('cursor', cursor);
    return firstValueFrom(this.http.get<{ characters: CharacterSummary[]; next_cursor?: string | null; limits?: { characters: number | null; images_per_character: number | null } }>(this.base, { params }).pipe(timeout(15000)));
  }
  search(q = '', cursor?: string, characterId?: string) {
    let params = new HttpParams().set('page_size', 40).set('q', q);
    if (cursor) params = params.set('cursor', cursor);
    if (characterId) params = params.set('character_id', characterId);
    return firstValueFrom(this.http.get<CharacterPage<CharacterSearchHit>>(`${this.base}/search`, { params }).pipe(timeout(15000)));
  }
  get(id: string, imageId?: string) {
    let params = new HttpParams().set('page_size', 40);
    if (imageId) params = params.set('image_id', imageId);
    return firstValueFrom(this.http.get<CharacterDetail>(`${this.base}/${id}`, { params }).pipe(
      map(character => ({ ...character, images: character.images.map(image => ({ ...image, recipe: normalizeSavedRecipe(image.recipe) })) })), timeout(15000)));
  }
  defaultLook(character: CharacterDetail): CharacterImage | undefined {
    return character.images.find(i => i.id === character.default_image_id) || character.images[0];
  }
  save(name: string, recipe: CharacterRecipe, image_base64: string, id?: string, requestId?: string) {
    return firstValueFrom(this.http.post<{ id: string; image_id?: string }>(id ? `${this.base}/${id}/images` : this.base,
      id ? { recipe, image_base64, ...(requestId ? { request_id: requestId } : {}) } : { name, recipe, image_base64, ...(requestId ? { request_id: requestId } : {}) }).pipe(timeout(30000)));
  }
  rename(id: string, name: string) { return firstValueFrom(this.http.patch(`${this.base}/${id}`, { name }).pipe(timeout(15000))); }
  setDefault(id: string, imageId: string) {
    return firstValueFrom(this.http.patch<{ id: string; default_image_id: string }>(`${this.base}/${id}/default-look`, { image_id: imageId }).pipe(timeout(15000)));
  }
  remove(id: string) { return firstValueFrom(this.http.delete(`${this.base}/${id}`).pipe(timeout(15000))); }
  removeImage(id: string, imageId: string) { return firstValueFrom(this.http.delete(`${this.base}/${id}/images/${imageId}`).pipe(timeout(15000))); }
  updateRecipe(id: string, imageId: string, recipe: CharacterRecipe) {
    return firstValueFrom(this.http.patch<{ recipe: CharacterRecipe }>(`${this.base}/${id}/images/${imageId}`, recipe).pipe(timeout(15000)));
  }
  media(id: string, imageId: string) {
    return firstValueFrom(this.http.get(`${this.base}/${id}/images/${imageId}/media`, { responseType: 'blob' }).pipe(timeout(20000)));
  }

  async useImage(character: CharacterDetail, selected: CharacterImage, action: 'create' | 'edit' | 'animate', options?: { scene?: string; promptsOnly?: boolean }): Promise<void> {
    if (action !== 'animate' && localStorage.getItem('mobians:pending-job')) {
      throw new Error('Finish or cancel your current image job before loading a character setup.');
    }
    const owner = this.owner;
    if (!owner) throw new Error('Sign in to use your saved character.');
    // The image route is recreated on navigation; carry its in-memory LoRA selection.
    const current = this.shared.getGenerationRequestValue();
    const currentModel = current?.model;
    const currentLoras = current ? structuredClone(current.loras || []) : undefined;
    const prepared = action === 'animate' ? selected.recipe : (await firstValueFrom(
      this.http.get<{ recipe: CharacterRecipe }>(`${this.base}/${character.id}/images/${selected.id}/prepare`, { params: options?.promptsOnly ? { prompts_only: true } : {} }).pipe(timeout(15000)))).recipe;
    const recipe = normalizeSavedRecipe(prepared);
    if (options?.scene !== undefined && action !== 'animate') recipe.scene = options.scene.trim();
    const blob = action === 'create' ? undefined : await this.media(character.id, selected.id);
    if (owner !== this.owner) throw new Error('Your account changed. Open My Characters again.');
    if (action !== 'animate' && localStorage.getItem('mobians:pending-job')) throw new Error('Finish or cancel your current image job before loading a character setup.');
    const image: MobiansImage | undefined = blob ? {
      UUID: `character-${selected.id}`, blob, width: recipe.width, height: recipe.height,
      aspectRatio: recipe.width > recipe.height ? 'landscape' : recipe.height > recipe.width ? 'portrait' : 'square',
      model: recipe.model, prompt: characterPrompt(recipe), negativePrompt: recipe.negative_prompt,
      cfg: recipe.guidance_scale, loras: recipe.loras,
    } : undefined;
    if (action === 'animate') this.videoHandoff = image!;
    else this.imageHandoff = { name: character.name, characterId: character.id, imageId: selected.id, recipe, image, currentModel, currentLoras };
    const target = action === 'animate' ? '/video' : '/';
    const sameImageRoute = action !== 'animate' && this.router.url?.split(/[?#]/)[0] === '/';
    let navigated: boolean;
    try { navigated = sameImageRoute || await this.router.navigateByUrl(target); }
    catch (error) { this.imageHandoff = null; this.videoHandoff = null; throw error; }
    if (!navigated) {
      this.imageHandoff = null; this.videoHandoff = null;
      throw new Error('Could not open the generator. Please try again.');
    }
    if (owner !== this.owner) {
      this.imageHandoff = null; this.videoHandoff = null;
      throw new Error('Your account changed. Open My Characters again.');
    }
    if (action !== 'animate') this.imageHandoffReady.next();
  }
  recordLoaded(characterId: string, imageId: string): void {
    if (!characterId || !imageId) return;
    void firstValueFrom(this.http.post(`${this.base}/${characterId}/images/${imageId}/used`, { event_id: crypto.randomUUID() }).pipe(timeout(10000), retry({ count: 1, delay: 500 }))).catch(() => {});
  }

  clearActiveCharacter(): void { this.activeCharacter.set(null); }
  takeImageHandoff(): CharacterHandoff | null {
    const pending = this.imageHandoff; this.imageHandoff = null;
    if (pending?.characterId && pending.imageId) this.activeCharacter.set({ id: pending.characterId, name: pending.name, imageId: pending.imageId });
    return pending;
  }
  takeVideoHandoff(): MobiansImage | null { const pending = this.videoHandoff; this.videoHandoff = null; return pending; }
}
