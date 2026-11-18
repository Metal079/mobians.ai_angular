import { Component, DestroyRef, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { RegionalLora, RegionalPromptingConfig, RegionalPromptRegion } from 'src/_shared/regional-prompting.interface';
import { loraThumbnailUrl } from 'src/_shared/lora-image';
import { AccountCtaService } from 'src/app/auth/account-cta.service';
import { CharacterBrowserComponent } from 'src/app/characters/character-browser.component';
import { CharacterChoice, characterError, characterPrompt, CharactersService } from 'src/app/characters/characters.service';
import { CharacterLoraPlan, describeCharacterLoraSkips, planCharacterLoras } from './regional-characters';
import { RegionalEditorService } from './regional-editor.service';
import { RegionalLoraCatalogService } from './regional-lora-catalog.service';
import { findCatalogLora, REGION_LORA_LIMITS } from './regional-loras';
import { REGIONAL_LIMITS } from './regional-state';

/** A chosen look whose LoRAs need a choice before it fills the box. */
interface PendingLook {
  name: string;
  characterId: string;
  imageId: string;
  prompt: string;
  plan: CharacterLoraPlan;
  notes: string[];
  selected: boolean[];
}

/**
 * "Use a character" for one region (user request 2026-11-18): a saved look's prompt fills the box, and its LoRAs
 * become the box's LoRAs when the model takes LoRAs per region. When the look has more usable LoRAs than the box can
 * take (2 per box, 3 per image with the LoRA panel), the user picks which to keep. One undo step.
 */
@Component({
  selector: 'app-regional-character-picker',
  standalone: true,
  imports: [DecimalPipe, DialogModule, CharacterBrowserComponent],
  templateUrl: './regional-character-picker.component.html',
  styleUrls: ['./regional-character-picker.component.css'],
})
export class RegionalCharacterPickerComponent {
  private readonly characters = inject(CharactersService);
  private readonly accountCta = inject(AccountCtaService);
  private readonly loraCatalog = inject(RegionalLoraCatalogService);
  private readonly store = inject(RegionalEditorService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) region!: RegionalPromptRegion;
  @Input({ required: true }) config!: RegionalPromptingConfig;
  /** The region's number in the editor (depth order, 1-based). */
  @Input() regionNumber = 1;
  /** base_model of the selected model: only LoRAs made for it are added. */
  @Input() baseModel = '';
  @Input() modelName = 'This model';
  /** The selected model takes LoRAs per region. */
  @Input() regionLoras = false;
  /** LoRAs this box can take once its own are replaced (per-box limit and what the image has left). */
  @Input() loraRoom = 0;
  /** Job LoRAs + region LoRAs per image, for the limit sentence. */
  @Input() totalLimit: number = REGION_LORA_LIMITS.defaultTotal;
  /** The LoRA panel's selection (already used for the whole image). */
  @Input() jobLoras: ReadonlyArray<{ id?: unknown; version_id?: unknown }> = [];
  /** After the box changed (the editor saves and switches regions on). */
  @Output() changed = new EventEmitter<void>();

  readonly opened = signal(false);
  /** Name of the character being loaded (cards are disabled meanwhile). */
  readonly busyName = signal('');
  readonly error = signal('');
  readonly pending = signal<PendingLook | null>(null);
  private version = 0;

  constructor() {
    this.destroyRef.onDestroy(() => ++this.version);
  }

  open(): void {
    if (!this.characters.owner) {
      this.accountCta.requestLogin({ reason: 'generic', message: 'Sign in to use your saved characters in regions.' });
      return;
    }
    this.reset();
    this.opened.set(true);
    if (this.regionLoras) this.loraCatalog.ensureLoaded();
  }

  close(force = false): void {
    if (this.busyName() && !force) return;
    this.reset();
    this.opened.set(false);
  }

  /** A character card (default look) or a look from the search. */
  async choose(choice: CharacterChoice): Promise<void> {
    if (this.busyName()) return;
    const version = ++this.version;
    const owner = this.characters.owner;
    const current = () => version === this.version && owner === this.characters.owner && this.opened();
    this.error.set('');
    this.busyName.set(choice.name || 'character');
    try {
      const detail = await this.characters.get(choice.characterId, choice.imageId);
      const look = choice.imageId ? detail.images.find(image => image.id === choice.imageId) : this.characters.defaultLook(detail);
      if (!look) throw new Error('This saved look is no longer available. Choose another look.');
      const prompt = characterPrompt(look.recipe).trim();
      if (!prompt) throw new Error('This saved look has no prompt to use.');
      const catalog = this.regionLoras && look.recipe.loras?.length ? await this.loraCatalog.whenLoaded() : [];
      if (!current()) return;
      const name = detail.name || choice.name;
      const notes: string[] = [];
      let plan: CharacterLoraPlan;
      if (catalog === null) {
        plan = { usable: [], slots: 0, skipped: [] };
        notes.push('The LoRA list could not be loaded, so its LoRAs were not added. Pick the character again to retry.');
      } else {
        plan = planCharacterLoras(look.recipe.loras, {
          catalog, baseModel: this.baseModel, regionLoras: this.regionLoras, room: this.loraRoom, jobLoras: this.jobLoras,
        });
        notes.push(...describeCharacterLoraSkips(plan.skipped, this.modelName, this.baseModel));
      }
      const pick: PendingLook = {
        name, characterId: detail.id || choice.characterId, imageId: look.id, prompt, plan, notes,
        selected: plan.usable.map((_, index) => index < plan.slots),
      };
      if (plan.usable.length > plan.slots) this.pending.set(pick);
      else this.apply(pick);
    } catch (error) {
      if (current()) this.error.set(characterError(error));
    } finally {
      if (version === this.version) this.busyName.set('');
    }
  }

  get selectedCount(): number { return this.pending()?.selected.filter(Boolean).length ?? 0; }
  isFull(pick: PendingLook): boolean { return pick.selected.filter(Boolean).length >= pick.plan.slots; }

  toggle(index: number, on: boolean): void {
    const pick = this.pending();
    if (!pick || (on && this.isFull(pick))) return;
    this.pending.set({ ...pick, selected: pick.selected.map((value, position) => (position === index ? on : value)) });
  }

  back(): void { this.pending.set(null); }

  confirm(): void {
    const pick = this.pending();
    if (pick) this.apply(pick);
  }

  /** The sentence above the LoRA choice. */
  roomText(plan: CharacterLoraPlan): string {
    if (plan.slots === 0) {
      return `This image already uses its ${this.totalLimit} LoRAs (the LoRA panel and the boxes together), so none fit in this box. Use the prompt only, or remove a LoRA elsewhere first.`;
    }
    if (plan.slots < REGION_LORA_LIMITS.perRegion) {
      return `This box can take ${plan.slots} more (${this.totalLimit} per image, the LoRA panel and the boxes together). Choose which to keep.`;
    }
    return `A box can use up to ${plan.slots}. Choose which to keep.`;
  }

  confirmLabel(): string {
    const count = this.selectedCount;
    return count ? `Use ${count} ${count === 1 ? 'LoRA' : 'LoRAs'}` : 'Use the prompt only';
  }

  thumb(lora: RegionalLora): string {
    const url = findCatalogLora(this.loraCatalog.catalog(), lora)?.image_url;
    return url ? loraThumbnailUrl(url, 96) : '';
  }

  private apply(pick: PendingLook): void {
    const chosen = pick.plan.usable.filter((_, index) => pick.selected[index]).slice(0, pick.plan.slots);
    const region = this.region;
    const hadPrompt = !!region.prompt.trim();
    this.store.checkpoint(this.config);
    region.prompt = pick.prompt.slice(0, REGIONAL_LIMITS.promptMax);
    if (chosen.length) region.loras = chosen.map(lora => ({ ...lora }));
    else delete region.loras;
    this.changed.emit();
    this.characters.recordLoaded(pick.characterId, pick.imageId);
    this.close(true);
    const added = chosen.length
      ? `Its prompt and ${chosen.length} ${chosen.length === 1 ? 'LoRA' : 'LoRAs'} now fill this box.`
      : 'Its prompt now fills this box.';
    this.messages.add({
      severity: 'success',
      summary: `${pick.name} is in Region ${this.regionNumber}`,
      detail: [added, ...pick.notes, hadPrompt ? 'Undo brings back the previous prompt.' : ''].filter(Boolean).join(' '),
      life: pick.notes.length ? 7000 : 4000,
    });
  }

  private reset(): void {
    ++this.version;
    this.busyName.set('');
    this.error.set('');
    this.pending.set(null);
  }
}
