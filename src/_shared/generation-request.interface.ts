import { RegionalPromptingConfig } from './regional-prompting.interface';

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
  }
  
