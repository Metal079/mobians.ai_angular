/**
 * Regional prompting state helpers (pure functions, no Angular).
 * Contract: artifacts/regional_prompting_20261117/SPEC.md sections 1, 4.6 and 5.
 *
 * Two shapes exist:
 * - the working state the editor edits and the browser saves (may hold regions without a prompt);
 * - the payload sent with a job (`buildRegionalPayload`), which drops empty regions and obeys the model's limits.
 */
import {
  RegionalLora,
  RegionalModelCapability,
  RegionalPromptingConfig,
  RegionalPromptRegion,
  RegionalSeparation,
} from 'src/_shared/regional-prompting.interface';
import { loraKeys, normaliseRegionLoras, REGION_LORA_LIMITS, regionLoraPayload } from './regional-loras';

export const REGIONAL_LIMITS = {
  /** Backend limit for every model (SPEC 1). */
  maxRegions: 8,
  /** The editor suggests staying at or below this. */
  recommendedRegions: 6,
  minSize: 0.03,
  maxFeather: 160,
  defaultFeather: 24,
  promptMax: 4000,
  nameMax: 60,
  idMax: 40,
  /** Guard for the working state; payloads are capped by the model's limit. */
  workingMax: 32,
} as const;

export const REGIONAL_JOB_TYPES = ['txt2img', 'img2img', 'inpainting', 'upscale', 'txt2img_upscale'];
export const REGIONAL_SEPARATIONS: RegionalSeparation[] = ['soft', 'balanced', 'strict'];

export interface RegionBox { x: number; y: number; width: number; height: number; }

/** The model fields the editor reads; `GenerationModelSettings` satisfies this. */
export interface RegionalModelInfo {
  model_id?: string;
  display_name?: string;
  base_model?: string;
  supports_regional_prompting?: boolean;
  supports_negative_prompt?: boolean;
  supports_loras?: boolean;
  max_loras?: number;
  regional?: Partial<RegionalModelCapability> | null;
}

export type RegionalFamily = 'krea' | 'sdxl' | 'anima' | 'other';

const finite = (value: unknown, fallback: number): number => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const round4 = (value: number): number => Math.round(value * 10000) / 10000;

/**
 * Start and size of a box along one axis, inside the image and rounded to 0.01%. The edges are rounded rather than
 * the size, so boxes that touch in the editor still touch when sent (three equal columns: no 0.01% gap).
 */
function roundedSpan(start: number, size: number): [number, number] {
  const length = clamp(finite(size, 0.5), REGIONAL_LIMITS.minSize, 1);
  const from = clamp(finite(start, 0), 0, 1 - length);
  const near = round4(from);
  const sized = Math.max(REGIONAL_LIMITS.minSize, round4(round4(from + length) - near));
  return [Math.min(near, round4(1 - sized)), sized];
}

export function emptyRegionalConfig(): RegionalPromptingConfig {
  // Layout hints are opt-in: GPU tests (2026-11-17) showed no gain with region masks on and misplaced small objects.
  return { enabled: false, version: 2, separation: 'balanced', layout_hints: false, regions: [] };
}

/** Short random ids ("r-k3x9q2") that stay unique within the given set. */
export function newRegionId(existing: Iterable<string> = []): string {
  const used = new Set(existing);
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `r-${Math.random().toString(36).slice(2, 8)}`;
    if (id.length > 3 && !used.has(id)) return id;
  }
  return `r-${Date.now().toString(36)}-${used.size}`;
}

/** Keeps a box inside the image with at least the minimum size. */
export function clampBox<T extends RegionBox>(box: T): T {
  const width = clamp(finite(box.width, 0.5), REGIONAL_LIMITS.minSize, 1);
  const height = clamp(finite(box.height, 0.5), REGIONAL_LIMITS.minSize, 1);
  box.width = width;
  box.height = height;
  box.x = clamp(finite(box.x, 0), 0, 1 - width);
  box.y = clamp(finite(box.y, 0), 0, 1 - height);
  return box;
}

export function createRegion(box: RegionBox, options: { existingIds?: Iterable<string>; inherit?: boolean; name?: string } = {}): RegionalPromptRegion {
  return clampBox({
    id: newRegionId(options.existingIds),
    name: (options.name ?? '').slice(0, REGIONAL_LIMITS.nameMax),
    prompt: '',
    negative_prompt: '',
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    strength: 1,
    feather: REGIONAL_LIMITS.defaultFeather,
    inherit_base_prompt: options.inherit !== false,
    denoise_strength: 1,
    opacity: 1,
  });
}

/**
 * Turns any stored region (version 1 or 2, possibly malformed) into a version 2 working region.
 * Version 1 meaning (SPEC 1): strength = denoise_strength * opacity, missing inherit = true.
 */
export function normaliseRegion(raw: any, isVersion1: boolean, usedIds: Set<string> = new Set()): RegionalPromptRegion {
  const source = raw && typeof raw === 'object' ? raw : {};
  const denoise = clamp(finite(source.denoise_strength, 1), 0, 1);
  const opacity = clamp(finite(source.opacity, 1), 0, 1);
  const strength = isVersion1 || source.strength === undefined || source.strength === null
    ? denoise * opacity
    : clamp(finite(source.strength, 1), 0, 1);
  let id = typeof source.id === 'string' || typeof source.id === 'number' ? String(source.id).trim().slice(0, REGIONAL_LIMITS.idMax) : '';
  if (!id || usedIds.has(id)) id = newRegionId(usedIds);
  usedIds.add(id);
  const loras = normaliseRegionLoras(source.loras);
  return clampBox({
    id,
    name: String(source.name ?? '').slice(0, REGIONAL_LIMITS.nameMax),
    prompt: String(source.prompt ?? '').slice(0, REGIONAL_LIMITS.promptMax),
    negative_prompt: String(source.negative_prompt ?? '').slice(0, REGIONAL_LIMITS.promptMax),
    x: finite(source.x, 0),
    y: finite(source.y, 0),
    width: finite(source.width, 0.5),
    height: finite(source.height, 0.5),
    strength: round4(strength),
    feather: Math.round(clamp(finite(source.feather, REGIONAL_LIMITS.defaultFeather), 0, REGIONAL_LIMITS.maxFeather)),
    inherit_base_prompt: source.inherit_base_prompt !== false,
    denoise_strength: round4(strength),
    opacity: 1,
    // LoRAs for this region only (kept on every model; models without LoRAs per region pause them).
    ...(loras.length ? { loras } : {}),
  });
}

/** Version 1 or 2 (or a hybrid of both) to the version 2 working state. Regions without a prompt are kept. */
export function normaliseRegionalConfig(raw: any): RegionalPromptingConfig {
  if (!raw || typeof raw !== 'object') return emptyRegionalConfig();
  const isVersion1 = !(finite(raw.version, 1) >= 2);
  const usedIds = new Set<string>();
  const regions = (Array.isArray(raw.regions) ? raw.regions : [])
    .filter((region: unknown) => !!region && typeof region === 'object')
    .slice(0, REGIONAL_LIMITS.workingMax)
    // A version 2 region carries `strength`; read hybrids per region.
    .map((region: any) => normaliseRegion(region, isVersion1 && region.strength === undefined, usedIds));
  return {
    enabled: raw.enabled === true,
    version: 2,
    separation: REGIONAL_SEPARATIONS.includes(raw.separation) ? raw.separation : 'balanced',
    // Missing means off (the version 1 meaning and the version 2 default alike).
    layout_hints: raw.layout_hints === true,
    regions,
  };
}

/** A copy of a region that shares nothing mutable with it (its LoRA list included). */
export function cloneRegion(region: RegionalPromptRegion): RegionalPromptRegion {
  const copy = { ...region };
  if (Array.isArray(region.loras)) copy.loras = region.loras.map(lora => ({ ...lora }));
  return copy;
}

export function cloneRegionalConfig(config: RegionalPromptingConfig): RegionalPromptingConfig {
  return { ...config, regions: (config.regions || []).map(cloneRegion) };
}

/** Copies a snapshot into the live config object, so every holder of the reference sees it. */
export function restoreRegionalConfig(target: RegionalPromptingConfig, snapshot: RegionalPromptingConfig): void {
  target.enabled = snapshot.enabled;
  target.version = 2;
  target.separation = snapshot.separation ?? 'balanced';
  target.layout_hints = snapshot.layout_hints === true;
  target.regions = (snapshot.regions || []).map(cloneRegion);
}

export function regionalFamily(model?: RegionalModelInfo | null): RegionalFamily {
  const base = String(model?.base_model ?? '').toLowerCase();
  const id = String(model?.model_id ?? '').toLowerCase();
  if (base.includes('krea') || id.includes('krea')) return 'krea';
  if (base.includes('anima') || id.includes('anima')) return 'anima';
  if (base.includes('illustrious') || base.includes('sdxl') || base.includes('pony') || base.includes('noob')) return 'sdxl';
  return 'other';
}

/**
 * Reads the `/models` capability object when present (SPEC 4.6), otherwise falls back from the model's flags:
 * Illustrious/SDXL and Anima have region negatives, Krea 2 does not; every job type is regional in version 2.
 */
export function resolveRegionalCapability(model?: RegionalModelInfo | null): RegionalModelCapability {
  if (!model) {
    return {
      supported: false, max_regions: REGIONAL_LIMITS.maxRegions, negative_prompts: false, layout_hints: false, job_types: [],
      region_loras: false, max_region_loras: 0, max_total_loras: REGION_LORA_LIMITS.defaultTotal,
    };
  }
  const family = regionalFamily(model);
  // Job LoRAs + region LoRAs per image: the backend's number, else the LoRA panel's limit.
  const modelMaxLoras = Math.round(finite(model.max_loras, REGION_LORA_LIMITS.defaultTotal));
  const fallback: RegionalModelCapability = {
    supported: model.supports_regional_prompting === true,
    max_regions: REGIONAL_LIMITS.maxRegions,
    negative_prompts: family !== 'krea' && model.supports_negative_prompt !== false,
    layout_hints: family === 'krea',
    job_types: [...REGIONAL_JOB_TYPES],
    // LoRAs per region only when the backend says so (an older backend would drop them silently).
    region_loras: false,
    max_region_loras: 0,
    max_total_loras: modelMaxLoras >= 1 ? modelMaxLoras : REGION_LORA_LIMITS.defaultTotal,
  };
  const reported = model.regional;
  if (!reported || typeof reported !== 'object') return fallback;
  const regionLoras = reported.region_loras === true && reported.supported !== false && model.supports_loras !== false;
  const reportedTotal = Math.round(finite(reported.max_total_loras, fallback.max_total_loras!));
  const supported = typeof reported.supported === 'boolean' ? reported.supported : fallback.supported;
  // Unsupported models report max_regions 0. Regions are only paused there and kept for supported models, so the
  // editor keeps the shared limit (otherwise it showed "3/1" and blocked adding regions while paused).
  const maxRegions = supported ? Math.round(finite(reported.max_regions, fallback.max_regions)) : REGIONAL_LIMITS.maxRegions;
  return {
    supported,
    max_regions: clamp(maxRegions, 1, REGIONAL_LIMITS.workingMax),
    negative_prompts: typeof reported.negative_prompts === 'boolean'
      ? reported.negative_prompts && model.supports_negative_prompt !== false
      : fallback.negative_prompts,
    layout_hints: typeof reported.layout_hints === 'boolean' ? reported.layout_hints : fallback.layout_hints,
    job_types: Array.isArray(reported.job_types) ? reported.job_types.map(String) : fallback.job_types,
    region_loras: regionLoras,
    max_region_loras: regionLoras
      ? clamp(Math.round(finite(reported.max_region_loras, REGION_LORA_LIMITS.perRegion)), 1, REGION_LORA_LIMITS.perRegion)
      : 0,
    max_total_loras: reportedTotal >= 1 ? reportedTotal : fallback.max_total_loras,
  };
}

export type RegionalPayloadStatus = 'off' | 'sent' | 'paused-model' | 'paused-job' | 'no-prompts' | 'all-off';

export interface RegionalPayloadReport {
  /** Exactly what goes into the job request as `regional_prompting`. */
  payload: RegionalPromptingConfig;
  status: RegionalPayloadStatus;
  /** 1-based positions of regions skipped because their prompt is empty. */
  emptyRegions: number[];
  /** 1-based positions of regions with a prompt but strength 0 ("off"; SPEC 1), which are not sent. */
  offRegions: number[];
  /** Regions with a prompt that did not fit the model's limit. */
  overLimit: number;
  /** Region-LoRA entries sent; each one is charged like a job LoRA. */
  regionLoras: number;
  /** Region LoRAs kept in the editor but not sent because the model does not use LoRAs per region. */
  regionLorasPaused: number;
  /** Region LoRAs of sent regions that were left out, and why. */
  regionLoraSkips: RegionLoraSkip[];
}

export interface RegionLoraSkip {
  /** 1-based position of the region in the editor. */
  region: number;
  name: string;
  /** base-model: made for another model type (paused); job-lora: already used for the whole image; limit: over the per-image limit. */
  reason: 'base-model' | 'job-lora' | 'limit';
  baseModel?: string;
}

/** What the payload needs besides the regions: the job's own LoRAs and the selected model's base model. */
export interface RegionalPayloadOptions {
  /** The LoRA panel's selection: counts toward the per-image limit, and a region copy of one is not sent. */
  jobLoras?: ReadonlyArray<{ id?: unknown; version_id?: unknown }> | null;
  /** base_model of the selected model; a region LoRA made for another one is paused. */
  baseModel?: string | null;
  /** base_model of a region LoRA that does not carry one (from history or a preset): the catalog's. */
  loraBaseModel?: (lora: RegionalLora) => string | null | undefined;
}

/** True when a region LoRA is sent with this model: made for its base model and not already a job LoRA. */
export function regionLoraUsable(lora: RegionalLora, options: RegionalPayloadOptions): boolean {
  const base = lora.base_model || options.loraBaseModel?.(lora) || null;
  if (options.baseModel && base && base !== options.baseModel) return false;
  return !(options.jobLoras ?? []).some(job => loraKeys(job).some(key => loraKeys(lora).includes(key)));
}

/** How many region LoRAs fit the image: the per-image cap, and job LoRAs + region LoRAs <= max_total_loras. */
export function regionLoraBudget(capability: RegionalModelCapability, jobLoraCount: number): number {
  if (!capability.region_loras) return 0;
  const total = capability.max_total_loras ?? REGION_LORA_LIMITS.defaultTotal;
  return Math.max(0, Math.min(REGION_LORA_LIMITS.perImage, total - Math.max(0, jobLoraCount)));
}

export function disabledRegionalPayload(): RegionalPromptingConfig {
  return { enabled: false, regions: [] };
}

/**
 * Builds the version 2 payload (SPEC 1) from the working state. Disabled, paused (model or job type without
 * regional support) and prompt-less states send `{enabled: false, regions: []}`, which every worker understands.
 */
export function buildRegionalPayload(
  input: RegionalPromptingConfig | null | undefined,
  capability: RegionalModelCapability,
  jobType?: string | null,
  options: RegionalPayloadOptions = {},
): RegionalPayloadReport {
  const config = normaliseRegionalConfig(input);
  const report = (status: RegionalPayloadStatus, extra: Partial<RegionalPayloadReport> = {}): RegionalPayloadReport => ({
    payload: disabledRegionalPayload(), status, emptyRegions: [], offRegions: [], overLimit: 0,
    regionLoras: 0, regionLorasPaused: 0, regionLoraSkips: [], ...extra,
  });
  if (!config.enabled) return report('off');
  if (!capability.supported) return report('paused-model');
  if (jobType && !capability.job_types.includes(jobType)) return report('paused-job');

  const emptyRegions: number[] = [];
  const offRegions: number[] = [];
  // Strength 0 means "region off" (SPEC 1): the backend removes such regions, so they are not sent and do not
  // take one of the model's region slots.
  const active = config.regions.filter((region, index) => {
    if (!region.prompt.trim()) {
      emptyRegions.push(index + 1);
      return false;
    }
    if (!(finite(region.strength, 1) > 0)) {
      offRegions.push(index + 1);
      return false;
    }
    return true;
  });
  if (!active.length) return report(offRegions.length ? 'all-off' : 'no-prompts', { emptyRegions, offRegions });

  const kept = active.slice(0, capability.max_regions);

  // LoRAs per region: only on models that use them; a LoRA made for another base model is paused, a region copy of
  // a job LoRA is not sent (the job's copy already covers the whole image), and the per-image limit is kept in order.
  const jobLoras = options.jobLoras ?? [];
  const jobKeys = new Set(jobLoras.flatMap(lora => loraKeys(lora)));
  let budget = regionLoraBudget(capability, jobLoras.length);
  let regionLorasPaused = 0;
  const regionLoraSkips: RegionLoraSkip[] = [];
  const lorasFor = (region: RegionalPromptRegion, number: number): RegionalLora[] => {
    const loras = normaliseRegionLoras(region.loras).filter(lora => lora.strength > 0);
    if (!loras.length) return [];
    if (!capability.region_loras) {
      regionLorasPaused += loras.length;
      return [];
    }
    const sent: RegionalLora[] = [];
    for (const lora of loras.slice(0, capability.max_region_loras || REGION_LORA_LIMITS.perRegion)) {
      const name = lora.name || 'LoRA';
      const loraBase = lora.base_model || options.loraBaseModel?.(lora) || null;
      if (options.baseModel && loraBase && loraBase !== options.baseModel) {
        regionLoraSkips.push({ region: number, name, reason: 'base-model', baseModel: loraBase });
      } else if (loraKeys(lora).some(key => jobKeys.has(key))) {
        regionLoraSkips.push({ region: number, name, reason: 'job-lora' });
      } else if (budget <= 0) {
        regionLoraSkips.push({ region: number, name, reason: 'limit' });
      } else {
        budget--;
        sent.push(regionLoraPayload(lora));
      }
    }
    return sent;
  };
  // Editor numbers (1-based positions in the working list) of the regions that are sent.
  const numbers = config.regions
    .map((region, index) => ({ region, number: index + 1 }))
    .filter(item => kept.includes(item.region))
    .map(item => item.number);

  const regions = kept.map((region, keptIndex): RegionalPromptRegion => {
    const [x, width] = roundedSpan(region.x, region.width);
    const [y, height] = roundedSpan(region.y, region.height);
    const strength = round4(clamp(finite(region.strength, 1), 0, 1));
    const loras = lorasFor(region, numbers[keptIndex]);
    return {
      id: region.id.slice(0, REGIONAL_LIMITS.idMax),   // no name: the editor no longer has one (owner, 2026-11-17)
      prompt: region.prompt.trim().slice(0, REGIONAL_LIMITS.promptMax),
      negative_prompt: capability.negative_prompts ? String(region.negative_prompt ?? '').trim().slice(0, REGIONAL_LIMITS.promptMax) : '',
      x, y, width, height,
      strength,
      feather: Math.round(clamp(finite(region.feather, REGIONAL_LIMITS.defaultFeather), 0, REGIONAL_LIMITS.maxFeather)),
      inherit_base_prompt: region.inherit_base_prompt !== false,
      denoise_strength: strength,
      opacity: 1,
      ...(loras.length ? { loras } : {}),
    };
  });
  return {
    payload: {
      enabled: true,
      version: 2,
      separation: config.separation ?? 'balanced',
      layout_hints: config.layout_hints === true,
      regions,
    },
    status: 'sent',
    emptyRegions,
    offRegions,
    overLimit: active.length - kept.length,
    regionLoras: regions.reduce((total, region) => total + (region.loras?.length ?? 0), 0),
    regionLorasPaused,
    regionLoraSkips,
  };
}

/** Sentences for region LoRAs that are not sent (status banner, and the toast when a job is sent). */
export function describeRegionLoraSkips(
  report: Pick<RegionalPayloadReport, 'regionLoraSkips' | 'regionLorasPaused'>,
  capability: RegionalModelCapability,
  modelName = 'This model',
  baseModel?: string | null,
): string[] {
  const notes: string[] = [];
  const list = (reason: RegionLoraSkip['reason']) => report.regionLoraSkips
    .filter(skip => skip.reason === reason)
    .map(skip => `"${skip.name}" (Region ${skip.region})`);
  if (report.regionLorasPaused > 0) {
    const many = report.regionLorasPaused > 1;
    notes.push(`${modelName} does not use LoRAs per region; ${report.regionLorasPaused} region ${many ? 'LoRAs are' : 'LoRA is'} kept for models that do.`);
  }
  const otherBase = list('base-model');
  if (otherBase.length) {
    const many = otherBase.length > 1;
    notes.push(`${otherBase.join(', ')} ${many ? 'are' : 'is'} made for another model type than ${baseModel || modelName}, so ${many ? 'they are' : 'it is'} paused.`);
  }
  const duplicates = list('job-lora');
  if (duplicates.length) {
    notes.push(`${duplicates.join(', ')} ${duplicates.length > 1 ? 'are' : 'is'} already in the LoRA panel for the whole image, so the region copy is skipped.`);
  }
  const overLimit = list('limit');
  if (overLimit.length) {
    const total = capability.max_total_loras ?? REGION_LORA_LIMITS.defaultTotal;
    notes.push(`Up to ${total} LoRAs per image (LoRA panel and regions together): ${overLimit.join(', ')} ${overLimit.length > 1 ? 'are' : 'is'} left out.`);
  }
  return notes;
}

export type RegionalStatusKind = 'hidden' | 'off' | 'on' | 'paused' | 'warning';

export interface RegionalStatus {
  kind: RegionalStatusKind;
  /** Short text for the chip. */
  label: string;
  /** One or more sentences for the tooltip, banner and screen readers. */
  detail: string;
  /** Regions that will be sent. */
  count: number;
  warnings: string[];
}

const JOB_LABELS: Record<string, string> = {
  txt2img: 'text-to-image',
  img2img: 'images made from a reference image',
  inpainting: 'inpainting',
  upscale: 'upscaling',
  txt2img_upscale: 'Enhanced Quality (generate + upscale)',
};

export function regionalJobLabel(jobType: string | null | undefined): string {
  return JOB_LABELS[String(jobType ?? '')] ?? String(jobType ?? 'this job type');
}

/** "Region 2", "Regions 2 and 3", "Regions 1, 2 and 4". */
export function describeRegionNumbers(numbers: number[]): string {
  if (numbers.length === 1) return `Region ${numbers[0]}`;
  const head = numbers.slice(0, -1).join(', ');
  return `Regions ${head} and ${numbers[numbers.length - 1]}`;
}

/** The status chip and banner text (SPEC 5): on, paused, or the warnings that change what is sent. */
export function regionalStatus(
  config: RegionalPromptingConfig | null | undefined,
  capability: RegionalModelCapability,
  jobType?: string | null,
  modelName?: string,
  options: RegionalPayloadOptions = {},
): RegionalStatus {
  const regions = config?.regions ?? [];
  const enabled = !!config?.enabled;
  const status = (kind: RegionalStatusKind, label: string, detail: string, count = 0, warnings: string[] = []): RegionalStatus =>
    ({ kind, label, detail, count, warnings });

  if (!capability.supported && (!enabled || !regions.length)) {
    return status('hidden', 'Regions', 'This model does not support regional prompting.');
  }
  if (!enabled) {
    return status('off', 'Regions', regions.length
      ? `${regions.length} ${regions.length === 1 ? 'region is' : 'regions are'} saved but switched off.`
      : 'Give parts of the image their own prompt.');
  }
  if (!capability.supported) {
    return status('paused', 'Regions paused',
      `${modelName || 'This model'} does not support regional prompting. Your regions are kept and come back when you switch to a supported model.`);
  }
  if (jobType && !capability.job_types.includes(jobType)) {
    return status('paused', 'Regions paused', `${modelName || 'This model'} does not use regions for ${regionalJobLabel(jobType)}. Your regions are kept.`);
  }
  const report = buildRegionalPayload(config, capability, jobType, options);
  const warnings: string[] = [];
  if (!regions.length) warnings.push('No regions yet. Open the editor to draw one.');
  else if (report.status === 'no-prompts') warnings.push('No region has a prompt yet, so the main prompt is used for the whole image.');
  else if (report.status === 'all-off') warnings.push('Every region with a prompt is at 0% strength, so the main prompt is used for the whole image.');
  else if (report.emptyRegions.length) {
    const many = report.emptyRegions.length > 1;
    warnings.push(`${describeRegionNumbers(report.emptyRegions)} ${many ? 'have' : 'has'} no prompt and will be skipped.`);
  }
  if (report.overLimit > 0) {
    warnings.push(`${modelName || 'This model'} uses up to ${capability.max_regions} regions; ${report.overLimit} more will be skipped.`);
  }
  warnings.push(...describeRegionLoraSkips(report, capability, modelName || 'This model', options.baseModel));
  const count = report.payload.regions.length;
  if (warnings.length) {
    return status('warning', count ? `Regions on · ${count}` : 'Regions: check', warnings.join(' '), count, warnings);
  }
  return status('on', `Regions on · ${count}`, `${count} ${count === 1 ? 'region is' : 'regions are'} used for the next image.`, count);
}

/**
 * Weight the worker puts on a region's own text (mirrors regional.py DEFAULT_EMPHASIS): SDXL 1.2, others 1.
 * Text the user already weighted, or with unbalanced brackets, is left as written.
 */
export const REGION_TEXT_WEIGHT: Partial<Record<RegionalFamily, number>> = { sdxl: 1.2 };

export function regionTextWeight(family: RegionalFamily, regionPrompt: string): number {
  const weight = REGION_TEXT_WEIGHT[family] ?? 1;
  const text = String(regionPrompt ?? '');
  if (weight === 1 || !text.trim() || /:\s*[0-9]*\.?[0-9]+\s*\)/.test(text) || !bracketsBalanced(text)) return 1;
  return weight;
}

function bracketsBalanced(text: string): boolean {
  let round = 0;
  let square = 0;
  let escaped = false;
  for (const char of text) {
    if (escaped) { escaped = false; continue; }
    if (char === '\\') escaped = true;
    else if (char === '(') round++;
    else if (char === ')') { if (--round < 0) return false; }
    else if (char === '[') square++;
    else if (char === ']') { if (--square < 0) return false; }
  }
  return round === 0 && square === 0;
}

/** What the model reads inside a region on SDXL/Anima when "add the main prompt" is on. */
export function composedRegionPrompt(mainPrompt: string, regionPrompt: string, inherit: boolean, weight = 1): string {
  const main = String(mainPrompt ?? '').trim();
  let region = String(regionPrompt ?? '').trim();
  if (region && weight !== 1) region = `(${region}:${weight})`;
  if (!inherit || !main) return region;
  if (!region) return main;
  return `${main}, ${region}`;
}

const GENERIC_TAGS = new Set([
  'masterpiece', 'best quality', 'high quality', 'amazing quality', 'very aesthetic', 'aesthetic', 'absurdres',
  'highres', 'newest', 'detailed', 'highly detailed', 'score_9', 'score_8_up', 'score_7_up', 'safe', 'sfw',
]);

function promptTags(prompt: string): string[] {
  return String(prompt ?? '')
    .toLowerCase()
    .split(/[,\n]/)
    .map(tag => tag.replace(/[(){}[\]]/g, '').replace(/:\s*-?\d+(\.\d+)?\s*$/, '').replace(/\s+/g, ' ').trim())
    .filter(tag => tag.length >= 3 && !GENERIC_TAGS.has(tag));
}

/** The first subject-like tag a region shares with the main prompt (it would then leak into other regions). */
export function sharedSubjectTag(mainPrompt: string, regionPrompt: string): string | null {
  const main = new Set(promptTags(mainPrompt));
  if (!main.size) return null;
  return promptTags(regionPrompt).find(tag => main.has(tag)) ?? null;
}

/** First words of the prompt for labels on the canvas and in lists. */
export function promptSnippet(prompt: string, max = 42): string {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Theme-independent palette: readable with dark text on the swatch and as outlines on the dark canvas. */
export const REGION_COLORS = ['#4dabf7', '#ff922b', '#51cf66', '#f783ac', '#fcc419', '#b197fc', '#3bc9db', '#ff6b6b'];

export function regionColor(index: number): string {
  return REGION_COLORS[((index % REGION_COLORS.length) + REGION_COLORS.length) % REGION_COLORS.length];
}
