import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from 'src/environments/environment';
import { VideoGenerationService } from './video-generation.service';
import { AuthInterceptor } from './auth/auth.interceptor';

describe('VideoGenerationService', () => {
  let service: VideoGenerationService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('authToken', 'video-test-token');
    TestBed.configureTestingModule({
      providers: [VideoGenerationService, provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(), { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }],
    });
    service = TestBed.inject(VideoGenerationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); localStorage.removeItem('authToken'); });

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
    expect(request.request.headers.get('Authorization')).toBe('Bearer video-test-token');
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
    expect(request.request.headers.get('Authorization')).toBe('Bearer video-test-token');
    const body = request.request.body as FormData;
    expect(body.get('audio_prompt')).toBeNull();
    expect(body.get('disable_sound')).toBe('true');
    expect(body.get('output_format')).toBe('gif');
    request.flush({});
  });

  it('submits references in per-kind order and excludes retained first/last frames', () => {
    const image = new File(['image'], 'reference.png', { type: 'image/png' });
    const video = new File(['video'], 'motion.mp4', { type: 'video/mp4' });
    service.submitJob({ generationMode: 'ref2v', firstFrame: image, lastFrame: image, expectedCreditCost:230, pricingVersion:'ref2v-04mp-v1',
      references: [
        { id: 'v', kind: 'video', file: video, previewUrl: '', source: 'upload', useAudio: true, width: 256, height: 256 },
        { id: 'i', kind: 'image', file: image, previewUrl: '', source: 'history', useAudio: false, width: 256, height: 256 },
      ], prompt: '<Picture 1> follows <Video 1>', disableSound: false, outputFormat: 'video', durationSeconds: 5, aspectRatio: 'square',
    }).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/video/jobs`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer video-test-token');
    const body = request.request.body as FormData;
    expect(body.get('generation_mode')).toBe('ref2v');
    expect(body.get('expected_credit_cost')).toBe('230');
    expect(body.get('pricing_version')).toBe('ref2v-04mp-v1');
    expect(body.get('first_frame')).toBeNull();
    expect(body.get('last_frame')).toBeNull();
    expect(body.getAll('reference_images')).toEqual([image]);
    expect(body.getAll('reference_videos')).toEqual([video]);
    expect(body.get('reference_image_sources')).toBe('["history"]');
    expect(body.get('reference_video_audio')).toBe('[true]');
    request.flush({});
  });

  it('quotes reference counts and durations without uploading files or sending a client price', () => {
    service.getQuote(10, [
      { id:'i',kind:'image',file:new File(['image'],'ref.png'),previewUrl:'',source:'upload',useAudio:false,width:512,height:768 },
      { id:'v',kind:'video',file:new File(['video'],'ref.mp4'),previewUrl:'',source:'upload',useAudio:true,width:1920,height:1080,duration:5.167 },
    ]).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/video/quote`);
    expect(request.request.headers.has('Authorization')).toBeFalse();
    expect(request.request.method).toBe('POST');
    const body = request.request.body as FormData;
    expect(body.get('duration_seconds')).toBe('10');
    expect(body.get('reference_image_count')).toBe('1');
    expect(body.get('reference_video_seconds')).toBe('[5.167]');
    expect(body.has('reference_videos')).toBeFalse();
    expect(body.has('credit_cost')).toBeFalse();
    request.flush({});
  });

  it('builds scoped media URLs with an encoded token', () => {
    expect(service.mediaUrl('job/id', 'a+b/c')).toBe(
      `${environment.apiBaseUrl}/video/jobs/job%2Fid/content?access_token=a%2Bb%2Fc`
    );
  });
  it('loads public video configuration without session headers', () => {
    service.getConfig().subscribe();
    const request = http.expectOne(environment.apiBaseUrl + '/video/config');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush({});
  });

});
