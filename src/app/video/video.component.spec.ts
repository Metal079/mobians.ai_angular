import { ChangeDetectorRef, NgZone } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';
import { AccountCtaService } from '../auth/account-cta.service';
import { AuthService } from '../auth/auth.service';
import { VideoGenerationService } from '../video-generation.service';
import { VideoComponent } from './video.component';
import { VideoJob } from 'src/_shared/video-generation.interface';

describe('VideoComponent', () => {
  let component: VideoComponent;
  let videoService: jasmine.SpyObj<VideoGenerationService>;
  let authService: jasmine.SpyObj<AuthService>;
  let changeDetector: jasmine.SpyObj<ChangeDetectorRef>;

  beforeEach(() => {
    videoService = jasmine.createSpyObj<VideoGenerationService>('VideoGenerationService', ['listJobs', 'submitJob', 'cancelJob']);
    changeDetector = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['detectChanges']);
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn', 'updateCredits']);
    const accountCta = jasmine.createSpyObj<AccountCtaService>('AccountCtaService', ['requestLogin', 'requestCreditPurchase']);
    const zone = { run: (update: () => void) => update() } as NgZone;

    component = new VideoComponent(videoService, authService, accountCta, zone, changeDetector);
  });

  it('updates the view after an uploaded frame finishes loading asynchronously', async () => {
    spyOn<any>(component, 'readImageDimensions').and.resolveTo({ width: 1200, height: 800 });
    spyOn(URL, 'createObjectURL').and.returnValue('blob:preview');
    const file = new File(['frame'], 'frame.png', { type: 'image/png' });
    const event = { target: { files: [file] } } as unknown as Event;

    await component.onFileSelected(event, 'first');

    expect(component.firstFrame?.file).toBe(file);
    expect(component.aspectRatio).toBe('landscape');
    expect(changeDetector.detectChanges).toHaveBeenCalled();
  });

  it('updates the frame and closes the history picker in the same async view cycle', async () => {
    spyOn<any>(component, 'readImageDimensions').and.resolveTo({ width: 800, height: 1200 });
    spyOn(URL, 'createObjectURL').and.returnValue('blob:history-preview');
    component.pickerOpen = true;
    component.pickerTarget = 'last';

    await component.onHistoryImageSelected({
      UUID: 'history-frame',
      width: 800,
      height: 1200,
      aspectRatio: 'portrait',
      blob: new Blob(['frame'], { type: 'image/webp' }),
    });

    expect(component.lastFrame?.source).toBe('history');
    expect(component.pickerOpen).toBeFalse();
    expect(changeDetector.detectChanges).toHaveBeenCalled();
  });

  it('releases the polling guard after a stalled jobs request times out', fakeAsync(() => {
    videoService.listJobs.and.returnValues(NEVER, of({ jobs: [] }));

    component.loadJobs(true);
    expect(component.loadingJobs).toBeTrue();

    tick(15_001);
    expect(component.loadingJobs).toBeFalse();

    component.loadJobs(true);
    expect(videoService.listJobs).toHaveBeenCalledTimes(2);
  }));

  it('adds the selected camera command to the submitted prompt text', () => {
    component.prompt = 'Her expression softens as the lights glow behind her.';
    component.cameraMotion = 'push-in';

    expect(component.composedPrompt).toBe('Her expression softens as the lights glow behind her. [Push in]');
    expect(component.prompt).toBe('Her expression softens as the lights glow behind her.');
  });

  it('uses a transition-focused example when a last frame is selected', () => {
    expect(component.promptPlaceholder).toContain('looks toward the camera');

    component.lastFrame = {
      file: new File(['last'], 'last.png', { type: 'image/png' }),
      previewUrl: 'blob:last',
      width: 800,
      height: 1200,
      source: 'upload',
    };

    expect(component.promptPlaceholder).toContain('settles into the ending pose');
  });

  it('keeps the visual and audio prompts after a video is queued', () => {
    const job = {
      id: 'job-1', status: 'pending', created_at: '', updated_at: '', prompt: 'A gentle wave',
      duration_seconds: 5, aspect_ratio: 'square', width: 640, height: 640, seed: 1,
      progress: 0, credit_cost: 100, refunded: false, has_last_frame: false, media_ready: false,
    } as const;
    authService.isLoggedIn.and.returnValue(true);
    videoService.submitJob.and.returnValue(of({ job, credits_used: 100, credits_remaining: 400 }));
    spyOn<any>(component, 'hydrateJobAssets');
    component.config = {
      service: { feature_enabled: true, desired_state: 'available', effective_state: 'available', accepting_jobs: true, message: '', worker_status: 'online' },
      prices: { '5': 100 }, aspects: { square: { width: 640, height: 640, comfy_value: 'square' }, landscape: { width: 768, height: 512, comfy_value: 'landscape' }, portrait: { width: 512, height: 768, comfy_value: 'portrait' } },
      durations: [5], active_job_limit: 3, retention_hours: 24, max_frame_bytes: 1024, accepted_frame_types: ['image/png'],
    };
    component.currentCredits = 500;
    component.firstFrame = { file: new File(['frame'], 'frame.png', { type: 'image/png' }), previewUrl: 'blob:first', width: 640, height: 640, source: 'upload' };
    component.prompt = 'A gentle wave';
    component.audioPrompt = 'Soft wind';

    component.submit();

    expect(component.prompt).toBe('A gentle wave');
    expect(component.audioPrompt).toBe('Soft wind');
  });

  it('toggles a saved prompt between collapsed and expanded', () => {
    const job = { id: 'job-1' } as VideoJob;

    component.togglePrompt(job);
    expect(component.isPromptExpanded(job)).toBeTrue();

    component.togglePrompt(job);
    expect(component.isPromptExpanded(job)).toBeFalse();
  });

  it('updates a cancelled job immediately when polling is already in flight', () => {
    const job = {
      id: 'job-1', status: 'pending', created_at: '', updated_at: '', prompt: 'A gentle wave',
      duration_seconds: 5, aspect_ratio: 'square', width: 640, height: 640, seed: 1,
      progress: 0, credit_cost: 100, refunded: false, has_last_frame: false, media_ready: false,
    } as VideoJob;
    component.jobs = [job];
    component.loadingJobs = true;
    videoService.cancelJob.and.returnValue(of({ status: 'cancelled', credits_refunded: 100, credits_remaining: 500 }));

    component.cancel(job);

    expect(component.jobs[0].status).toBe('cancelled');
    expect(component.jobs[0].refunded).toBeTrue();
    expect(component.jobs[0].error_message).toBe('Cancelled by user');
    expect(authService.updateCredits).toHaveBeenCalledWith(500);
  });

  it('formats FastAPI validation arrays as readable field errors', () => {
    const message = (component as any).apiError({
      error: {
        detail: [
          { type: 'missing', loc: ['body', 'first_frame'], msg: 'Field required' },
          { type: 'missing', loc: ['body', 'prompt'], msg: 'Field required' },
          { type: 'missing', loc: ['body', 'duration_seconds'], msg: 'Field required' },
          { type: 'missing', loc: ['body', 'aspect_ratio'], msg: 'Field required' },
        ],
      },
    }, 'The video job could not be queued.');

    expect(message).toBe(
      'First frame: Field required. Video description: Field required. Video length: Field required. 1 more input error.'
    );
    expect(message).not.toContain('[object Object]');
  });

  it('preserves normal API error strings and falls back for unknown objects', () => {
    expect((component as any).apiError(
      { error: { detail: 'Video generation is unavailable.' } },
      'Fallback'
    )).toBe('Video generation is unavailable.');
    expect((component as any).apiError(
      { error: { detail: [{ unexpected: true }] } },
      'Fallback'
    )).toBe('Fallback');
  });
});
