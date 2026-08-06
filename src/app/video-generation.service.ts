import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  VideoAdminState,
  VideoConfig,
  VideoDesiredState,
  VideoJob,
  VideoJobsResponse,
  VideoSubmitResponse,
} from 'src/_shared/video-generation.interface';

export interface VideoSubmission {
  firstFrame: File;
  firstFrameSource: 'upload' | 'history';
  lastFrame?: File | null;
  lastFrameSource?: 'upload' | 'history' | null;
  prompt: string;
  audioPrompt?: string | null;
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

  listJobs(): Observable<VideoJobsResponse> {
    return this.http.get<VideoJobsResponse>(`${this.baseUrl}/jobs`);
  }

  getJob(id: string): Observable<{ job: VideoJob }> {
    return this.http.get<{ job: VideoJob }>(`${this.baseUrl}/jobs/${encodeURIComponent(id)}`);
  }

  submitJob(submission: VideoSubmission): Observable<VideoSubmitResponse> {
    const form = new FormData();
    form.append('first_frame', submission.firstFrame);
    form.append('first_frame_source', submission.firstFrameSource);
    if (submission.lastFrame) form.append('last_frame', submission.lastFrame);
    if (submission.lastFrame && submission.lastFrameSource) form.append('last_frame_source', submission.lastFrameSource);
    form.append('prompt', submission.prompt);
    if (submission.audioPrompt?.trim()) form.append('audio_prompt', submission.audioPrompt.trim());
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
