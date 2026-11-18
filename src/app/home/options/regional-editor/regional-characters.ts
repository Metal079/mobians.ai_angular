/**
 * Saved characters in regions (pure helpers, no Angular). A saved look fills one box: its prompt becomes the box's
 * prompt, and its LoRAs become the box's LoRAs when the selected model can use them there. User request 2026-11-18.
 */
import { RegionalLora } from 'src/_shared/regional-prompting.interface';
import { CatalogLora, findCatalogLora, loraKeys, normaliseRegionLora, REGION_LORA_LIMITS, sameLora } from './regional-loras';

/** A LoRA as a saved look stores it (`CharacterRecipe.loras`). */
export interface CharacterLoraRef { id?: unknown; version_id?: unknown; name?: unknown; strength?: unknown }

/**
 * other-model: made for another base model; unavailable: no longer in the LoRA catalog; in-panel: already in the LoRA
 * panel for the whole image; no-region-loras: the model does not use LoRAs per region.
 */
export type CharacterLoraSkipReason = 'other-model' | 'unavailable' | 'in-panel' | 'no-region-loras';

export interface CharacterLoraSkip { name: string; reason: CharacterLoraSkipReason; baseModel?: string }

export interface CharacterLoraPlan {
  /** LoRAs the box can use with the selected model, in the look's order. More than `slots` means the user chooses. */
  usable: RegionalLora[];
  /** How many LoRAs the box can take: the per-box limit and what is left of the image's limit. */
  slots: number;
  skipped: CharacterLoraSkip[];
}

export interface CharacterLoraOptions {
  /** The LoRA panel's catalog (active LoRAs only). */
  catalog: readonly CatalogLora[];
  /** base_model of the selected model. */
  baseModel: string | null | undefined;
  /** The selected model uses LoRAs per region. */
  regionLoras: boolean;
  /** LoRAs this box may take: min(per-box limit, image limit left once this box's own LoRAs are replaced). */
  room: number;
  /** The LoRA panel's selection (already used for the whole image). */
  jobLoras?: ReadonlyArray<{ id?: unknown; version_id?: unknown }> | null;
}

/** Sorts a saved look's LoRAs into the ones the box can use and the ones it cannot (with the reason). */
export function planCharacterLoras(recipeLoras: readonly CharacterLoraRef[] | null | undefined, options: CharacterLoraOptions): CharacterLoraPlan {
  const usable: RegionalLora[] = [];
  const skipped: CharacterLoraSkip[] = [];
  const seen: CharacterLoraRef[] = [];
  for (const ref of Array.isArray(recipeLoras) ? recipeLoras : []) {
    if (!ref || !loraKeys(ref).length || seen.some(item => sameLora(item, ref))) continue;
    seen.push(ref);
    const entry = findCatalogLora(options.catalog, ref);
    const name = String(ref.name || entry?.name || 'LoRA').trim() || 'LoRA';
    if (!options.regionLoras) {
      skipped.push({ name, reason: 'no-region-loras' });
    } else if (!entry) {
      skipped.push({ name, reason: 'unavailable' });
    } else if (!options.baseModel || entry.base_model !== options.baseModel) {
      skipped.push({ name, reason: 'other-model', baseModel: entry.base_model });
    } else if ((options.jobLoras ?? []).some(job => sameLora(job, entry))) {
      skipped.push({ name, reason: 'in-panel' });
    } else {
      // The catalog's identity and name; the look's strength (the LoRA panel's 0..1.5 range).
      const lora = normaliseRegionLora({ ...entry, strength: ref.strength ?? REGION_LORA_LIMITS.defaultStrength });
      if (lora) usable.push({ ...lora, base_model: entry.base_model });
    }
  }
  const slots = options.regionLoras ? Math.max(0, Math.min(REGION_LORA_LIMITS.perRegion, Math.floor(options.room))) : 0;
  return { usable, slots, skipped };
}

const quoted = (skips: CharacterLoraSkip[]): string => skips.map(skip => `"${skip.name}"`).join(', ');

/** Sentences for the LoRAs of a look that were not added to the box. */
export function describeCharacterLoraSkips(skipped: readonly CharacterLoraSkip[], modelName: string, baseModel?: string | null): string[] {
  const notes: string[] = [];
  const of = (reason: CharacterLoraSkipReason) => skipped.filter(skip => skip.reason === reason);
  const noRegion = of('no-region-loras');
  if (noRegion.length) {
    notes.push(`${modelName} does not use LoRAs per region, so ${noRegion.length === 1 ? 'its LoRA was' : 'its LoRAs were'} not added.`);
  }
  const other = of('other-model');
  if (other.length) {
    const bases = [...new Set(other.map(skip => skip.baseModel).filter(Boolean))].join(' / ');
    notes.push(`${quoted(other)} ${other.length > 1 ? 'are' : 'is'} made for ${bases || 'another model type'}, not ${baseModel || modelName}.`);
  }
  const gone = of('unavailable');
  if (gone.length) notes.push(`${quoted(gone)} ${gone.length > 1 ? 'are' : 'is'} no longer available.`);
  const panel = of('in-panel');
  if (panel.length) notes.push(`${quoted(panel)} ${panel.length > 1 ? 'are' : 'is'} already in the LoRA panel for the whole image.`);
  return notes;
}
