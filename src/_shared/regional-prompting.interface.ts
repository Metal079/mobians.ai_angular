export interface RegionalPromptRegion {
  id: string;
  prompt: string;
  negative_prompt?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  denoise_strength: number;
  feather: number;
  opacity: number;
  inherit_base_prompt: boolean;
}

export interface RegionalPromptingConfig {
  enabled: boolean;
  regions: RegionalPromptRegion[];
}

