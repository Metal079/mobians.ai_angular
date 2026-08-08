import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from 'src/environments/environment';
import { VideoGenerationService } from './video-generation.service';

describe('VideoGenerationService', () => {
  let service: VideoGenerationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VideoGenerationService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VideoGenerationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('submits server-priced video inputs as multipart form data', () => {
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const last = new File(['last'], 'last.webp', { type: 'image/webp' });

    service.submitJob({
      firstFrame: first,
      firstFrameSource: 'upload',
      lastFrame: last,
      lastFrameSource: 'history',
      prompt: 'A smooth turn',
      audioPrompt: 'quiet wind',
      disableSound: false,
      outputFormat: 'video',
      durationSeconds: 8,
      aspectRatio: 'portrait',
      seed: 42,
    }).subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/video/jobs`);
    expect(request.request.method).toBe('POST');
    const body = request.request.body as FormData;
    expect(body.get('first_frame')).toBe(first);
    expect(body.get('first_frame_source')).toBe('upload');
    expect(body.get('last_frame')).toBe(last);
    expect(body.get('last_frame_source')).toBe('history');
    expect(body.get('prompt')).toBe('A smooth turn');
    expect(body.get('audio_prompt')).toBe('quiet wind');
    expect(body.get('disable_sound')).toBe('false');
    expect(body.get('output_format')).toBe('video');
    expect(body.get('duration_seconds')).toBe('8');
    expect(body.get('aspect_ratio')).toBe('portrait');
    expect(body.get('seed')).toBe('42');
    request.flush({});
  });

  it('does not send a retained audio direction for silent GIF output', () => {
    service.submitJob({
      firstFrame: new File(['first'], 'first.png', { type: 'image/png' }),
      firstFrameSource: 'upload',
      prompt: 'A smooth turn',
      audioPrompt: 'quiet wind',
      disableSound: true,
      outputFormat: 'gif',
      durationSeconds: 5,
      aspectRatio: 'square',
    }).subscribe();

    const request = http.expectOne(`${environment.apiBaseUrl}/video/jobs`);
    const body = request.request.body as FormData;
    expect(body.get('audio_prompt')).toBeNull();
    expect(body.get('disable_sound')).toBe('true');
    expect(body.get('output_format')).toBe('gif');
    request.flush({});
  });

  it('builds scoped media URLs with an encoded token', () => {
    expect(service.mediaUrl('job/id', 'a+b/c')).toBe(
      `${environment.apiBaseUrl}/video/jobs/job%2Fid/content?access_token=a%2Bb%2Fc`
    );
  });
});
