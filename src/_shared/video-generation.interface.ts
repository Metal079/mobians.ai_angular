export type VideoAspect = 'square' | 'landscape' | 'portrait';
export type VideoOutputFormat = 'video' | 'gif';
export type VideoJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';
export type VideoDesiredState = 'available' | 'draining' | 'maintenance';

export interface VideoServiceState {
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

export interface VideoConfig {
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
  aspect_ratio: VideoAspect;
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
  job: VideoJob;
  credits_used: number;
  credits_remaining: number;
}

export interface VideoAdminState {
  service: VideoServiceState;
  counts: {
    pending_count: number;
    processing_count: number;
    retained_count: number;
  };
}
