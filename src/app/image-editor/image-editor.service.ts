import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { distinctUntilChanged, firstValueFrom, map } from 'rxjs';
import { environment } from 'src/environments/environment';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { SharedService } from '../shared.service';
import type { CharacterRecipe } from '../characters/characters.service';

export const IMAGE_EDIT_MODEL = 'FLUX.2-klein-4B';
export const IMAGE_EDIT_MODELS = [IMAGE_EDIT_MODEL];
export interface ImageEditorContext {
  image?: MobiansImage;
  characterId?: string;
  characterName?: string;
  lookId?: string;
  recipe?: CharacterRecipe;
  prompt?: string;
}

@Injectable({ providedIn: 'root' })
export class ImageEditorService {
  private readonly http = inject(HttpClient);
  private readonly shared = inject(SharedService);
  readonly available = signal(false);
  readonly context = signal<ImageEditorContext | null>(null);
  readonly pending = signal(false);
  readonly presentation = signal<'dialog' | 'inline' | 'hidden'>('dialog');
  readonly priorityCreditCost = signal<number | null>(null);
  readonly activeModel = signal(IMAGE_EDIT_MODEL);
  readonly defaultSteps = signal(4);
  readonly tutorialVisible = signal(false);
  private tutorialOwner = '';
  private readonly tutorialSeen = new Set<string>();
  private version = 0;
  constructor() {
    this.shared.getUserData().pipe(
      map(user => `${user?.user_id || ''}:${!!user?.is_banned}`),
      distinctUntilChanged(),
    ).subscribe(() => { this.hideTutorial(); void this.refresh(); });
  }
  get owner(): string { return String(this.shared.getUserDataValue()?.user_id || ''); }
  async refresh(): Promise<void> {
    const version = ++this.version;
    this.available.set(false);
    this.priorityCreditCost.set(null);
    if (!this.owner || this.shared.getUserDataValue()?.is_banned) return;
    try {
      const catalog = await firstValueFrom(this.http.get<any>(`${environment.apiBaseUrl}/models`));
      if (version === this.version) {
        const model = catalog.models.find((m: any) => m.model_id === IMAGE_EDIT_MODEL && m.is_active && m.supported_operations?.includes('instruction_edit'));
        if (model) {
          this.activeModel.set(model.model_id);
          this.defaultSteps.set(model.default_steps);
          this.priorityCreditCost.set(Number.isInteger(model.credit_cost) && model.credit_cost > 0 ? model.credit_cost : null);
        }
        this.available.set(!!model);
      }
    } catch { /* A catalog outage must not enable an editor with stale pricing. */ }
  }
  open(context: ImageEditorContext): void {
    if (this.available() && !this.pending()) {
      this.presentation.set('dialog');
      this.context.set(context); void this.refresh();
      this.showTutorial(true);
    }
  }
  showInline(context: ImageEditorContext = {}): void {
    if (!this.context()) {
      if (!this.available() || this.pending()) return;
      this.context.set(context); void this.refresh();
    }
    this.presentation.set('inline');
    this.showTutorial(true);
  }
  showGenerator(): void { this.hideTutorial(); this.presentation.set('hidden'); }
  leaveImagePage(): void {
    this.hideTutorial();
    if (this.presentation() !== 'dialog') this.presentation.set(this.pending() ? 'dialog' : 'hidden');
  }
  close(): void { if (!this.pending()) { this.hideTutorial(); this.context.set(null); } }

  // Versioned and account-scoped: one person's dismissal must not hide another's introduction.
  private tutorialKey(owner: string): string { return `mobians:image-edit-tutorial:v1:${owner}`; }
  showTutorial(firstUseOnly = false): void {
    const owner = this.owner;
    if (!owner || !this.context() || this.pending() || this.shared.getUserDataValue()?.is_banned) return;
    const key = this.tutorialKey(owner);
    let seen = this.tutorialSeen.has(key);
    try { seen ||= localStorage.getItem(key) === 'seen'; } catch { /* Session fallback for blocked storage. */ }
    if (firstUseOnly && seen) return;
    this.tutorialOwner = owner;
    this.tutorialVisible.set(true);
  }
  dismissTutorial(): void {
    if (this.tutorialVisible() && this.tutorialOwner === this.owner) {
      const key = this.tutorialKey(this.owner);
      this.tutorialSeen.add(key);
      try { localStorage.setItem(key, 'seen'); } catch { /* Keep the session dismissal. */ }
    }
    this.hideTutorial();
  }
  private hideTutorial(): void { this.tutorialVisible.set(false); this.tutorialOwner = ''; }
}
