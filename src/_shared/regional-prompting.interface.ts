/**
 * Regional prompting payload, version 2 (a strict superset of version 1).
 * Contract: artifacts/regional_prompting_20261117/SPEC.md section 1.
 * Editor code and helpers: src/app/home/options/regional-editor/.
 */
export type RegionalSeparation = 'soft' | 'balanced' | 'strict';

/**
 * A LoRA used inside one region only (SDXL and Anima). The site sends catalog references; the backend resolves
 * each one from the LoRA catalog (and adds the file path). At most 2 per region.
 */
export interface RegionalLora {
  /** lora_metadata row id. */
  id: number | null;
  /** Catalog version id (preferred for lookups). */
  version_id: number | null;
  name: string;
  version: string;
  /** Same range as job LoRAs (0..1.5); 0.8 when added. */
  strength: number;
  /** Working state only (never sent): the base model the LoRA was made for, so other models pause it. */
  base_model?: string;
}

export interface RegionalPromptRegion {
  /** Client id, at most 40 characters. */
  id: string;
  /** Optional label shown in the editor; never sent to a model. At most 60 characters. */
  name?: string;
  prompt: string;
  /** Added to (never replaces) the main negative prompt inside the region. */
  negative_prompt?: string;
  /** Fractions of the image: x + width <= 1, y + height <= 1. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Version 2: 0..1, how strongly the region prompt owns its area (0 = region off). */
  strength?: number;
  /** Edge blend in pixels at generation size; version 2 blends outward from the box. */
  feather: number;
  /** SDXL/Anima: the region's text becomes "main prompt, region prompt". */
  inherit_base_prompt: boolean;
  /** Version 1 compatibility: version 2 clients write `strength` here too. */
  denoise_strength: number;
  /** Version 1 compatibility: always 1.0 from version 2 clients. */
  opacity: number;
  /** LoRAs for this region only; present only when the region has some. */
  loras?: RegionalLora[];
}

export interface RegionalPromptingConfig {
  enabled: boolean;
  /** Absent means version 1. */
  version?: number;
  separation?: RegionalSeparation;
  layout_hints?: boolean;
  /** Order is depth: later regions are drawn on top and own overlaps. */
  regions: RegionalPromptRegion[];
}

/** Per-model capability object from `/models` (SPEC 4.6). */
export interface RegionalModelCapability {
  supported: boolean;
  max_regions: number;
  negative_prompts: boolean;
  layout_hints: boolean;
  job_types: string[];
  /** LoRAs per region (SDXL and Anima); absent from older backends, which means no. */
  region_loras?: boolean;
  /** LoRAs one region may use (2). */
  max_region_loras?: number;
  /** Job LoRAs plus region LoRAs per image. */
  max_total_loras?: number;
}
