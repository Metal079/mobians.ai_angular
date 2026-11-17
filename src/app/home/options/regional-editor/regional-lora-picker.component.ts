import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RegionalLora, RegionalPromptingConfig, RegionalPromptRegion } from 'src/_shared/regional-prompting.interface';
import { loraThumbnailUrl } from 'src/_shared/lora-image';
import { HintComponent } from 'src/app/hint/hint.component';
import { RegionalEditorService } from './regional-editor.service';
import { RegionalLoraCatalogService } from './regional-lora-catalog.service';
import {
  CatalogLora, clampLoraStrength, findCatalogLora, loraKeys, missingTriggerWords, normaliseRegionLoras, REGION_LORA_LIMITS,
  regionLoraFromCatalog, sameLora, searchRegionLoras, withTriggerWords,
} from './regional-loras';
import { REGIONAL_LIMITS } from './regional-state';

/**
 * "LoRAs for this box": up to 2 catalog LoRAs for one region, each a chip with a strength slider, remove, and a
 * one-click "add trigger words to this box's prompt". Searches the LoRA panel's catalog, filtered to the selected
 * model's base model. Every change is one undo step (shared editor history) and replaces the LoRA list (never edits
 * it in place), so undo snapshots stay intact.
 */
@Component({
  selector: 'app-regional-lora-picker',
  standalone: true,
  imports: [DecimalPipe, HintComponent],
  templateUrl: './regional-lora-picker.component.html',
  styleUrls: ['./regional-lora-picker.component.css'],
})
export class RegionalLoraPickerComponent implements OnInit {
  private readonly store = inject(RegionalEditorService);
  readonly loraCatalog = inject(RegionalLoraCatalogService);

  @Input({ required: true }) region!: RegionalPromptRegion;
  @Input({ required: true }) config!: RegionalPromptingConfig;
  /** base_model of the selected model: the catalog is filtered to it. */
  @Input() baseModel = '';
  @Input() modelName = 'This model';
  /** Region LoRAs this image can still take (the per-image limits minus what other regions use). */
  @Input() remaining: number = REGION_LORA_LIMITS.perImage;
  /** Job LoRAs + region LoRAs per image, for the limit message. */
  @Input() totalLimit: number = REGION_LORA_LIMITS.defaultTotal;
  /** The LoRA panel's selection (already used for the whole image, so not offered here). */
  @Input() jobLoras: ReadonlyArray<{ id?: unknown; version_id?: unknown }> = [];
  @Input() uid = 'rl';
  /** 'now' after a discrete change, 'soon' while a slider moves. */
  @Output() changed = new EventEmitter<'now' | 'soon'>();

  readonly perRegion = REGION_LORA_LIMITS.perRegion;
  readonly minStrength = REGION_LORA_LIMITS.minStrength;
  readonly maxStrength = REGION_LORA_LIMITS.maxStrength;
  searchOpen = false;
  query = '';

  ngOnInit(): void {
    this.loraCatalog.ensureLoaded();
  }

  get loras(): RegionalLora[] { return this.region?.loras ?? []; }
  get canAdd(): boolean { return this.loras.length < this.perRegion && this.remaining > 0; }

  get limitText(): string {
    return `This image already uses its ${this.totalLimit} LoRAs (the LoRA panel and the boxes together). Remove one to add another here.`;
  }

  private resultsMemo: { inputs: unknown[]; value: { results: CatalogLora[]; total: number } } | null = null;

  /** Search results, recomputed only when an input changes (the template reads them several times per pass). */
  get results(): { results: CatalogLora[]; total: number } {
    const inputs = [this.loraCatalog.catalog(), this.query, this.baseModel, this.loras, this.jobLoras, this.loraCatalog.showNsfw()];
    if (this.resultsMemo && inputs.every((value, index) => value === this.resultsMemo!.inputs[index])) return this.resultsMemo.value;
    const value = searchRegionLoras(this.loraCatalog.catalog(), {
      query: this.query,
      baseModel: this.baseModel,
      showNsfw: this.loraCatalog.showNsfw(),
      exclude: [...this.loras, ...this.jobLoras],
      limit: 8,
    });
    this.resultsMemo = { inputs, value };
    return value;
  }

  entry(lora: RegionalLora): CatalogLora | undefined {
    return findCatalogLora(this.loraCatalog.catalog(), lora);
  }

  thumb(source: CatalogLora | undefined): string {
    return source?.image_url ? loraThumbnailUrl(source.image_url, 96) : '';
  }

  key(entry: CatalogLora): string { return loraKeys(entry).join('|'); }

  /** Why a chip is not used with the selected model (null when it is). */
  pausedReason(lora: RegionalLora): string | null {
    const base = lora.base_model || this.entry(lora)?.base_model;
    if (base && this.baseModel && base !== this.baseModel) return `Made for ${base}: paused with ${this.modelName}.`;
    if (this.jobLoras.some(item => sameLora(item, lora))) return 'Already in the LoRA panel for the whole image: not used again here.';
    return null;
  }

  missingTriggers(lora: RegionalLora): string[] {
    return missingTriggerWords(this.region.prompt, this.entry(lora)?.trigger_words);
  }

  openSearch(): void {
    this.searchOpen = true;
    this.query = '';
    this.loraCatalog.ensureLoaded();
    setTimeout(() => (document.getElementById(`${this.uid}-lora-search`) as HTMLInputElement | null)?.focus());
  }

  closeSearch(): void {
    this.searchOpen = false;
    this.query = '';
  }

  onQuery(event: Event): void {
    this.query = (event.target as HTMLInputElement).value;
  }

  /** Enter in the search box picks the first result. */
  onSearchEnter(event: Event): void {
    event.preventDefault();
    const first = this.results.results[0];
    if (first) this.add(first);
  }

  add(entry: CatalogLora): void {
    if (!this.canAdd) return;
    const lora = regionLoraFromCatalog(entry);
    if (!lora || this.loras.some(item => sameLora(item, lora))) return;
    this.store.checkpoint(this.config);
    this.region.loras = normaliseRegionLoras([...this.loras, lora]);
    this.closeSearch();
    this.changed.emit('now');
  }

  remove(index: number): void {
    this.store.checkpoint(this.config);
    const next = this.loras.filter((_, position) => position !== index);
    if (next.length) this.region.loras = next;
    else delete this.region.loras;
    this.changed.emit('now');
  }

  onStrength(index: number, event: Event): void {
    const value = clampLoraStrength((event.target as HTMLInputElement).value);
    const current = this.loras[index];
    if (!current) return;
    this.store.checkpoint(this.config, `lora-strength:${this.region.id}:${index}`);
    this.region.loras = this.loras.map((lora, position) => (position === index ? { ...lora, strength: value } : lora));
    this.changed.emit('soon');
  }

  sealHistory(): void { this.store.sealHistory(); }

  addTriggers(lora: RegionalLora): void {
    const words = this.missingTriggers(lora);
    if (!words.length) return;
    this.store.checkpoint(this.config);
    this.region.prompt = withTriggerWords(this.region.prompt, words).slice(0, REGIONAL_LIMITS.promptMax);
    this.changed.emit('now');
  }
}
