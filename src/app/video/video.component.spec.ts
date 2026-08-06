import { ChangeDetectorRef, NgZone } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';
import { AccountCtaService } from '../auth/account-cta.service';
import { AuthService } from '../auth/auth.service';
import { VideoGenerationService } from '../video-generation.service';
import { VideoComponent } from './video.component';

describe('VideoComponent', () => {
  let component: VideoComponent;
  let videoService: jasmine.SpyObj<VideoGenerationService>;
  let changeDetector: jasmine.SpyObj<ChangeDetectorRef>;

  beforeEach(() => {
    videoService = jasmine.createSpyObj<VideoGenerationService>('VideoGenerationService', ['listJobs']);
    changeDetector = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['detectChanges']);
    const authService = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn']);
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
});
