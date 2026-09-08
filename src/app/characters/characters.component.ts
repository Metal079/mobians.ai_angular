import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogModule } from 'primeng/dialog';
import { catchError, combineLatest, firstValueFrom, of, timeout } from 'rxjs';
import { CharactersService, CharacterDetail, CharacterImage, CharacterRecipe, CharacterSummary, characterError } from './characters.service';
import { SharedService } from '../shared.service';
import { AccountCtaService } from '../auth/account-cta.service';
import { GenerationModeSwitchComponent } from '../generation-mode-switch/generation-mode-switch.component';
import { ImageHistoryPanelComponent } from '../home/options/image-history-panel/image-history-panel.component';
import { GenerationModelSettings, StableDiffusionService } from '../stable-diffusion.service';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { CharacterBrowserComponent } from './character-browser.component';
import { CharacterDraftsService } from './character-drafts.service';
import { CharacterChoice, characterPrompt, normalizeSavedRecipe } from './characters.service';
import { CharacterLookSettingsComponent } from './character-look-settings.component';
import { CharacterDisclosureComponent } from './character-disclosure.component';

@Component({
  selector: 'app-characters', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DialogModule, GenerationModeSwitchComponent, ImageHistoryPanelComponent, CharacterLookSettingsComponent, CharacterBrowserComponent, CharacterDisclosureComponent],
  templateUrl: './characters.component.html', styleUrls: ['./characters.shared.css', './characters.component.css'],
})
export class CharactersComponent {
  readonly service = inject(CharactersService);
  private readonly shared = inject(SharedService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly accountCta = inject(AccountCtaService);
  private readonly sd = inject(StableDiffusionService);
  private readonly destroyRef = inject(DestroyRef);
  signedIn = signal(false); loading = signal(false); busy = signal(false); error = signal(''); notice = signal('');
  characters = signal<CharacterSummary[]>([]); character = signal<CharacterDetail | null>(null);
  selected = signal<CharacterImage | null>(null); models = signal<GenerationModelSettings[]>([]);
  preview = signal(''); previewLoading = signal(false); dirty = signal(false); search = signal('');
  pickerOpen = signal(false); renameOpen = signal(false); deleteMode = signal<'character' | 'image' | null>(null);
  editingOpen = signal(false); lookPickerOpen = signal(false); moreLooksLoading = signal(false);
  modelsLoading = signal(false); modelsError = signal(false);
  unavailableSetup = signal(false);
  get lookCount(): number { return this.character()?.image_count ?? this.character()?.images.length ?? 0; }

  filteredCharacters = computed(() => this.characters().filter(c => c.name.toLowerCase().includes(this.search().toLowerCase())));
  recipe: CharacterRecipe | null = null; renameValue = ''; nextScene = ''; private addTargetId?: string;
  get imagePrompt(): string {
    const recipe = this.selected()?.recipe;
    // Use the same normalization and prompt assembly as the generator handoff,
    // including scene text preserved in older saved looks.
    return recipe ? characterPrompt({ ...normalizeSavedRecipe(recipe), scene: this.nextScene }) : '';
  }
  private loadVersion = 0; private mediaVersion = 0; private owner = '';
  readonly model = computed(() => this.models().find(m => m.model_id === this.selected()?.recipe.model && m.is_active !== false));
  get setupReady(): boolean {
    if (!this.recipe?.model) return !!this.recipe && this.recipe.loras.length === 0;
    return !!this.models().find(m => m.model_id === this.recipe?.model && m.is_active !== false) &&
      this.recipe.loras.length <= 3 && !!this.recipe?.loras.every(l => Number.isFinite(l.strength) && l.strength >= 0 && l.strength <= 2);
  }

  constructor() {
    const unregister = inject(CharacterDraftsService).register(() =>
      (this.editingOpen() && this.dirty()) || (this.renameOpen() && this.renameValue !== this.character()?.name));
    this.destroyRef.onDestroy(unregister);
    let routeKey: string | null = null;
    combineLatest([this.shared.getUserData(), this.route.paramMap, this.route.queryParamMap || of(null)]).pipe(takeUntilDestroyed()).subscribe(([, params]) => {
      const owner = this.service.owner;
      const key = `${owner}|${params.get('id') || ''}|${this.route.snapshot.queryParamMap?.get('look') || ''}|${this.route.snapshot.queryParamMap?.get('edit') || ''}`;
      if (key === routeKey) return;
      routeKey = key;
      this.signedIn.set(!!owner);
      this.owner = owner; this.reset();
      if (owner) void this.load();
    });
    this.service.saved.pipe(takeUntilDestroyed()).subscribe(() => { if (this.signedIn()) void this.load(); });
    this.destroyRef.onDestroy(() => this.reset());
  }

  private reset(): void {
    ++this.loadVersion; ++this.mediaVersion; this.revokePreview();
    this.character.set(null); this.selected.set(null); this.characters.set([]); this.recipe = null;
    this.pickerOpen.set(false); this.renameOpen.set(false); this.deleteMode.set(null);
    this.editingOpen.set(false); this.lookPickerOpen.set(false); this.nextScene = '';
    this.error.set(''); this.unavailableSetup.set(false); this.notice.set(''); this.loading.set(false); this.busy.set(false); this.dirty.set(false);
  }

  async load(): Promise<void> {
    const version = ++this.loadVersion;
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true); this.error.set('');
    try {
      void this.loadModels();
      const [list, detail] = await Promise.all([
        this.service.list(),
        id ? this.service.get(id, this.route.snapshot.queryParamMap?.get('look') || undefined) : Promise.resolve(null),
      ]);
      if (version !== this.loadVersion) return;
      this.characters.set(list.characters); this.character.set(detail);
      if (detail?.images.length) {
        const requested = this.route.snapshot.queryParamMap?.get('look');
        this.selectImage(detail.images.find(i => i.id === requested) || detail.images.find(i => i.id === this.selected()?.id) || detail.images.find(i => i.id === detail.default_image_id) || detail.images[0]);
        if (this.route.snapshot.queryParamMap?.get('edit') === '1') this.editingOpen.set(true);
      }
      else { this.selected.set(null); this.recipe = null; this.revokePreview(); }
    } catch (error) { if (version === this.loadVersion) this.error.set(characterError(error)); }
    finally { if (version === this.loadVersion) this.loading.set(false); }
  }

  async loadModels(): Promise<void> {
    const version = this.loadVersion;
    this.modelsLoading.set(true); this.modelsError.set(false);
    try {
      const catalog = await firstValueFrom(this.sd.getGenerationModels().pipe(timeout(15000)));
      if (version === this.loadVersion) this.models.set(catalog.models);
    } catch { if (version === this.loadVersion) this.modelsError.set(true); }
    finally { if (version === this.loadVersion) this.modelsLoading.set(false); }
  }
  openResult(choice: CharacterChoice): void {
    void this.router.navigate(['/characters', choice.characterId], { queryParams: choice.imageId ? { look: choice.imageId } : {} });
  }
  async createResult(choice: CharacterChoice): Promise<void> {
    await this.run(async current => {
      const detail = await this.service.get(choice.characterId, choice.imageId);
      const look = choice.imageId ? detail.images.find(i => i.id === choice.imageId) : detail.images.find(i => i.id === detail.default_image_id) || detail.images[0];
      if (current() && look) await this.service.useImage(detail, look, 'create');
    });
  }
  async chooseLook(choice: CharacterChoice): Promise<void> {
    if (!choice.imageId) return;
    const known = this.character()?.images.find(i => i.id === choice.imageId);
    if (known) { this.selectImage(known); this.lookPickerOpen.set(false); return; }
    await this.run(async current => {
      const detail = await this.service.get(choice.characterId, choice.imageId);
      if (!current()) return;
      const look = detail.images.find(i => i.id === choice.imageId);
      if (look) {
        this.character.update(c => c ? { ...c, images: [...c.images, look] } : c);
        this.busy.set(false); this.selectImage(look); this.lookPickerOpen.set(false);
      }
    });
  }
  async moreLooks(): Promise<void> {
    const character = this.character(), version = this.loadVersion;
    if (!character?.next_cursor || this.moreLooksLoading()) return;
    this.moreLooksLoading.set(true);
    try {
      const page = await this.service.search('', character.next_cursor, character.id);
      if (version === this.loadVersion) this.character.update(c => c ? { ...c, next_cursor: page.next_cursor,
        images: [...new Map([...c.images, ...page.items.map(i => ({ ...i, recipe: normalizeSavedRecipe(i.recipe) }))].map(i => [i.id, i])).values()] } : c);
    } catch (error) { if (version === this.loadVersion) this.error.set(characterError(error)); }
    finally { if (version === this.loadVersion) this.moreLooksLoading.set(false); }
  }

  login(): void { this.accountCta.requestLogin({ reason: 'generic', message: 'Sign in to keep your characters and favorite looks together, across devices.' }); }

  pickImage(existing = false): void {
    this.addTargetId = existing ? this.character()?.id : undefined;
    this.pickerOpen.set(true);
  }

  onImagePicked(image: MobiansImage): void {
    this.pickerOpen.set(false); this.service.requestSave(image, this.addTargetId);
  }

  selectImage(image: CharacterImage): void {
    if (this.busy()) return;
    if (this.dirty()) { this.error.set('Save your setup changes before selecting another image.'); return; }
    this.selected.set(image); this.recipe = structuredClone(image.recipe); this.dirty.set(false); this.error.set(''); this.unavailableSetup.set(false);
    this.nextScene = '';
    void this.loadPreview(image);
  }

  selectLook(id: string): void {
    const image = this.character()?.images.find(look => look.id === id);
    if (image) this.selectImage(image);
  }

  private async loadPreview(image: CharacterImage): Promise<void> {
    const version = ++this.mediaVersion;
    const characterId = this.character()?.id;
    this.revokePreview(); this.previewLoading.set(true);
    if (!characterId) return;
    try {
      const blob = await this.service.media(characterId, image.id);
      if (version === this.mediaVersion) this.preview.set(URL.createObjectURL(blob));
    } catch (error) { if (version === this.mediaVersion) this.error.set(characterError(error)); }
    finally { if (version === this.mediaVersion) this.previewLoading.set(false); }
  }

  private revokePreview(): void { if (this.preview()) URL.revokeObjectURL(this.preview()); this.preview.set(''); }

  changeRecipe(): void { this.dirty.set(true); this.notice.set(''); }
  discardChanges(): void { if (this.selected()) this.recipe = structuredClone(this.selected()!.recipe); this.dirty.set(false); this.error.set(''); }
  closeEditor(): void { if (!this.busy()) { this.discardChanges(); this.editingOpen.set(false); } }
  isDefault(image: CharacterImage): boolean { return image.id === (this.character()?.default_image_id || this.character()?.images[0]?.id); }

  async makeDefault(): Promise<void> {
    const character = this.character(), selected = this.selected();
    if (!character || !selected || this.isDefault(selected)) return;
    await this.run(async current => {
      const result = await this.service.setDefault(character.id, selected.id);
      if (!current()) return;
      this.character.update(c => c ? { ...c, default_image_id: result.default_image_id, images: [selected, ...c.images.filter(i => i.id !== selected.id)] } : null);
      this.notice.set('Default look updated. This look will load when you choose this character.');
    });
  }

  async quickCreate(summary: CharacterSummary): Promise<void> {
    await this.run(async current => {
      const character = await this.service.get(summary.id);
      if (current() && character.images.length) await this.service.useImage(character, character.images.find(i => i.id === character.default_image_id) || character.images[0], 'create');
    });
  }

  async saveRecipe(): Promise<void> {
    if (!this.recipe || !this.setupReady || !this.character() || !this.selected() || this.busy()) return;
    const recipe = this.recipe;
    const characterId = this.character()!.id, imageId = this.selected()!.id;
    await this.run(async current => {
      const result = await this.service.updateRecipe(characterId, imageId, recipe);
      if (!current()) return;
      this.selected.update(image => image ? { ...image, recipe: result.recipe } : null);
      this.character.update(c => c ? { ...c, images: c.images.map(i => i.id === this.selected()?.id ? { ...i, recipe: result.recipe } : i) } : null);
      this.recipe = structuredClone(result.recipe); this.dirty.set(false); this.editingOpen.set(false); this.notice.set('Look updated.');
    });
  }

  async use(action: 'create' | 'edit' | 'animate', promptsOnly = false): Promise<void> {
    if (!this.character() || !this.selected() || this.dirty()) return;
    await this.run(() => this.service.useImage(this.character()!, this.selected()!, action, { scene: this.nextScene, ...(promptsOnly ? { promptsOnly: true } : {}) }));
  }

  openRename(): void { this.renameValue = this.character()?.name || ''; this.renameOpen.set(true); }
  async rename(): Promise<void> {
    if (!this.renameValue.trim() || !this.character()) return;
    const id = this.character()!.id, name = this.renameValue.trim();
    await this.run(async current => {
      await this.service.rename(id, name);
      if (!current()) return;
      this.character.update(c => c ? { ...c, name } : null); this.renameOpen.set(false);
    });
  }

  async confirmDelete(): Promise<void> {
    if (!this.character()) return;
    const id = this.character()!.id, imageId = this.selected()?.id, mode = this.deleteMode();
    await this.run(async current => {
      if (mode === 'character') {
        await this.service.remove(id);
        if (!current()) return;
        this.deleteMode.set(null);
        await this.router.navigateByUrl('/characters');
      } else if (imageId) {
        await this.service.removeImage(id, imageId);
        if (!current()) return;
        this.deleteMode.set(null); this.dirty.set(false); this.busy.set(false); await this.load();
      }
    });
  }

  private async run(work: (current: () => boolean) => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    const owner = this.owner;
    const version = this.loadVersion;
    const current = () => owner === this.owner && version === this.loadVersion;
    this.busy.set(true); this.error.set(''); this.unavailableSetup.set(false); this.notice.set('');
    try { await work(current); }
    catch (error: any) { if (current()) { this.error.set(characterError(error)); this.unavailableSetup.set(error?.status === 409); } }
    finally { if (current()) this.busy.set(false); }
  }
}
