import { Component, DoCheck, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MessageService } from 'primeng/api';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { RegionalModelCapability, RegionalPromptingConfig, RegionalPromptRegion, RegionalSeparation } from 'src/_shared/regional-prompting.interface';
import { HintComponent } from 'src/app/hint/hint.component';
import { SharedService } from 'src/app/shared.service';
import { GenerationModelSettings } from 'src/app/stable-diffusion.service';
import { RegionalCanvasCommand, RegionalCanvasComponent } from './regional-canvas.component';
import { RegionalEditorService } from './regional-editor.service';
import { duplicateOffset, freeSpot } from './regional-geometry';
import { layoutHintText } from './regional-layout-hints';
import { RegionalMinimapComponent } from './regional-minimap.component';
import { RegionalLoraCatalogService } from './regional-lora-catalog.service';
import { RegionalLoraPickerComponent } from './regional-lora-picker.component';
import { findCatalogLora, REGION_LORA_LIMITS } from './regional-loras';
import { RegionalPreset, RegionalPresetsService } from './regional-presets.service';
import {
  clamp, clampBox, cloneRegion, composedRegionPrompt, regionTextWeight, createRegion, newRegionId, normaliseRegionalConfig, promptSnippet,
  regionalFamily, RegionalFamily, RegionalPayloadOptions, regionalStatus, RegionalStatus, regionColor, REGIONAL_LIMITS, RegionBox,
  regionLoraBudget, regionLoraUsable, resolveRegionalCapability, sharedSubjectTag,
} from './regional-state';
import { applyTemplateToConfig, REGIONAL_TEMPLATES, RegionalTemplate } from './regional-templates';

type GeometryKey = 'x' | 'y' | 'width' | 'height';

let instanceCounter = 0;

/**
 * Regional prompting editor (SPEC 5). The same component is used inline in the Options panel and in the
 * full-screen dialog; both edit `generationRequest.regional_prompting` and share selection and undo history.
 */
@Component({
  selector: 'app-regional-editor',
  standalone: true,
  imports: [NgTemplateOutlet, RegionalCanvasComponent, RegionalMinimapComponent, RegionalLoraPickerComponent, HintComponent],
  templateUrl: './regional-editor.component.html',
  styleUrls: ['./regional-editor.component.css', './regional-editor-list.css'],
})
export class RegionalEditorComponent implements OnChanges, DoCheck, OnDestroy {
  readonly store = inject(RegionalEditorService);
  private readonly presetsService = inject(RegionalPresetsService);
  private readonly loraCatalog = inject(RegionalLoraCatalogService);
  private readonly messages = inject(MessageService);
  private readonly images = toSignal(inject(SharedService).getImages(), { initialValue: [] as MobiansImage[] });

  @Input({ required: true }) config!: RegionalPromptingConfig;
  @Input() model?: GenerationModelSettings;
  @Input() models: GenerationModelSettings[] = [];
  @Input() mainPrompt = '';
  /** The job type the next Generate press uses (txt2img, img2img, inpainting, txt2img_upscale...). */
  @Input() jobType = 'txt2img';
  @Input() referenceImage?: MobiansImage;
  @Input() aspectRatio?: AspectRatio;
  @Input() isLoggedIn = false;
  @Input() mode: 'inline' | 'dialog' = 'inline';
  /** The LoRA panel's selection: counts toward the per-image LoRA limit and is not offered per box. */
  @Input() jobLoras: ReadonlyArray<{ id?: unknown; version_id?: unknown }> | null = [];

  /** Persist settings (debounced while typing, immediate after discrete actions). */
  @Output() save = new EventEmitter<void>();
  @Output() switchModel = new EventEmitter<string>();

  readonly uid = `rp${++instanceCounter}`;
  readonly templates = REGIONAL_TEMPLATES;
  readonly presets = this.presetsService.presets;
  readonly presetsLoading = this.presetsService.loading;
  readonly coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  readonly separations: Array<{ id: RegionalSeparation; label: string; help: string }> = [
    { id: 'soft', label: 'Soft', help: 'Regions melt into one scene. Good for backgrounds, lighting and mood.' },
    { id: 'balanced', label: 'Balanced', help: 'Clear subjects in one coherent picture. The best place to start.' },
    { id: 'strict', label: 'Strict', help: 'Keeps subjects apart. Use it when characters merge or swap colors.' },
  ];
  readonly geometryFields: Array<{ key: GeometryKey; label: string }> = [
    { key: 'x', label: 'Left' }, { key: 'y', label: 'Top' }, { key: 'width', label: 'Width' }, { key: 'height', label: 'Height' },
  ];

  templatesOpen = false;
  drawMode = false;
  showBackground = true;
  presetName = '';
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isLoggedIn']) this.presetsService.setLoggedIn(this.isLoggedIn);
    // LoRAs per region read the catalog for their base model (history and presets do not carry it) and thumbnails.
    if ((changes['model'] || changes['config']) && resolveRegionalCapability(this.model).region_loras
        && this.regions.some(region => region.loras?.length)) {
      this.loraCatalog.ensureLoaded();
    }
  }

  /** Derived values are cached for one change-detection pass (the template reads them many times). */
  private derived: {
    capability?: RegionalModelCapability; status?: RegionalStatus; supportedModels?: GenerationModelSettings[];
    loraOptions?: RegionalPayloadOptions; loraRemaining?: number;
  } = {};

  ngDoCheck(): void {
    this.derived = {};
  }

  ngOnDestroy(): void {
    if (this.saveTimer) this.saveNow();
  }

  // ---- derived state -------------------------------------------------------------------------------------

  get regions(): RegionalPromptRegion[] { return this.config?.regions ?? []; }
  /** The list runs front to back: later regions are drawn on top (and own overlaps), so the last one comes first.
   *  Numbers and colours stay those of the depth order (index + 1), as on the canvas. */
  get listOrder(): { region: RegionalPromptRegion; index: number }[] {
    return this.regions.map((region, index) => ({ region, index })).reverse();
  }
  get capability(): RegionalModelCapability { return (this.derived.capability ??= resolveRegionalCapability(this.model)); }
  get family(): RegionalFamily { return regionalFamily(this.model); }
  get modelName(): string { return this.model?.display_name || this.model?.model_id || 'This model'; }
  get status(): RegionalStatus {
    return (this.derived.status ??= regionalStatus(this.config, this.capability, this.jobType, this.modelName, this.loraOptions));
  }

  /** What decides whether a region LoRA is sent: the job's LoRAs and the model's base model (catalog for the rest). */
  get loraOptions(): RegionalPayloadOptions {
    return (this.derived.loraOptions ??= {
      jobLoras: this.jobLoras ?? [],
      baseModel: this.model?.base_model ?? null,
      loraBaseModel: lora => findCatalogLora(this.loraCatalog.catalog(), lora)?.base_model,
    });
  }

  /** Region LoRAs the image can still take: the per-image limits minus the LoRAs the boxes already use. */
  get loraRemaining(): number {
    if (this.derived.loraRemaining !== undefined) return this.derived.loraRemaining;
    const options = this.loraOptions;
    const used = this.regions.reduce((total, region) =>
      total + (region.loras ?? []).filter(lora => lora.strength > 0 && regionLoraUsable(lora, options)).length, 0);
    return (this.derived.loraRemaining = Math.max(0, regionLoraBudget(this.capability, (this.jobLoras ?? []).length) - used));
  }

  get loraTotalLimit(): number { return this.capability.max_total_loras ?? REGION_LORA_LIMITS.defaultTotal; }
  get maxRegions(): number { return this.capability.max_regions; }
  get atLimit(): boolean { return this.regions.length >= this.maxRegions; }
  get selectedId(): string | null { return this.store.selectedId(); }
  get selected(): RegionalPromptRegion | undefined { return this.regions.find(region => region.id === this.selectedId); }

  /** Width / height of the image the regions are drawn for (the reference image's own shape for img2img). */
  get ratio(): number {
    const ref = this.referenceImage;
    if (ref?.width && ref?.height) return ref.width / ref.height;
    const setting = this.aspectRatio?.aspectRatio;
    if (setting === 'portrait') return 2 / 3;
    if (setting === 'landscape') return 3 / 2;
    return 1;
  }

  /** The reference image, else the latest result when it has the same shape. */
  get backgroundSource(): string | null {
    if (this.referenceImage?.url) return this.referenceImage.url;
    const latest = this.images().find(image => !!image?.url && image.width > 0 && image.height > 0);
    if (!latest?.url) return null;
    return Math.abs(latest.width / latest.height - this.ratio) < 0.03 ? latest.url : null;
  }

  get backgroundUrl(): string | null { return this.showBackground ? this.backgroundSource : null; }
  get inheritApplies(): boolean { return this.family !== 'krea'; }
  get inheritAll(): boolean { return this.regions.length ? this.regions.every(region => region.inherit_base_prompt !== false) : true; }
  get inheritMixed(): boolean {
    const on = this.regions.filter(region => region.inherit_base_prompt !== false).length;
    return on > 0 && on < this.regions.length;
  }
  get separationHelp(): string {
    return this.separations.find(item => item.id === (this.config.separation ?? 'balanced'))?.help ?? '';
  }
  get layoutPreview(): string { return promptSnippet(layoutHintText(this.regions), 240); }

  /** Models that use regions for the current job type, for the one-click switch in the paused banner. */
  get supportedModels(): GenerationModelSettings[] {
    return (this.derived.supportedModels ??= this.models.filter(model => {
      const capability = resolveRegionalCapability(model);
      return capability.supported && capability.job_types.includes(this.jobType) && model.model_id !== this.model?.model_id;
    }).slice(0, 5));
  }

  color(index: number): string { return regionColor(index); }
  /** Width of a small layout picture of the given height, in the image's shape. */
  mapWidth(height: number): number { return Math.round(Math.min(height * 1.6, height * this.ratio)); }
  snippet(text: string): string { return promptSnippet(text, 60); }
  percent(value: number | undefined, fallback = 1): number { return Math.round((value ?? fallback) * 100); }
  /**
   * Percent with one decimal. Width and height are the distance between the rounded edges, so boxes that touch add
   * up to 100 (three equal columns read 33.3, 33.4, 33.3 instead of 33.3 three times).
   */
  geometryValue(region: RegionalPromptRegion, key: GeometryKey): number {
    const tenths = (value: number) => Math.round(value * 1000);
    if (key === 'width') return (tenths(region.x + region.width) - tenths(region.x)) / 10;
    if (key === 'height') return (tenths(region.y + region.height) - tenths(region.y)) / 10;
    return tenths(region[key]) / 10;
  }
  isSmall(region: RegionalPromptRegion): boolean { return Math.min(region.width, region.height) < 0.1; }

  sharedTag(region: RegionalPromptRegion): string | null {
    const mainShared = this.family === 'krea' || region.inherit_base_prompt !== false;
    return mainShared ? sharedSubjectTag(this.mainPrompt, region.prompt) : null;
  }

  composed(region: RegionalPromptRegion): string {
    return promptSnippet(composedRegionPrompt(this.mainPrompt, region.prompt, true,
      regionTextWeight(this.family, region.prompt)), 180);
  }

  showComposed(region: RegionalPromptRegion): boolean {
    return this.inheritApplies && region.inherit_base_prompt !== false && !!this.mainPrompt?.trim() && !!region.prompt.trim();
  }

  // ---- actions ---------------------------------------------------------------------------------------------

  select(id: string | null): void {
    this.store.sealHistory();
    this.store.selectedId.set(id);
  }

  toggleSelect(id: string): void {
    this.select(this.selectedId === id ? null : id);
  }

  setEnabled(enabled: boolean): void {
    this.store.checkpoint(this.config);
    this.config.enabled = enabled;
    if (enabled && !this.regions.length) this.templatesOpen = true;
    this.saveNow();
  }

  openFullscreen(): void {
    if (!this.config.enabled) this.setEnabled(true);
    this.store.openDialog();
  }

  applyTemplate(template: RegionalTemplate): void {
    this.store.checkpoint(this.config);
    const result = applyTemplateToConfig(this.config, template);
    this.templatesOpen = false;
    this.select(this.config.regions[this.config.regions.length - 1]?.id ?? null);   // the top of the list
    this.saveNow();
    if (result.keptOutside) {
      this.messages.add({
        severity: 'info', summary: 'Layout applied',
        detail: `${result.keptOutside} ${result.keptOutside === 1 ? 'region with a prompt did' : 'regions with prompts did'} not fit the layout and stayed where ${result.keptOutside === 1 ? 'it was' : 'they were'}. Undo restores the previous layout.`,
        life: 6000,
      });
    }
  }

  addRegion(box?: RegionBox): void {
    if (this.atLimit) {
      this.limitMessage();
      return;
    }
    this.store.checkpoint(this.config);
    const region = createRegion(box ?? freeSpot(this.regions), {
      existingIds: this.regions.map(item => item.id),
      inherit: this.inheritAll,
    });
    this.config.regions = [...this.regions, region];
    this.config.enabled = true;
    this.templatesOpen = false;
    this.select(region.id);
    this.saveNow();
  }

  deleteRegion(id: string): void {
    const index = this.regions.findIndex(region => region.id === id);
    if (index < 0) return;
    this.store.checkpoint(this.config);
    const next = this.regions.filter(region => region.id !== id);
    this.config.regions = next;
    this.select(next[Math.max(0, Math.min(index - 1, next.length - 1))]?.id ?? null);   // the one below it in the list
    this.saveNow();
  }

  duplicateRegion(id: string): void {
    const index = this.regions.findIndex(region => region.id === id);
    if (index < 0) return;
    if (this.atLimit) {
      this.limitMessage();
      return;
    }
    this.store.checkpoint(this.config);
    const source = this.regions[index];
    const copy: RegionalPromptRegion = {
      ...cloneRegion(source),
      ...duplicateOffset(source),
      id: newRegionId(this.regions.map(region => region.id)),
      name: '',
    };
    const next = [...this.regions];
    next.splice(index + 1, 0, copy);
    this.config.regions = next;
    this.select(copy.id);
    this.saveNow();
  }

  /** Depth: later regions are drawn on top and own overlaps. */
  moveDepth(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= this.regions.length) return;
    this.store.checkpoint(this.config);
    const next = [...this.regions];
    [next[index], next[target]] = [next[target], next[index]];
    this.config.regions = next;
    this.saveNow();
  }

  clearAll(): void {
    if (!this.regions.length) return;
    this.store.checkpoint(this.config);
    this.config.regions = [];
    this.select(null);
    this.templatesOpen = true;
    this.saveNow();
    this.messages.add({ severity: 'info', summary: 'Regions cleared', detail: 'Press Undo to bring them back.', life: 4000 });
  }

  undo(): void {
    if (this.store.undo(this.config)) this.saveNow();
  }

  redo(): void {
    if (this.store.redo(this.config)) this.saveNow();
  }

  onCanvasCommand(command: RegionalCanvasCommand): void {
    const id = this.selectedId;
    if (command === 'undo') this.undo();
    else if (command === 'redo') this.redo();
    else if (id && command === 'delete') this.deleteRegion(id);
    else if (id && command === 'duplicate') this.duplicateRegion(id);
  }

  onCanvasEditStart(key: string | undefined): void {
    this.store.checkpoint(this.config, key);
  }

  onTextInput(region: RegionalPromptRegion, field: 'prompt' | 'negative_prompt' | 'name', event: Event): void {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement;
    const max = field === 'name' ? REGIONAL_LIMITS.nameMax : REGIONAL_LIMITS.promptMax;
    this.store.checkpoint(this.config, `${field}:${region.id}`);
    region[field] = input.value.slice(0, max);
    this.saveSoon();
  }

  onStrength(region: RegionalPromptRegion, event: Event): void {
    const value = clamp(Number((event.target as HTMLInputElement).value) / 100, 0, 1);
    if (!Number.isFinite(value)) return;
    this.store.checkpoint(this.config, `strength:${region.id}`);
    region.strength = value;
    region.denoise_strength = value;
    this.saveSoon();
  }

  onFeather(region: RegionalPromptRegion, event: Event): void {
    const value = Math.round(clamp(Number((event.target as HTMLInputElement).value), 0, REGIONAL_LIMITS.maxFeather));
    if (!Number.isFinite(value)) return;
    this.store.checkpoint(this.config, `feather:${region.id}`);
    region.feather = value;
    this.saveSoon();
  }

  /**
   * Exact values (to 0.1%) commit on change (Enter or leaving the field); invalid entries restore the current value.
   * A typed width or height puts the far edge on the shown left/top value plus the typed size, so the field reads
   * back exactly what was typed.
   */
  onGeometry(region: RegionalPromptRegion, key: GeometryKey, event: Event): void {
    const input = event.target as HTMLInputElement;
    const tenths = Math.round(input.valueAsNumber * 10);
    if (Number.isFinite(tenths)) {
      this.store.checkpoint(this.config);
      if (key === 'width') region.width = (Math.round(region.x * 1000) + tenths) / 1000 - region.x;
      else if (key === 'height') region.height = (Math.round(region.y * 1000) + tenths) / 1000 - region.y;
      else region[key] = tenths / 1000;
      clampBox(region);
      this.saveNow();
    }
    input.value = String(this.geometryValue(region, key));
  }

  setSeparation(separation: RegionalSeparation): void {
    if (this.config.separation === separation) return;
    this.store.checkpoint(this.config);
    this.config.separation = separation;
    this.saveNow();
  }

  setLayoutHints(enabled: boolean): void {
    this.store.checkpoint(this.config);
    this.config.layout_hints = enabled;
    this.saveNow();
  }

  setInheritAll(enabled: boolean): void {
    this.store.checkpoint(this.config);
    this.regions.forEach(region => (region.inherit_base_prompt = enabled));
    this.saveNow();
  }

  onSwitchModel(modelId: string): void {
    this.switchModel.emit(modelId);
  }

  // ---- presets ---------------------------------------------------------------------------------------------

  savePreset(): void {
    const name = this.presetName.trim();
    if (!name || !this.regions.length) return;
    const existing = this.presetsService.findByName(name);
    if (existing && !window.confirm(`Replace the preset "${existing.name}" with the current layout?`)) return;
    const saved = this.presetsService.save(name, this.config);
    if (!saved) return;
    this.presetName = '';
    const trimmed = this.regions.length - saved.regions.length;
    this.messages.add({
      severity: 'success', summary: existing ? 'Preset replaced' : 'Preset saved',
      detail: `"${saved.name}" ${this.isLoggedIn ? 'is saved to your account.' : 'is saved in this browser.'}`
        + (trimmed > 0 ? ` Presets keep up to ${saved.regions.length} regions; the last ${trimmed} ${trimmed === 1 ? 'was' : 'were'} left out.` : ''),
      life: trimmed > 0 ? 6000 : 3000,
    });
  }

  applyPreset(preset: RegionalPreset): void {
    this.store.checkpoint(this.config);
    const loaded = normaliseRegionalConfig({ version: 2, enabled: true, regions: preset.regions });
    this.config.regions = loaded.regions;
    if (preset.separation) this.config.separation = preset.separation;
    if (typeof preset.layout_hints === 'boolean') this.config.layout_hints = preset.layout_hints;
    this.config.enabled = true;
    this.templatesOpen = false;
    this.select(loaded.regions[0]?.id ?? null);
    this.saveNow();
    this.messages.add({ severity: 'info', summary: `Preset "${preset.name}" applied`, detail: 'Press Undo to go back to your previous regions.', life: 3500 });
  }

  deletePreset(preset: RegionalPreset): void {
    if (!window.confirm(`Delete the preset "${preset.name}"?`)) return;
    this.presetsService.remove(preset.id);
  }

  onPresetNameInput(event: Event): void {
    this.presetName = (event.target as HTMLInputElement).value;
  }

  // ---- saving ----------------------------------------------------------------------------------------------

  saveSoon(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.save.emit();
  }

  private limitMessage(): void {
    this.messages.add({
      severity: 'warn', summary: 'Region limit reached',
      detail: `${this.modelName} uses up to ${this.maxRegions} regions. Remove one to add another.`, life: 4000,
    });
  }
}
