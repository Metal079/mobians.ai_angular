export type VideoGenerationMode = 'fl2v' | 'ref2v';
export type VideoAspect = 'square' | 'landscape' | 'portrait';
export type VideoOutputFormat = 'video' | 'gif';
export type VideoJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';
export type VideoDesiredState = 'available' | 'draining' | 'maintenance';

export interface VideoServiceState {
  extensions_available?: boolean;
  feature_enabled: boolean;
  desired_state: VideoDesiredState;
  effective_state: string;
  accepting_jobs: boolean;
  message: string;
  maintenance_message?: string | null;
  worker_status: string;
  worker_message?: string | null;
  worker_heartbeat_at?: string | null;
  heartbeat_age_seconds?: number | null;
  disk_free_bytes?: number | null;
  disk_total_bytes?: number | null;
  current_job_id?: string | null;
}

export interface VideoAspectConfig {
  width: number;
  height: number;
  comfy_value: string;
}

export interface VideoPriceQuote {
  pricing_version: string;
  credit_cost: number;
  base_cost: number;
  reference_cost: number;
  effective_video_seconds: number[];
}

export interface VideoConfig {
  extension?: VideoExtensionConfig;
  pricing_version?: string;
  generation_modes?: VideoGenerationMode[];
  max_reference_images?: number;
  max_reference_videos?: number;
  max_reference_video_bytes?: number;
  max_reference_total_bytes?: number;
  reference_video_min_seconds?: number;
  reference_video_max_seconds?: number;
  reference_video_duration_tolerance_seconds?: number;
  accepted_reference_video_types?: string[];
  service: VideoServiceState;
  prices: Record<string, number>;
  aspects: Record<VideoAspect, VideoAspectConfig>;
  durations: number[];
  active_job_limit: number;
  retention_hours: number;
  max_frame_bytes: number;
  accepted_frame_types: string[];
}

export interface VideoJob {
  generation_mode?: VideoGenerationMode | 'extend';
  output_frame_count?: number | null;
  output_duration_seconds?: number | null;
  output_has_audio?: boolean | null;
  source_job_id?: string | null;
  source_duration_seconds?: number | null;
  added_duration_seconds?: number | null;
  reference_image_count?: number;
  reference_video_count?: number;
  id: string;
  status: VideoJobStatus;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  expires_at?: string | null;
  prompt: string;
  audio_prompt?: string | null;
  disable_sound?: boolean;
  output_format?: VideoOutputFormat;
  duration_seconds: number;
  aspect_ratio: VideoAspect | 'source';
  width: number;
  height: number;
  seed: number;
  progress: number;
  queue_position?: number | null;
  credit_cost: number;
  refunded: boolean;
  error_message?: string | null;
  has_last_frame: boolean;
  media_ready: boolean;
}

export interface VideoJobsResponse {
  jobs: VideoJob[];
}

export interface VideoSubmitResponse {
  idempotent_replay?: boolean;
  job: VideoJob;
  credits_used: number;
  credits_remaining: number;
}

export interface VideoExtensionConfig {
  context_seconds?: number;
  max_reference_images?: number;
  max_frame_bytes?: number;
  enabled: boolean;
  pricing_version: string;
  prices: Record<string, number>;
  durations: number[];
  added_seconds: Record<string, number>;
  min_source_seconds: number;
  max_source_seconds: number;
  max_source_bytes: number;
  accepted_source_types: string[];
}

export interface VideoExtensionQuote {
  base_cost: number;
  reference_cost: number;
  reference_image_count: number;
  pricing_version: string;
  duration_seconds: number;
  credit_cost: number;
  added_frame_count: number;
  added_duration_seconds: number;
  context_frame_count: number;
}

export interface VideoExtensionSubmission {
  outputFormat?: VideoOutputFormat;
  referenceImages?: File[];
  requestId: string;
  sourceJobId?: string;
  sourceVideo?: File;
  prompt: string;
  audioPrompt?: string;
  continueAudio: boolean;
  durationSeconds: number;
  expectedCreditCost: number;
  pricingVersion: string;
}

export interface VideoAdminState {
  service: VideoServiceState;
  counts: {
    pending_count: number;
    processing_count: number;
    retained_count: number;
  };
}

export interface VideoReference {
  id: string;
  kind: 'image' | 'video';
  file: File;
  previewUrl: string;
  source: 'upload' | 'history';
  useAudio: boolean;
  width: number;
  height: number;
  duration?: number;
}
