/**
 * LoRAs per region (pure helpers, no Angular). Contract: each region may carry up to 2 catalog LoRAs
 * `{id, version_id, name, version, strength}`; the backend resolves them from the LoRA catalog, checks the base model
 * and the limits, and charges each like a job LoRA. Only models whose capability says `region_loras` use them.
 */
import { RegionalLora } from 'src/_shared/regional-prompting.interface';

export const REGION_LORA_LIMITS = {
  /** LoRAs one region may use. */
  perRegion: 2,
  /** Region-LoRA entries one image may use, all regions together. */
  perImage: 4,
  /** Job LoRAs + region LoRAs per image when the backend does not say (the LoRA panel's limit). */
  defaultTotal: 3,
  /** The LoRA panel's strength range. */
  minStrength: 0,
  maxStrength: 1.5,
  defaultStrength: 0.8,
  nameMax: 200,
} as const;

/** The catalog fields the picker reads (`/get_loras/?fields=summary`). */
export interface CatalogLora {
  id?: number | null;
  version_id?: number | null;
  name?: string;
  version?: string;
  base_model?: string;
  trigger_words?: string[] | null;
  is_nsfw?: boolean;
  image_url?: string | null;
  uses?: number;
}

interface LoraRef { id?: unknown; version_id?: unknown }

const catalogId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function clampLoraStrength(value: unknown): number {
  const parsed = value === null || value === undefined || value === '' ? NaN : Number(value);
  if (!Number.isFinite(parsed)) return REGION_LORA_LIMITS.defaultStrength;
  return round2(Math.min(REGION_LORA_LIMITS.maxStrength, Math.max(REGION_LORA_LIMITS.minStrength, parsed)));
}

/** Identities of a LoRA ("v:<version_id>", "i:<id>"); two LoRAs are the same when any identity matches. */
export function loraKeys(lora: LoraRef | null | undefined): string[] {
  if (!lora) return [];
  const keys: string[] = [];
  const versionId = catalogId(lora.version_id);
  const id = catalogId(lora.id);
  if (versionId !== null) keys.push(`v:${versionId}`);
  if (id !== null) keys.push(`i:${id}`);
  return keys;
}

export function sameLora(a: LoraRef | null | undefined, b: LoraRef | null | undefined): boolean {
  const keys = new Set(loraKeys(a));
  return loraKeys(b).some(key => keys.has(key));
}

/** One stored or received entry as a working region LoRA, or null when it names no catalog row. */
export function normaliseRegionLora(raw: any): RegionalLora | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = catalogId(raw.id);
  const versionId = catalogId(raw.version_id);
  if (id === null && versionId === null) return null;
  const lora: RegionalLora = {
    id,
    version_id: versionId,
    name: String(raw.name ?? '').trim().slice(0, REGION_LORA_LIMITS.nameMax),
    version: String(raw.version ?? '').trim().slice(0, REGION_LORA_LIMITS.nameMax),
    strength: clampLoraStrength(raw.strength),
  };
  if (typeof raw.base_model === 'string' && raw.base_model.trim()) lora.base_model = raw.base_model.trim();
  return lora;
}

/** A region's LoRAs: valid catalog references only, no repeats, at most 2. */
export function normaliseRegionLoras(raw: unknown): RegionalLora[] {
  const list: RegionalLora[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const lora = normaliseRegionLora(item);
    if (!lora || list.some(existing => sameLora(existing, lora))) continue;
    list.push(lora);
    if (list.length >= REGION_LORA_LIMITS.perRegion) break;
  }
  return list;
}

export function regionLoraFromCatalog(entry: CatalogLora, strength: number = REGION_LORA_LIMITS.defaultStrength): RegionalLora | null {
  return normaliseRegionLora({ ...entry, strength });
}

/** What a region LoRA sends (the backend fills the file path and the catalog's name and version). */
export function regionLoraPayload(lora: RegionalLora): RegionalLora {
  return { id: lora.id, version_id: lora.version_id, name: lora.name, version: lora.version, strength: clampLoraStrength(lora.strength) };
}

export function findCatalogLora(catalog: readonly CatalogLora[], lora: LoraRef): CatalogLora | undefined {
  const versionId = catalogId(lora.version_id);
  if (versionId !== null) {
    const byVersion = catalog.find(entry => catalogId(entry.version_id) === versionId);
    if (byVersion) return byVersion;
  }
  const id = catalogId(lora.id);
  return id === null ? undefined : catalog.find(entry => catalogId(entry.id) === id);
}

export interface RegionLoraSearch {
  query?: string;
  /** base_model of the selected model: only LoRAs made for it are offered (the LoRA panel's rule). */
  baseModel?: string | null;
  showNsfw?: boolean;
  /** Already chosen (this region's LoRAs); left out of the results. */
  exclude?: readonly LoraRef[];
  limit?: number;
}

/** The compatible catalog LoRAs matching a query, most used first (the catalog's own order). */
export function searchRegionLoras(catalog: readonly CatalogLora[], options: RegionLoraSearch): { results: CatalogLora[]; total: number } {
  const baseModel = options.baseModel ?? null;
  if (!baseModel) return { results: [], total: 0 };
  const words = String(options.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const exclude = options.exclude ?? [];
  const matches = catalog.filter(entry => {
    if (entry.base_model !== baseModel) return false;
    if (!options.showNsfw && entry.is_nsfw) return false;
    if (!loraKeys(entry).length || exclude.some(item => sameLora(item, entry))) return false;
    if (!words.length) return true;
    const haystack = `${entry.name ?? ''} ${entry.version ?? ''} ${(entry.trigger_words ?? []).join(' ')}`.toLowerCase();
    return words.every(word => haystack.includes(word));
  });
  return { results: matches.slice(0, options.limit ?? 8), total: matches.length };
}

const tagOf = (text: string): string => text.trim().toLowerCase();

/** Trigger words of a LoRA that the prompt does not contain yet (compared tag by tag, like the LoRA panel). */
export function missingTriggerWords(prompt: string, triggerWords: readonly string[] | null | undefined): string[] {
  const present = new Set(String(prompt ?? '').split(',').map(tagOf).filter(Boolean));
  const missing: string[] = [];
  for (const word of triggerWords ?? []) {
    const text = String(word ?? '').trim();
    if (text && !present.has(tagOf(text)) && !missing.some(item => tagOf(item) === tagOf(text))) missing.push(text);
  }
  return missing;
}

/** The prompt with the given words appended as tags. */
export function withTriggerWords(prompt: string, words: readonly string[]): string {
  const base = String(prompt ?? '').trim().replace(/,\s*$/, '');
  const extra = words.map(word => word.trim()).filter(Boolean).join(', ');
  if (!extra) return String(prompt ?? '');
  return base ? `${base}, ${extra}` : extra;
}
