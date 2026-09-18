import { ChangeDetectorRef, NgZone } from '@angular/core';
import { fakeAsync, tick, TestBed } from '@angular/core/testing';
import { CharactersService } from '../characters/characters.service';
import { NEVER, of, Subject, throwError } from 'rxjs';
import { AccountCtaService } from '../auth/account-cta.service';
import { AuthService } from '../auth/auth.service';
import { VideoGenerationService } from '../video-generation.service';
import { VideoComponent } from './video.component';
import { VideoJob } from 'src/_shared/video-generation.interface';
import { provideRouter } from '@angular/router';

describe('VideoComponent', () => {
  let component: VideoComponent;
  let videoService: jasmine.SpyObj<VideoGenerationService>;
  let authService: jasmine.SpyObj<AuthService>;
  let changeDetector: jasmine.SpyObj<ChangeDetectorRef>;
  let accountCta: jasmine.SpyObj<AccountCtaService>;
  let zone: NgZone;

  function createPngFile(name = 'frame.png'): File {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new File([bytes], name, { type: 'image/png', lastModified: 1234 });
  }

  function createComponent(): VideoComponent {
    return TestBed.runInInjectionContext(() => new VideoComponent(videoService, authService, accountCta, zone, changeDetector));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: CharactersService, useValue: { takeVideoHandoff: () => null } }] });
    videoService = jasmine.createSpyObj<VideoGenerationService>('VideoGenerationService', ['listJobs', 'submitJob', 'cancelJob', 'getQuote']);
    changeDetector = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['detectChanges', 'markForCheck']);
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn', 'updateCredits']);
    accountCta = jasmine.createSpyObj<AccountCtaService>('AccountCtaService', ['requestLogin', 'requestCreditPurchase']);
    zone = { run: (update: () => void) => update() } as NgZone;

    component = createComponent();
  });

  it('preserves separate mode prompts and existing uploads when switching', () => {
    component.config = { generation_modes: ['fl2v', 'ref2v'] } as any;
    component.prompt = 'Frame prompt';
    component.audioPrompt = 'Wind';
    component.changeMode('ref2v');
    expect(component.prompt).toBe('');
    component.prompt = 'Reference prompt';
    component.changeMode('fl2v');
    expect(component.prompt).toBe('Frame prompt');
    expect(component.audioPrompt).toBe('Wind');
    component.changeMode('ref2v');
    expect(component.prompt).toBe('Reference prompt');
  });

  it('preserves the image draft through extension mode and blocks ordinary submission there', () => {
    component.prompt = 'Keep this image prompt.';
    component.audioPrompt = 'Wind';
    component.openExtension();
    expect(component.extensionMode).toBeTrue();
    expect(component.selectedCost).toBe(0);
    expect(component.canSubmit).toBeFalse();
    component.submit();
    expect(videoService.submitJob).not.toHaveBeenCalled();
    expect(accountCta.requestCreditPurchase).not.toHaveBeenCalled();
    component.changeMode('fl2v');
    expect(component.extensionMode).toBeFalse();
    expect(component.prompt).toBe('Keep this image prompt.');
    expect(component.audioPrompt).toBe('Wind');
  });

  it('cancels reference quotes while extending and requotes on return', () => {
    component.config = { generation_modes: ['fl2v', 'ref2v'] } as any;
    component.changeMode('ref2v');
    const pending = new Subject<any>();
    videoService.getQuote.and.returnValue(pending);
    component.onReferencesChanged([{ id: 'ref', kind: 'image' } as any]);
    expect(component.quoteLoading).toBeTrue();
    component.openExtension();
    pending.next({ credit_cost: 90 });
    component.refreshQuote();
    expect(component.referenceQuote).toBeNull();
    expect(videoService.getQuote).toHaveBeenCalledTimes(1);
    component.changeMode('ref2v');
    expect(videoService.getQuote).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
  });

  it('does not open extension mode for an unavailable video', () => {
    component.openExtension({ status: 'completed', media_ready: false } as VideoJob);
    expect(component.extensionMode).toBeFalse();
    component.openExtension({ status: 'completed', media_ready: true, output_format: 'gif', duration_seconds: 1 } as VideoJob);
    expect(component.extensionMode).toBeFalse();
  });

  it('keeps prompt references attached to their images when an earlier image is removed', () => {
    component.generationMode = 'ref2v';
    component.prompt = '<Picture 1> meets <Picture 3> near <Video 1>';
    component.removedReference({ kind: 'image', index: 2 });
    expect(component.prompt).toBe('<Picture 1> meets <Picture 2> near <Video 1>');
    expect(component.referencePromptNeedsReview).toBeFalse();
    component.removedReference({ kind: 'image', index: 1 });
    expect(component.prompt).toBe('[removed image] meets <Picture 1> near <Video 1>');
    expect(component.referencePromptNeedsReview).toBeTrue();
  });

  it('keeps removed-reference review tied to its draft across mode switches and edits', () => {
    component.config = { generation_modes: ['fl2v', 'ref2v'] } as any;
    component.changeMode('ref2v');
    component.prompt = '<Picture 1> waves';
    component.removedReference({ kind: 'image', index: 1 });
    component.changeMode('fl2v');
    component.prompt = 'An unrelated frame prompt';
    component.changeMode('ref2v');
    expect(component.referencePromptNeedsReview).toBeTrue();
    component.prompt = 'The remaining character waves';
    expect(component.referencePromptNeedsReview).toBeFalse();
  });

  it('updates the view after an uploaded frame finishes loading asynchronously', async () => {
    spyOn<any>(component, 'readImageDimensions').and.resolveTo({ width: 1200, height: 800 });
    spyOn(URL, 'createObjectURL').and.returnValue('blob:preview');
    const file = createPngFile();
    const event = { target: { files: [file] } } as unknown as Event;

    await component.onFileSelected(event, 'first');

    expect(component.firstFrame?.file).not.toBe(file);
    expect(component.firstFrame?.file.name).toBe(file.name);
    expect(component.firstFrame?.file.size).toBe(file.size);
    expect(component.firstFrame?.file.lastModified).toBe(file.lastModified);
    expect(component.aspectRatio).toBe('landscape');
    expect(changeDetector.detectChanges).toHaveBeenCalled();
  });

  it('updates the frame and closes the history picker in the same async view cycle', async () => {
    spyOn<any>(component, 'readImageDimensions').and.resolveTo({ width: 800, height: 1200 });
    spyOn(URL, 'createObjectURL').and.returnValue('blob:history-preview');
    component.pickerOpen = true;
    component.pickerTarget = 'last';
    const png = createPngFile('history.png');

    await component.onHistoryImageSelected({
      UUID: 'history-frame',
      width: 800,
      height: 1200,
      aspectRatio: 'portrait',
      blob: new Blob([await png.arrayBuffer()], { type: 'image/png' }),
    });

    expect(component.lastFrame?.source).toBe('history');
    expect(component.pickerOpen).toBeFalse();
    expect(changeDetector.detectChanges).toHaveBeenCalled();
  });

  it('rejects empty or mislabeled image files before decoding them', async () => {
    const dimensionSpy = spyOn<any>(component, 'readImageDimensions').and.resolveTo({ width: 1, height: 1 });

    await component.onFileSelected({
      target: { files: [new File([], 'empty.png', { type: 'image/png' })] },
    } as unknown as Event, 'first');

    expect(component.errorMessage).toContain('empty');
    expect(dimensionSpy).not.toHaveBeenCalled();

    await component.onFileSelected({
      target: { files: [new File(['not a PNG'], 'mislabeled.png', { type: 'image/png' })] },
    } as unknown as Event, 'first');

    expect(component.errorMessage).toContain('does not contain a readable');
    expect(dimensionSpy).not.toHaveBeenCalled();
  });

  it('detects the image type when a mobile picker omits the MIME type', async () => {
    const png = createPngFile();
    const file = new File([await png.arrayBuffer()], 'picker-frame', { type: '' });
    spyOn<any>(component, 'readImageDimensions').and.resolveTo({ width: 1, height: 1 });
    spyOn(URL, 'createObjectURL').and.returnValue('blob:generic-picker-preview');

    await component.onFileSelected({ target: { files: [file] } } as unknown as Event, 'first');

    expect(component.errorMessage).toBe('');
    expect(component.firstFrame?.file.type).toBe('image/png');
  });

  it('shows an access-specific error when a picker-backed file cannot be copied', async () => {
    const file = createPngFile();
    const warningSpy = spyOn(console, 'warn');
    spyOn(file, 'arrayBuffer').and.rejectWith(new Error('Provider grant expired'));

    await component.onFileSelected({ target: { files: [file] } } as unknown as Event, 'first');

    expect(component.firstFrame).toBeNull();
    expect(component.errorMessage).toContain('could not be accessed');
    expect(warningSpy).toHaveBeenCalled();
  });

  it('falls back to an HTML image decode when createImageBitmap rejects the file', async () => {
    const file = createPngFile();
    spyOn(window, 'createImageBitmap').and.rejectWith(new Error('Bitmap decoder unavailable'));

    const dimensions = await (component as any).readImageDimensions(file);

    expect(dimensions).toEqual({ width: 1, height: 1 });
  });

  it('ignores an image decode that finishes after the video route is destroyed', async () => {
    const file = createPngFile();
    const fileBytes = await file.arrayBuffer();
    spyOn(file, 'arrayBuffer').and.returnValue(Promise.resolve(fileBytes));
    let resolveDimensions!: (dimensions: { width: number; height: number }) => void;
    const dimensions = new Promise<{ width: number; height: number }>((resolve) => resolveDimensions = resolve);
    const dimensionSpy = spyOn<any>(component, 'readImageDimensions').and.returnValue(dimensions);

    const selection = component.onFileSelected({ target: { files: [file] } } as unknown as Event, 'first');
    await Promise.resolve();
    await Promise.resolve();
    expect(dimensionSpy).toHaveBeenCalled();

    component.ngOnDestroy();
    resolveDimensions({ width: 1, height: 1 });
    await selection;

    expect(component.firstFrame).toBeNull();
    expect(component.errorMessage).toBe('');
  });

  it('can decode the same real PNG after leaving and re-entering the video route', async () => {
    const file = createPngFile();

    await component.onFileSelected({ target: { files: [file] } } as unknown as Event, 'first');
    expect(component.firstFrame?.width).toBe(1);
    expect(component.firstFrame?.height).toBe(1);
    component.ngOnDestroy();

    const reenteredComponent = createComponent();
    await reenteredComponent.onFileSelected({ target: { files: [file] } } as unknown as Event, 'first');

    expect(reenteredComponent.errorMessage).toBe('');
    expect(reenteredComponent.firstFrame?.width).toBe(1);
    expect(reenteredComponent.firstFrame?.height).toBe(1);
    reenteredComponent.ngOnDestroy();
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

  it('keeps the full 8000-character user allowance when a camera command is selected', () => {
    component.cameraMotion = 'auto';
    expect(component.maxUserPromptLength).toBe(8000);

    component.prompt = 'a'.repeat(8000);
    component.cameraMotion = 'pedestal-down';

    expect(component.maxUserPromptLength).toBe(8000);
    expect(component.composedPrompt.length).toBeLessThanOrEqual(component.composedPromptMaxLength);
  });

  it('allows 4000 characters for audio direction', () => {
    expect(component.audioPromptMaxLength).toBe(4000);
  });

  it('uses only backend configuration for durations and prices', () => {
    expect(component.durations).toEqual([]);
    expect(component.selectedCost).toBe(0);

    component.config = {
      service: { feature_enabled: true, desired_state: 'available', effective_state: 'available', accepting_jobs: true, message: '', worker_status: 'online' },
      prices: { '5': 70, '15': 350 },
      aspects: { square: { width: 640, height: 640, comfy_value: 'square' }, landscape: { width: 768, height: 512, comfy_value: 'landscape' }, portrait: { width: 512, height: 768, comfy_value: 'portrait' } },
      durations: [5, 15], active_job_limit: 3, retention_hours: 24, max_frame_bytes: 1024, accepted_frame_types: ['image/png'],
    };
    component.durationSeconds = 15;

    expect(component.durations).toEqual([5, 15]);
    expect(component.selectedCost).toBe(350);
    component.selectDuration(5);
    expect(component.selectedCost).toBe(70);
  });

  function reference(id: string, kind: 'image' | 'video' = 'video', duration = 5.167): any {
    return { id, kind, duration, file: new File(['test'], id), source: 'upload', previewUrl: '', useAudio: false, width: 512, height: 768 };
  }

  describe('input video defaults', () => {
    beforeEach(() => {
      component.generationMode = 'ref2v';
      component.config = { durations: Array.from({ length: 16 }, (_, i) => i + 5) } as any;
      videoService.getQuote.and.returnValue(of(quote));
    });

    it('rounds up the first video duration, matches its aspect, and quotes the new length', () => {
      component.onReferencesChanged([reference('picture', 'image'), reference('source', 'video', 8.2)]);
      expect(component.durationSeconds).toBe(9);
      expect(component.aspectRatio).toBe('portrait');
      expect(component.matchSourceLength).toBeFalse();
      expect(videoService.getQuote).toHaveBeenCalledOnceWith(9, component.references);
    });

    for (const [sourceSeconds, expectedSeconds] of [[8, 8], [0.5, 5], [20.042, 20]]) {
      it(`uses a supported duration of ${expectedSeconds}s for a ${sourceSeconds}s video`, () => {
        component.onReferencesChanged([reference('source', 'video', sourceSeconds)]);
        expect(component.durationSeconds).toBe(expectedSeconds);
      });
    }

    it('rounds up to the next supported length when duration options have gaps', () => {
      component.config!.durations = [20, 5, 10];
      component.onReferencesChanged([reference('source', 'video', 6.2)]);
      expect(component.durationSeconds).toBe(10);
      expect(component.config!.durations).toEqual([20, 5, 10]);
    });

    for (const [width, height, aspect] of [[1920, 1080, 'landscape'], [1080, 1920, 'portrait'], [1080, 1080, 'square']] as const) {
      it(`selects ${aspect} for a ${width} by ${height} video`, () => {
        component.onReferencesChanged([{ ...reference('source'), width, height }]);
        expect(component.aspectRatio).toBe(aspect);
      });
    }

    it('uses the configured aspect dimensions when selecting the closest ratio', () => {
      component.config!.aspects = {
        square: { width: 640, height: 640, comfy_value: 'square' },
        landscape: { width: 1024, height: 512, comfy_value: 'landscape' },
        portrait: { width: 512, height: 1024, comfy_value: 'portrait' },
      };
      component.onReferencesChanged([{ ...reference('source'), width: 1300, height: 1000 }]);
      expect(component.aspectRatio).toBe('square');
    });

    it('preserves manual settings through audio changes and additional references', () => {
      const source = reference('source');
      const extra = { ...reference('extra', 'video', 18), width: 1920, height: 1080 };
      component.onReferencesChanged([source]);
      component.selectDuration(12);
      component.selectAspect('square');
      source.useAudio = true;
      component.onReferencesChanged([source, reference('picture', 'image'), extra]);
      component.onReferencesChanged([source, extra]);
      expect(component.durationSeconds).toBe(12);
      expect(component.aspectRatio).toBe('square');
      expect(videoService.getQuote.calls.mostRecent().args[0]).toBe(12);
    });

    it('updates defaults when the first video is replaced or removed', () => {
      const first = reference('first');
      const second = { ...reference('second', 'video', 12.4), width: 1920, height: 1080 };
      component.onReferencesChanged([first, second]);
      component.matchSourceLength = true;
      component.onReferencesChanged([second]);
      expect(component.durationSeconds).toBe(13);
      expect(component.aspectRatio).toBe('landscape');
      expect(component.matchSourceLength).toBeFalse();
      component.onReferencesChanged([]);
      component.onReferencesChanged([first]);
      expect(component.durationSeconds).toBe(6);
      expect(component.aspectRatio).toBe('portrait');
    });

    it('keeps the chosen output settings for image-only references', () => {
      component.selectDuration(12);
      component.selectAspect('landscape');
      component.onReferencesChanged([reference('picture', 'image')]);
      expect(component.durationSeconds).toBe(12);
      expect(component.aspectRatio).toBe('landscape');
    });

    it('submits the defaulted duration and aspect with the checked price', () => {
      authService.isLoggedIn.and.returnValue(true);
      Object.assign(component.config!, { generation_modes: ['fl2v', 'ref2v'], service: { accepting_jobs: true } });
      component.currentCredits = 1000;
      component.prompt = 'Continue the movement';
      component.onReferencesChanged([reference('source', 'video', 8.2)]);
      videoService.submitJob.and.returnValue(NEVER);
      component.submit();
      expect(videoService.submitJob).toHaveBeenCalledOnceWith(jasmine.objectContaining({
        durationSeconds: 9, aspectRatio: 'portrait', expectedCreditCost: quote.credit_cost,
        matchOriginalAudioLength: false,
      }));
    });
  });

  it('selects the audio video independently of image references and matches its length', () => {
    component.generationMode = 'ref2v';
    component.config = { durations: Array.from({length:16},(_,i)=>i+5) } as any;
    component.references = [reference('picture','image'), reference('first'), reference('second','video',16.35)];
    component.originalAudioReferenceId = 'second';
    component.disableSound = true; component.outputAsGif = true;
    videoService.getQuote.and.returnValue(of(quote));
    component.selectOriginalAudio();
    expect(component.originalAudioIndex).toBe(1);
    expect(component.keepingOriginalAudio).toBeTrue();
    expect(component.disableSound).toBeFalse(); expect(component.outputAsGif).toBeFalse();
    expect(component.referenceVideos.map(item=>item.useAudio)).toEqual([false,true]);
    component.matchOriginalAudioLength();
    expect(component.durationSeconds).toBe(16);
    expect(component.matchSourceLength).toBeTrue();
  });

  it('shows the matched frame duration and returns to manual length on slider input', () => {
    component.generationMode = 'ref2v';
    component.config = { durations: Array.from({length:16},(_,i)=>i+5) } as any;
    component.references = [reference('short','video',5.81)];
    component.originalAudioReferenceId = 'short';
    videoService.getQuote.and.returnValue(of(quote));
    component.matchOriginalAudioLength();
    expect(component.durationSeconds).toBe(6);
    expect(component.selectedDurationSeconds).toBe(5.875);
    component.onDurationInput({target:{value:'1'}} as unknown as Event);
    expect(component.matchSourceLength).toBeFalse();
    expect(component.selectedDurationSeconds).toBe(6);
    component.references[0].duration = 20.042;
    component.matchOriginalAudioLength();
    expect(component.durationSeconds).toBe(20);
    expect(component.selectedDurationSeconds).toBe(20.042);
  });

  it('retains a removed soundtrack choice so submission cannot silently switch to generated audio', () => {
    component.generationMode = 'ref2v';
    component.originalAudioReferenceId = 'removed';
    videoService.getQuote.and.returnValue(of(quote));
    component.onReferencesChanged([reference('other')]);
    expect(component.keepingOriginalAudio).toBeTrue();
    expect(component.originalAudioIndex).toBe(-1);
    expect(component.canSubmit).toBeFalse();
  });

  it('clears original audio when the user explicitly requests silent or GIF output', () => {
    component.originalAudioReferenceId = 'video'; component.disableSound = true;
    component.onSoundOptionChanged(); expect(component.originalAudioReferenceId).toBeNull();
    component.originalAudioReferenceId = 'video'; component.outputAsGif = true;
    component.onGifOptionChanged(); expect(component.originalAudioReferenceId).toBeNull();
  });

  it('maps slider positions to the durations supplied by the server', () => {
    component.config = { durations: [5, 15, 20], prices: { '5': 70, '15': 350, '20': 500 } } as any;
    component.onDurationInput({ target: { value: '2' } } as unknown as Event);
    expect(component.durationSeconds).toBe(20);
    expect(component.durationIndex).toBe(2);
    expect(component.durationProgress).toBe(100);
    expect(component.selectedCost).toBe(500);
    component.onDurationInput({ target: { value: '0' } } as unknown as Event);
    expect(component.durationSeconds).toBe(5);
    expect(component.durationProgress).toBe(0);
    component.onDurationInput({ target: { value: '9' } } as unknown as Event);
    expect(component.durationSeconds).toBe(5);
  });

  it('invalidates the old reference price immediately and quotes only after slider movement pauses', fakeAsync(() => {
    component.config = { durations: [5, 15, 20] } as any;
    component.generationMode = 'ref2v';
    videoService.getQuote.and.returnValue(of(quote));
    component.onReferencesChanged([reference('image', 'image')]);
    expect(component.selectedPriceAvailable).toBeTrue();
    videoService.getQuote.calls.reset();
    component.onDurationInput({ target: { value: '1' } } as unknown as Event);
    expect(component.selectedPriceAvailable).toBeFalse();
    expect(component.quoteLoading).toBeTrue();
    tick(200);
    component.onDurationInput({ target: { value: '2' } } as unknown as Event);
    tick(249);
    expect(videoService.getQuote).not.toHaveBeenCalled();
    tick(1);
    expect(videoService.getQuote).toHaveBeenCalledOnceWith(20, component.references);
    component.ngOnDestroy();
  }));

  const quote = { pricing_version: 'ref2v-04mp-v2', credit_cost: 200, base_cost: 70, reference_cost: 130, effective_video_seconds: [5.167] };

  it('blocks a stale quote while duration or references change and ignores older responses', () => {
    component.generationMode = 'ref2v';
    const first = new Subject<any>();
    const second = new Subject<any>();
    videoService.getQuote.and.returnValues(first, second);
    component.onReferencesChanged([reference('a')]);
    expect(component.quoteLoading).toBeTrue();
    expect(component.selectedPriceAvailable).toBeFalse();
    component.selectDuration(10);
    first.next(quote);
    expect(component.selectedPriceAvailable).toBeFalse();
    second.next({ ...quote, credit_cost: 390, base_cost: 210, reference_cost: 180 });
    expect(component.selectedCost).toBe(390);
    expect(component.quoteLoading).toBeFalse();
    component.references = [reference('different')];
    expect(component.selectedPriceAvailable).toBeFalse();
    component.ngOnDestroy();
  });

  it('uses the FL2V base after a mode switch and rechecks retained references', () => {
    component.config = { prices: { '5': 70 }, generation_modes: ['fl2v','ref2v'] } as any;
    component.generationMode = 'ref2v';
    videoService.getQuote.and.returnValue(of(quote));
    component.onReferencesChanged([reference('a')]);
    expect(component.selectedCost).toBe(200);
    component.changeMode('fl2v');
    expect(component.selectedCost).toBe(70);
    component.changeMode('ref2v');
    expect(component.selectedCost).toBe(200);
    expect(videoService.getQuote).toHaveBeenCalledTimes(2);
  });

  it('keeps generation unavailable after a quote timeout and permits retry', fakeAsync(() => {
    component.generationMode = 'ref2v';
    videoService.getQuote.and.returnValues(NEVER, of(quote));
    component.onReferencesChanged([reference('a')]);
    tick(15001);
    expect(component.quoteLoading).toBeFalse();
    expect(component.selectedPriceAvailable).toBeFalse();
    expect(component.quoteError).toContain('try again');
    component.refreshQuote();
    expect(component.selectedCost).toBe(200);
    expect(component.quoteError).toBe('');
  }));

  it('sends the displayed price and shows a checked price change without resubmitting', () => {
    authService.isLoggedIn.and.returnValue(true);
    component.config = { prices: { '5': 70 }, generation_modes: ['fl2v','ref2v'], service: { accepting_jobs: true } } as any;
    component.generationMode = 'ref2v';
    component.currentCredits = 1000;
    component.prompt = 'Motion test';
    videoService.getQuote.and.returnValue(of(quote));
    component.onReferencesChanged([reference('a')]);
    videoService.submitJob.and.returnValue(throwError(() => ({ status:409, error:{detail:{code:'video_price_changed',message:'Review 210 credits. No credits were charged.',quote:{...quote,credit_cost:210,reference_cost:140}}}})));
    component.submit();
    expect(videoService.submitJob).toHaveBeenCalledOnceWith(jasmine.objectContaining({ expectedCreditCost:200,pricingVersion:'ref2v-04mp-v2' }));
    expect(component.selectedCost).toBe(210);
    expect(component.submitting).toBeFalse();
    expect(component.errorMessage).toContain('No credits were charged');
    expect(authService.updateCredits).not.toHaveBeenCalled();
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

  it('automatically disables sound when GIF output is selected', () => {
    component.disableSound = false;
    component.outputAsGif = true;

    component.onGifOptionChanged();

    expect(component.disableSound).toBeTrue();
  });

  it('submits GIF output as silent even when an audio direction is retained', () => {
    const job = {
      id: 'job-gif', status: 'pending', created_at: '', updated_at: '', prompt: 'A gentle wave',
      duration_seconds: 5, aspect_ratio: 'square', width: 640, height: 640, seed: 1,
      progress: 0, credit_cost: 100, refunded: false, has_last_frame: false, media_ready: false,
      disable_sound: true, output_format: 'gif',
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
    component.outputAsGif = true;
    component.onGifOptionChanged();

    component.submit();

    expect(videoService.submitJob).toHaveBeenCalledWith(jasmine.objectContaining({
      audioPrompt: 'Soft wind',
      disableSound: true,
      outputFormat: 'gif',
    }));
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

describe('VideoComponent length slider rendering', () => {
  it('renders the returned price after a debounced slider request without another user action', async () => {
    const response = new Subject<any>();
    const service = jasmine.createSpyObj('VideoGenerationService', ['getQuote']);
    service.getQuote.and.returnValue(response);
    await TestBed.configureTestingModule({
      imports: [VideoComponent],
      providers: [provideRouter([]),
        { provide: CharactersService, useValue: { takeVideoHandoff: () => null } },
        { provide: VideoGenerationService, useValue: service },
        { provide: AuthService, useValue: { isLoggedIn: () => true } },
        { provide: AccountCtaService, useValue: {} },
      ],
    }).compileComponents();
    spyOn(VideoComponent.prototype, 'ngOnInit').and.stub();
    const fixture = TestBed.createComponent(VideoComponent);
    const component = fixture.componentInstance;
    component.configLoading = false;
    component.config = {
      durations: Array.from({ length: 16 }, (_, index) => index + 5), prices: { '5': 70, '20': 520 },
      generation_modes: ['fl2v', 'ref2v'],
      service: { accepting_jobs: true, effective_state: 'available' },
    } as any;
    component.generationMode = 'ref2v';
    component.references = [{ id: 'image', kind: 'image', file: new File(['image'], 'image.png'),
      previewUrl: '', source: 'history', width: 512, height: 768, useAudio: false }];
    fixture.detectChanges();
    const slider = fixture.nativeElement.querySelector('#videoLength') as HTMLInputElement;
    slider.value = '15';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(service.getQuote).toHaveBeenCalledOnceWith(20, component.references);
    response.next({ credit_cost: 520, base_cost: 520, reference_cost: 0, pricing_version: 'test', effective_video_seconds: [] });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.duration-value').textContent).toContain('20');
    expect(slider.getAttribute('aria-valuetext')).toBe('20 seconds');
    expect(fixture.nativeElement.querySelector('.price-summary').textContent).toContain('520 credits');
    expect(fixture.nativeElement.querySelector('.price-summary').textContent).not.toContain('Checking price');
    fixture.destroy();
  });
});
