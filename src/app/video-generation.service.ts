import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  VideoAdminState,
  VideoGenerationMode,
  VideoReference,
  VideoConfig,
  VideoPriceQuote,
  VideoDesiredState,
  VideoJob,
  VideoJobsResponse,
  VideoSubmitResponse,
} from 'src/_shared/video-generation.interface';

export interface VideoSubmission {
  expectedCreditCost?: number;
  pricingVersion?: string;
  generationMode?: VideoGenerationMode;
  references?: VideoReference[];
  firstFrame?: File;
  firstFrameSource?: 'upload' | 'history';
  lastFrame?: File | null;
  lastFrameSource?: 'upload' | 'history' | null;
  prompt: string;
  audioPrompt?: string | null;
  disableSound: boolean;
  outputFormat: 'video' | 'gif';
  durationSeconds: number;
  aspectRatio: string;
  seed?: number | null;
}

@Injectable({ providedIn: 'root' })
export class VideoGenerationService {
  private readonly baseUrl = `${environment.apiBaseUrl}/video`;

  constructor(private readonly http: HttpClient) {}

  getConfig(): Observable<VideoConfig> {
    return this.http.get<VideoConfig>(`${this.baseUrl}/config`);
  }

  getQuote(durationSeconds: number, references: VideoReference[]): Observable<VideoPriceQuote> {
    const form = new FormData();
    form.append('generation_mode', 'ref2v');
    form.append('duration_seconds', String(durationSeconds));
    form.append('reference_image_count', String(references.filter(item => item.kind === 'image').length));
    form.append('reference_video_seconds', JSON.stringify(references.filter(item => item.kind === 'video').map(item => item.duration)));
    return this.http.post<VideoPriceQuote>(`${this.baseUrl}/quote`, form);
  }

  listJobs(): Observable<VideoJobsResponse> {
    return this.http.get<VideoJobsResponse>(`${this.baseUrl}/jobs`);
  }

  getJob(id: string): Observable<{ job: VideoJob }> {
    return this.http.get<{ job: VideoJob }>(`${this.baseUrl}/jobs/${encodeURIComponent(id)}`);
  }

  submitJob(submission: VideoSubmission): Observable<VideoSubmitResponse> {
    const form = new FormData();
    const mode = submission.generationMode ?? 'fl2v';
    form.append('generation_mode', mode);
    if (mode === 'fl2v') {
      if (submission.firstFrame) form.append('first_frame', submission.firstFrame);
      form.append('first_frame_source', submission.firstFrameSource ?? 'upload');
      if (submission.lastFrame) form.append('last_frame', submission.lastFrame);
      if (submission.lastFrame && submission.lastFrameSource) form.append('last_frame_source', submission.lastFrameSource);
    } else {
      const images = (submission.references ?? []).filter(item => item.kind === 'image');
      const videos = (submission.references ?? []).filter(item => item.kind === 'video');
      images.forEach(item => form.append('reference_images', item.file));
      videos.forEach(item => form.append('reference_videos', item.file));
      form.append('reference_image_sources', JSON.stringify(images.map(item => item.source)));
      form.append('reference_video_audio', JSON.stringify(videos.map(item => item.useAudio)));
    }
    if (submission.expectedCreditCost !== undefined) form.append('expected_credit_cost', String(submission.expectedCreditCost));
    if (submission.pricingVersion) form.append('pricing_version', submission.pricingVersion);
    form.append('prompt', submission.prompt);
    if (!submission.disableSound && submission.audioPrompt?.trim()) form.append('audio_prompt', submission.audioPrompt.trim());
    form.append('disable_sound', String(submission.disableSound));
    form.append('output_format', submission.outputFormat);
    form.append('duration_seconds', String(submission.durationSeconds));
    form.append('aspect_ratio', submission.aspectRatio);
    if (submission.seed !== null && submission.seed !== undefined) form.append('seed', String(submission.seed));
    return this.http.post<VideoSubmitResponse>(`${this.baseUrl}/jobs`, form);
  }

  cancelJob(id: string): Observable<{ status: string; credits_refunded: number; credits_remaining: number }> {
    return this.http.delete<{ status: string; credits_refunded: number; credits_remaining: number }>(
      `${this.baseUrl}/jobs/${encodeURIComponent(id)}`
    );
  }

  thumbnailUrl(jobId: string, frame: 'first' | 'last'): string {
    return `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/frames/${frame}/thumbnail`;
  }

  getThumbnail(jobId: string, frame: 'first' | 'last'): Observable<Blob> {
    return this.http.get(this.thumbnailUrl(jobId, frame), { responseType: 'blob' });
  }

  createMediaToken(jobId: string): Observable<{ access_token: string; expires_in: number }> {
    return this.http.post<{ access_token: string; expires_in: number }>(
      `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/media-token`,
      {}
    );
  }

  mediaUrl(jobId: string, token: string, download = false): string {
    const action = download ? 'download' : 'content';
    return `${this.baseUrl}/jobs/${encodeURIComponent(jobId)}/${action}?access_token=${encodeURIComponent(token)}`;
  }

  getAdminState(): Observable<VideoAdminState> {
    return this.http.get<VideoAdminState>(`${environment.apiBaseUrl}/admin/video-service`);
  }

  updateAdminState(desiredState: VideoDesiredState, maintenanceMessage: string): Observable<{ service: VideoAdminState['service'] }> {
    return this.http.put<{ service: VideoAdminState['service'] }>(`${environment.apiBaseUrl}/admin/video-service`, {
      desired_state: desiredState,
      maintenance_message: maintenanceMessage,
    });
  }
}
