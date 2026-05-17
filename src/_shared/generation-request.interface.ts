import { RegionalPromptingConfig } from './regional-prompting.interface';

export type DynamicPromptMode = 'random' | 'combinatorial';

export interface DynamicPromptingConfig {
  enabled: boolean;
  mode?: DynamicPromptMode;
  template?: string;
  wildcard_set?: string;
  preview_count?: number;
  max_generations?: number;
  expansion_seed?: number;
  selected_preview_index?: number;
}

export interface GenerationRequest {
    prompt: string;
    image?: string;
    mask_image?: string;
    color_inpaint?: boolean;
  lossy_images?: boolean;
    scheduler: number;
    steps: number;
    negative_prompt: string;
    width: number;
    height: number;
    guidance_scale: number;
    seed?: number;
    batch_size: number;
    strength: number | undefined;
    job_type: string;
    model: string;
    fast_pass_code?: string;
    loras?: any[];
    regional_prompting?: RegionalPromptingConfig;
    dynamic_prompting?: DynamicPromptingConfig;
  }
  
