import { Component, DestroyRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogModule } from 'primeng/dialog';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';
import { CharactersService, CharacterSummary, CharacterRecipe, characterError, recipeFromImage } from './characters.service';
import { GenerationModelSettings, StableDiffusionService } from '../stable-diffusion.service';
import { SharedService } from '../shared.service';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { CharacterBrowserComponent } from './character-browser.component';
import { CharacterDraftsService } from './character-drafts.service';
import { CharacterChoice } from './characters.service';
import { CharacterLookSettingsComponent } from './character-look-settings.component';
import { CharacterDisclosureComponent } from './character-disclosure.component';

@Component({
  selector: 'app-character-save-dialog', standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, RouterLink, CharacterLookSettingsComponent, CharacterBrowserComponent, CharacterDisclosureComponent],
  templateUrl: './character-save-dialog.component.html', styleUrls: ['./characters.shared.css', './character-save-dialog.component.css'],
})
export class CharacterSaveDialogComponent {
  @ViewChild(CharacterLookSettingsComponent) private lookSettings?: CharacterLookSettingsComponent;
  readonly service = inject(CharactersService);
  private readonly sd = inject(StableDiffusionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly shared = inject(SharedService);
  visible = signal(false); loading = signal(false); saving = signal(false); error = signal(''); savedId = signal('');
  openingGenerator = signal(false); loadingModels = signal(false); modelsError = signal(false);
  characters: CharacterSummary[] = []; models: GenerationModelSettings[] = [];
  targetId = ''; name = ''; preview = ''; recipe!: CharacterRecipe; hasRegions = false;
  promptExpanded = false; settingsExpanded = false; savedName = '';
  private savedImageId = '';
  destinationOpen = false; destinationRequired = false;
  private initialDraft = ''; private requestSignature = ''; private requestId = '';
  private draftValue(): string { return JSON.stringify([this.name, this.targetId, this.recipe]); }
  get hasUnsavedChanges(): boolean { return this.visible() && !this.savedId() && (this.saving() || !!this.requestSignature || (!!this.initialDraft && this.initialDraft !== this.draftValue())); }

  get targetCharacter(): CharacterSummary | undefined { return this.characters.find(character => character.id === this.targetId); }
  get canUseImageSettings(): boolean {
    return !!this.image?.model && this.models.some(model => model.model_id === this.image?.model && model.is_active !== false);
  }
  get canSave(): boolean {
    return !this.destinationRequired && this.setupReady && !!this.recipe.appearance.trim() && this.recipe.appearance.length <= 8002 &&
      this.recipe.scene.length <= 2000 && (!!this.targetId || !!this.name.trim());
  }
  get setupReady(): boolean {
    if (!this.recipe?.model) return !!this.recipe && this.recipe.loras.length === 0;
    return !!this.models.find(m => m.model_id === this.recipe.model && m.is_active !== false) &&
      this.recipe.loras.length <= 3 && this.recipe.loras.every(l => Number.isFinite(l.strength) && l.strength >= 0 && l.strength <= 2);
  }
  private image: MobiansImage | null = null;
  private loadVersion = 0;
  private previewObjectUrl = '';
  private owner = '';

  constructor() {
    const unregister = inject(CharacterDraftsService).register(() => this.hasUnsavedChanges);
    this.destroyRef.onDestroy(unregister);
    this.service.saveRequests.pipe(takeUntilDestroyed()).subscribe(request => void this.open(request.image, request.characterId));
    this.shared.getUserData().pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.owner && this.owner !== this.service.owner) this.close();
    });
    this.destroyRef.onDestroy(() => this.close());
  }

  async open(image: MobiansImage, characterId?: string): Promise<void> {
    this.close();
    const version = ++this.loadVersion;
    this.owner = this.service.owner; this.image = image;
    this.recipe = recipeFromImage(image, false); this.models = [];
    this.hasRegions = !!image.regional_prompting?.enabled;
    this.targetId = characterId || image.characterId || ''; this.destinationRequired = false; this.destinationOpen = false; this.name = ''; this.savedName = ''; this.savedId.set(''); this.savedImageId = ''; this.error.set('');
    this.promptExpanded = !this.recipe.appearance.trim() || this.recipe.appearance.length > 8002;
    this.settingsExpanded = false;
    this.preview = image.blob ? (this.previewObjectUrl = URL.createObjectURL(image.blob)) : image.url || image.thumbnailUrl || image.base64 || '';
    this.loading.set(true); this.visible.set(true);
    // Model lookup must not delay the default, prompt-only save.
    this.loadingModels.set(true);
    const models = this.loadModels();
    try {
      const list = await this.service.list();
      if (version !== this.loadVersion) return;
      this.characters = list.characters;
      if (this.targetId && !this.targetCharacter) {
        try {
          const target = await this.service.get(this.targetId);
          if (version !== this.loadVersion) return;
          this.characters = [...this.characters, { id: target.id, name: target.name, thumbnail: null, image_count: target.image_count ?? target.images.length, updated_at: '' }];
        } catch {
          if (version !== this.loadVersion) return;
          this.targetId = ''; this.destinationRequired = true; this.destinationOpen = true;
          this.error.set('The original character is unavailable. Choose where to save this look.');
        }
      }
      if (this.targetId) this.changeTarget(this.targetId);
    } catch (error) { if (version === this.loadVersion) this.error.set(characterError(error)); }
    finally { if (version === this.loadVersion) this.loading.set(false); }
    this.initialDraft = this.draftValue();
    await models;
  }

  changeTarget(id: string): void {
    this.destinationRequired = false; this.destinationOpen = false;
    const previousDefault = this.targetCharacter ? `Look ${this.targetCharacter.image_count + 1}` : 'Original look';
    const wasDefault = !this.recipe.label.trim() || this.recipe.label === previousDefault || this.recipe.label === 'Original look';
    this.targetId = id;
    if (wasDefault) this.recipe.label = this.targetCharacter ? `Look ${this.targetCharacter.image_count + 1}` : 'Original look';
  }

  async loadModels(): Promise<void> {
    const version = this.loadVersion; this.loadingModels.set(true); this.modelsError.set(false);
    try {
      const catalog = await firstValueFrom(this.sd.getGenerationModels().pipe(timeout(15000)));
      if (version === this.loadVersion) this.models = catalog.models;
    } catch { if (version === this.loadVersion) this.modelsError.set(true); }
    finally { if (version === this.loadVersion) this.loadingModels.set(false); }
  }

  async chooseDestination(choice: CharacterChoice): Promise<void> {
    const version = this.loadVersion;
    try {
      const character = await this.service.get(choice.characterId);
      if (version !== this.loadVersion) return;
      if (!this.characters.some(c => c.id === character.id)) this.characters.push({ id: character.id, name: character.name, thumbnail: null, image_count: character.image_count ?? character.images.length, updated_at: '' });
      this.changeTarget(character.id); this.error.set('');
    } catch (error) { if (version === this.loadVersion) this.error.set(characterError(error)); }
  }

  useImageSettings(): void {
    if (!this.image || this.saving() || !this.canUseImageSettings) return;
    const original = recipeFromImage(this.image);
    this.recipe.model = original.model; this.recipe.loras = original.loras;
    void this.lookSettings?.loadLoras();
  }

  close(): void {
    ++this.loadVersion; this.visible.set(false); this.saving.set(false); this.openingGenerator.set(false); this.image = null;
    if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = ''; this.preview = ''; this.characters = []; this.owner = ''; this.initialDraft = ''; this.requestSignature = ''; this.requestId = '';
  }

  async save(): Promise<void> {
    if (this.saving() || this.loading() || !this.canSave || !this.image) return;
    const version = this.loadVersion;
    this.recipe.label = this.recipe.label.trim() || (this.targetCharacter ? `Look ${this.targetCharacter.image_count + 1}` : 'Original look');
    const recipe = structuredClone(this.recipe);
    const name = this.name.trim();
    const targetId = this.targetId;
    const savedName = this.targetCharacter?.name || name;
    this.saving.set(true); this.error.set('');
    try {
      let blob = this.image.blob;
      if (!blob && this.image.base64) {
        const data = this.image.base64.startsWith('data:') ? this.image.base64 : `data:image/png;base64,${this.image.base64}`;
        blob = await (await fetch(data)).blob();
      }
      if (!blob && this.image.url?.startsWith('blob:')) blob = await (await fetch(this.image.url)).blob();
      if (!blob) throw new Error('This image is not available locally. Open it from History and try again.');
      if (blob.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read this image.')); reader.readAsDataURL(blob!);
      });
      if (version !== this.loadVersion || this.owner !== this.service.owner) return;
      const signature = JSON.stringify([name, recipe, targetId, encoded]);
      if (signature !== this.requestSignature) { this.requestId = crypto.randomUUID(); this.requestSignature = signature; }
      const result = await this.service.save(name, recipe, encoded, targetId || undefined, this.requestId);
      if (version !== this.loadVersion || this.owner !== this.service.owner) return;
      this.savedName = savedName; this.savedImageId = (result as { image_id?: string }).image_id || '';
      this.savedId.set(result.id); this.service.saved.next(result.id);
    } catch (error) { if (version === this.loadVersion) this.error.set(characterError(error)); }
    finally { if (version === this.loadVersion) this.saving.set(false); }
  }

  async createFromSaved(): Promise<void> {
    if (!this.savedId() || this.openingGenerator()) return;
    const version = this.loadVersion;
    this.openingGenerator.set(true); this.error.set('');
    try {
      const character = await this.service.get(this.savedId(), this.savedImageId || undefined);
      if (version !== this.loadVersion || this.owner !== this.service.owner) return;
      const look = this.savedImageId ? character.images.find(image => image.id === this.savedImageId) : character.images.length === 1 ? character.images[0] : undefined;
      if (!look) throw new Error('Open your character to choose the look you want to use.');
      await this.service.useImage(character, look, 'create');
      if (version === this.loadVersion) this.close();
    } catch (error) { if (version === this.loadVersion) this.error.set(characterError(error)); }
    finally { if (version === this.loadVersion) this.openingGenerator.set(false); }
  }
}

