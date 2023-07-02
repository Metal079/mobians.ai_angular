export interface GenerationRequest {
    prompt: string;
    image: string | undefined;
    scheduler: number;
    steps: number;
    negative_prompt: string;
    width: number;
    height: number;
    guidance_scale: number;
    seed: number;
    batch_size: number;
    strength: number | undefined;
    job_type: string;
    model: string;
  }
  