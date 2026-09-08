import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, timeout } from 'rxjs';
import { CharacterRecipe } from './characters.service';
import { GenerationModelSettings, StableDiffusionService } from '../stable-diffusion.service';
import { loraThumbnailUrl } from 'src/_shared/lora-image';
import { CharacterDisclosureComponent } from './character-disclosure.component';

export function characterModelName(model: GenerationModelSettings): string {
  const names: Record<string, string> = {
    novaMobianXL_v20: 'Nova Mobian XL v2', novaMobianXL_v10: 'Nova Mobian XL v1',
    novaFurryXL_ilV140: 'Nova Furry XL v1.4', sonicDiffusionV4: 'Sonic Diffusion v4',
  };
  return names[model.model_id] || model.display_name || model.model_id;
}

@Component({
  selector: 'app-character-look-settings', standalone: true, imports: [FormsModule, CharacterDisclosureComponent],
  templateUrl: './character-look-settings.component.html',
  styleUrls: ['./characters.shared.css', './character-look-settings.component.css'],
})
export class CharacterLookSettingsComponent implements OnInit {
  private readonly sd = inject(StableDiffusionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  @Input({ required: true }) recipe!: CharacterRecipe;
  @Input() models: GenerationModelSettings[] = [];
  @Input() idPrefix = 'look';
  @Input() disabled = false;
  @Input() catalogReady = true;
  @Output() changed = new EventEmitter<void>();
  readonly modelName = characterModelName;
  catalog: any[] = [];
  private readonly failedPreviews = new Set<string>();
  previewUrl(lora: any): string {
    return this.failedPreviews.has(lora.image_url) ? '' : loraThumbnailUrl(lora.image_url, 160);
  }
  previewFailed(lora: any): void { this.failedPreviews.add(lora.image_url); }
  loading = false; loadError = ''; modelNotice = ''; query = ''; showNsfw = false;
  get activeModels() { return this.models.filter(m => m.is_active !== false); }
  get model() { return this.activeModels.find(m => m.model_id === this.recipe.model); }
  get results() {
    const query = this.query.trim().toLowerCase();
    return this.catalog.filter(l => l.base_model === this.model?.base_model && l.is_active !== false &&
      (this.showNsfw || !l.is_nsfw) && !this.recipe.loras.some(s => this.sameLora(s, l)) &&
      `${l.name} ${l.version || ''}`.toLowerCase().includes(query)).slice(0, 20);
  }
  ngOnInit(): void { if (this.recipe.model) void this.loadLoras(); }
  async loadLoras(): Promise<void> {
    if (this.loading) return;
    this.loading = true; this.loadError = '';
    try {
      const rows = await firstValueFrom(this.sd.getLoras('active', 'summary').pipe(timeout(15000)));
      if (!this.destroyRef.destroyed) this.catalog = Array.isArray(rows) ? rows : [];
    } catch {
      if (!this.destroyRef.destroyed) this.loadError = 'Could not load LoRAs. Your saved selections are kept.';
    } finally { if (!this.destroyRef.destroyed) { this.loading = false; this.cdr.markForCheck(); } }
  }
  sameLora(a: any, b: any): boolean {
    return a.version_id ? String(a.version_id) === String(b.version_id) : String(a.id) === String(b.id);
  }
  changeModel(modelId: string): void {
    if (this.disabled) return;
    if (!modelId) {
      this.recipe.model = ''; this.recipe.loras = [];
      this.modelNotice = ''; this.changed.emit(); return;
    }
    const next = this.activeModels.find(m => m.model_id === modelId);
    if (!next || this.disabled) return;
    const previousFamily = this.model?.base_model;
    this.recipe.model = next.model_id;
    const before = this.recipe.loras.length;
    this.recipe.loras = this.recipe.loras.filter(saved => {
      const lora = this.catalog.find(l => this.sameLora(saved, l));
      return lora ? lora.base_model === next.base_model : previousFamily === next.base_model;
    });
    const removed = before - this.recipe.loras.length;
    this.modelNotice = removed
      ? `${removed} LoRA selection(s) were cleared because compatibility with this model could not be confirmed. Review any trigger words in Saved prompt for this look.`
      : 'Future images will use this model. Your saved image stays the same; new results may look different.';
    this.changed.emit();
    if (!this.catalog.length) void this.loadLoras();
  }
  add(lora: any): void {
    if (this.disabled || !this.model || lora.base_model !== this.model.base_model || this.recipe.loras.length >= 3 || this.recipe.loras.some(s => this.sameLora(s, lora))) return;
    this.recipe.loras = [...this.recipe.loras, { id: lora.id, version_id: lora.version_id, name: lora.name, strength: 1 }];
    this.changed.emit();
  }
  remove(index: number): void { if (!this.disabled) { this.recipe.loras = this.recipe.loras.filter((_, i) => i !== index); this.changed.emit(); } }
  triggers(saved: any): string[] {
    const words = this.catalog.find(l => this.sameLora(saved, l))?.trigger_words;
    return Array.isArray(words) ? words.filter(w => typeof w === 'string' && w.trim()) : [];
  }
  addTriggers(saved: any): void {
    if (this.disabled) return;
    const existing = this.recipe.appearance.toLowerCase();
    const missing = this.triggers(saved).filter(word => !existing.includes(word.toLowerCase()));
    if (missing.length) { this.recipe.appearance = [this.recipe.appearance.trim(), ...missing].filter(Boolean).join(', '); this.changed.emit(); }
  }
}
