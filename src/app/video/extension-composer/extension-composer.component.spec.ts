import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { VideoJob, VideoExtensionConfig, VideoExtensionQuote, VideoReference } from 'src/_shared/video-generation.interface';
import { VideoGenerationService } from '../../video-generation.service';
import { of, Subject, throwError } from 'rxjs';
import { canExtendVideo, ExtensionComposerComponent } from './extension-composer.component';

describe('ExtensionComposerComponent', () => {
  let fixture: ComponentFixture<ExtensionComposerComponent>;
  let component: ExtensionComposerComponent;
  let service: jasmine.SpyObj<VideoGenerationService>;
  const policy: VideoExtensionConfig = { enabled: true, pricing_version: 'extend-04mp-v2',
    prices: { '5':110, '10':270, '15':420 }, durations:[5,10,15], added_seconds:{'5':119/24,'10':238/24,'15':357/24},
    min_source_seconds:39/24,max_source_seconds:60,max_source_bytes:50*1024*1024,accepted_source_types:['video/mp4'] };
  const quote = (duration=5, references=0): VideoExtensionQuote => ({ pricing_version:policy.pricing_version,duration_seconds:duration,
    base_cost:policy.prices[String(duration)],reference_cost:references > 1 ? 20 : 0,reference_image_count:references,
    credit_cost:policy.prices[String(duration)] + (references > 1 ? 20 : 0),added_frame_count:duration===5?119:238,
    added_duration_seconds:policy.added_seconds[String(duration)],context_frame_count:39 });
  const job = {
    id: 'completed-video', status: 'completed', media_ready: true, output_format: 'video',
    prompt: 'The character waves.', duration_seconds: 5, width: 768, height: 512,
  } as VideoJob;

  function mp4(name = 'scene.mp4'): File {
    return new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109])], name, { type: 'video/mp4' });
  }

  function loaded(duration = 5.167, key = component.source!.key): void {
    component.onPreviewLoaded({ target: { duration, videoWidth: 768, videoHeight: 512 } } as unknown as Event, key);
  }

  beforeEach(() => {
    service=jasmine.createSpyObj('VideoGenerationService',['getExtensionQuote','submitExtension','previewExtensionGif']);
    service.getExtensionQuote.and.callFake((duration, references)=>of(quote(duration, references)));
    TestBed.configureTestingModule({ imports: [ExtensionComposerComponent], providers:[{provide:VideoGenerationService,useValue:service}] });
    fixture = TestBed.createComponent(ExtensionComposerComponent);
    component = fixture.componentInstance;
    component.jobs = [job];
    spyOn(URL, 'createObjectURL').and.returnValue('blob:extension-test');
    spyOn(URL, 'revokeObjectURL');
    fixture.detectChanges();
  });

  it('offers only completed, retained video outputs', () => {
    for (const change of [
      { status: 'pending' }, { status: 'failed' }, { status: 'expired' },
      { media_ready: false }, { expires_at: '2020-01-01T00:00:00Z' },
    ]) {
      expect(canExtendVideo({ ...job, ...change } as VideoJob)).toBeFalse();
    }
    expect(canExtendVideo(job)).toBeTrue();
    component.jobs = [job, { ...job, id: 'gif', output_format: 'gif' }];
    component.setSourceTab('library');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.library-video').length).toBe(2);
  });

  it('selects a library video without copying the old prompt into the new action', () => {
    component.prompt = 'She walks away.';
    component.videoUrls = new Map([[job.id, '/retained-video.mp4']]);
    component.selectJob(job);
    expect(component.sourceUrl).toBe('/retained-video.mp4');
    expect(component.sourceTab).toBe('library');
    expect(component.source?.job?.prompt).toBe(job.prompt);
    expect(component.prompt).toBe('She walks away.');
    expect(component.combinedSeconds).toBeNull();
    loaded();
    component.addedSeconds = 10;
    expect(component.combinedSeconds).toBeCloseTo(15.167, 3);
  });

  it('uses decoded duration for the timeline and keeps extension submission unavailable', () => {
    component.selectJob(job);
    component.prompt = 'Continue walking.';
    loaded();
    fixture.detectChanges();
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.length-options button'));
    buttons.find(button => button.textContent?.trim() === '+10s')!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.extension-result').textContent).toContain('About 15.2s total');
    expect(fixture.nativeElement.querySelector('.extend-button').disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Price unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('70 credits');
  });

  it('preserves audio direction when sound is turned off and back on', async () => {
    component.audioPrompt = 'Continue the wind.';
    component.continueAudio = false;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#extensionAudioPrompt').disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Create the result without an audio track.');
    component.continueAudio = true;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.audioPrompt).toBe('Continue the wind.');
    expect(fixture.nativeElement.querySelector('#extensionAudioPrompt').disabled).toBeFalse();
  });

  it('keeps the continuation draft when switching sources', () => {
    component.prompt = 'New action';
    component.audioPrompt = 'New sound';
    component.addedSeconds = 10;
    component.selectJob(job);
    component.setSourceTab('upload');
    expect(component.source).toBeNull();
    expect([component.prompt, component.audioPrompt, component.addedSeconds]).toEqual(['New action', 'New sound', 10]);
  });

  it('previews an uploaded container and releases its object URL when replaced', async () => {
    const file = mp4();
    await component.addFiles([file]);
    expect(component.source?.file).toBe(file);
    expect(component.previewLoading).toBeTrue();
    loaded(17.5);
    expect(component.sourceReady).toBeTrue();
    expect(component.combinedSeconds).toBe(22.5);
    component.selectJob(job);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:extension-test');
  });

  it('rejects invalid, empty, oversized, or multiple uploads without losing a selected video', async () => {
    component.selectJob(job);
    const oversized = mp4();
    Object.defineProperty(oversized, 'size', { value: component.maxUploadBytes + 1 });
    for (const files of [[new File(['not a video'], 'fake.mp4')], [new File([], 'empty.mp4')], [oversized], [mp4(), mp4()]]) {
      await component.addFiles(files);
      expect(component.errorMessage).toBeTruthy();
      expect(component.source?.job?.id).toBe(job.id);
    }
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('ignores an upload header that finishes after another source was selected', async () => {
    const file = mp4();
    let finish!: (buffer: ArrayBuffer) => void;
    spyOn(file, 'slice').and.returnValue({ arrayBuffer: () => new Promise(resolve => finish = resolve) } as Blob);
    const pending = component.addFiles([file]);
    component.selectJob(job);
    finish(await mp4().arrayBuffer());
    await pending;
    expect(component.source?.job?.id).toBe(job.id);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('ignores stale preview events and shows a playback failure for the current source', () => {
    component.selectJob(job);
    const oldKey = component.source!.key;
    component.selectJob({ ...job, id: 'another-video' });
    loaded(99, oldKey);
    component.onPreviewError(oldKey);
    expect(component.source?.duration).toBeNull();
    expect(component.errorMessage).toBe('');
    component.onPreviewError(component.source!.key);
    expect(component.sourceReady).toBeFalse();
    expect(component.previewLoading).toBeFalse();
    expect(component.errorMessage).toContain('preview is unavailable');
    loaded();
    expect(component.sourceReady).toBeTrue();
    expect(component.errorMessage).toBe('');
  });

  it('re-enables the picker when an invalid upload replaces an unfinished read', async () => {
    const file = mp4();
    let finish!: (buffer: ArrayBuffer) => void;
    spyOn(file, 'slice').and.returnValue({ arrayBuffer: () => new Promise(resolve => finish = resolve) } as Blob);
    const pending = component.addFiles([file]);
    expect(component.readingFile).toBeTrue();
    await component.addFiles([new File([], 'empty.mp4')]);
    expect(component.readingFile).toBeFalse();
    finish(await mp4().arrayBuffer());
    await pending;
    expect(component.source).toBeNull();
    expect(component.errorMessage).toContain('nonempty video');
  });

  it('clears an expired source while retaining the prompt', () => {
    component.selectJob(job);
    component.prompt = 'Continue the scene.';
    component.jobs = [];
    component.ngOnChanges({ jobs: new SimpleChange([job], [], false) });
    expect(component.source).toBeNull();
    expect(component.prompt).toBe('Continue the scene.');
    expect(component.errorMessage).toContain('no longer available');
  });

  it('seeks to the context window when watching the ending', async () => {
    component.selectJob(job);
    loaded(5.167);
    const video = { duration: 5.167, currentTime: 0, play: jasmine.createSpy('play').and.resolveTo() };
    component.watchEnding(video as unknown as HTMLVideoElement);
    expect(video.currentTime).toBeCloseTo(3.542, 3);
    expect(video.play).toHaveBeenCalled();
  });

  it('releases uploaded media on destruction', async () => {
    await component.addFiles([mp4()]);
    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:extension-test');
    expect(component.source).toBeNull();
  });

  function enable(): void {
    fixture.componentRef.setInput('policy',policy);
    fixture.componentRef.setInput('active',true);
    fixture.componentRef.setInput('currentCredits',1000);
    fixture.detectChanges();
    component.selectJob(job);
    loaded();
    component.prompt='She waves.';
    fixture.detectChanges();
  }

  it('shows the server quote and submits its cost and version', () => {
    enable();
    const response={job:{...job,id:'new-extension',generation_mode:'extend' as const},credits_used:110,credits_remaining:890};
    service.submitExtension.and.returnValue(of(response));
    const received=jasmine.createSpy('submitted');component.submitted.subscribe(received);
    expect(component.canSubmit).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('110 credits');
    component.submit();
    expect(service.submitExtension).toHaveBeenCalledOnceWith(jasmine.objectContaining({sourceJobId:job.id,prompt:'She waves.',expectedCreditCost:110,pricingVersion:'extend-04mp-v2',continueAudio:true}));
    expect(received).toHaveBeenCalledOnceWith(response);
  });

  it('reuses the request ID after an unconfirmed network response', () => {
    enable();
    service.submitExtension.and.returnValues(throwError(()=>({status:0})),of({job,credits_used:110,credits_remaining:890}));
    component.submit();
    expect(component.submissionError).toContain('without being charged twice');
    expect(component.canSubmit).toBeTrue();
    component.submit();
    expect(service.submitExtension.calls.argsFor(0)[0].requestId).toBe(service.submitExtension.calls.argsFor(1)[0].requestId);
  });

  it('requires another click after a checked price change', () => {
    enable();
    service.submitExtension.and.returnValue(throwError(()=>({status:409,error:{detail:{code:'video_price_changed',quote:{...quote(),credit_cost:120,pricing_version:'extend-v2'},message:'Review 120 credits. No credits were charged.'}}})));
    component.submit();
    expect(service.submitExtension).toHaveBeenCalledTimes(1);
    expect(component.selectedCost).toBe(120);
    expect(component.submissionError).toContain('No credits were charged');
    expect(component.submitting).toBeFalse();
  });

  it('does not restart an in-flight quote on an unchanged configuration poll', () => {
    const pending=new Subject<VideoExtensionQuote>();
    service.getExtensionQuote.and.returnValue(pending);
    fixture.componentRef.setInput('policy',policy);fixture.componentRef.setInput('active',true);fixture.detectChanges();
    component.ngOnChanges({policy:new SimpleChange(policy,{...policy},false)});
    expect(service.getExtensionQuote).toHaveBeenCalledTimes(1);
    pending.next(quote());
    expect(component.selectedCost).toBe(110);
  });

  it('ignores older quotes after the added length changes', () => {
    const first=new Subject<VideoExtensionQuote>(),second=new Subject<VideoExtensionQuote>();
    service.getExtensionQuote.and.returnValues(first,second);
    fixture.componentRef.setInput('policy',policy);fixture.componentRef.setInput('active',true);fixture.detectChanges();
    component.selectLength(10);first.next(quote(5));
    expect(component.selectedCost).toBe(0);
    second.next(quote(10));
    expect(component.selectedCost).toBe(270);
  });

  it('blocks unavailable services and full queues, and requests credits before submission', () => {
    enable();
    component.policy={...policy,enabled:false};expect(component.canSubmit).toBeFalse();
    component.policy=policy;component.activeJobs=3;expect(component.canSubmit).toBeFalse();
    component.activeJobs=0;component.currentCredits=0;
    const credits=jasmine.createSpy('credits');component.creditsRequested.subscribe(credits);
    component.submit();expect(credits).toHaveBeenCalled();expect(service.submitExtension).not.toHaveBeenCalled();
  });

  it('rejects an overlong preview and excludes extended outputs beyond the source limit', () => {
    enable();loaded(61);
    expect(component.sourceReady).toBeFalse();expect(component.canSubmit).toBeFalse();
    expect(component.errorMessage).toContain('60 seconds');
    expect(canExtendVideo({...job,generation_mode:'extend',output_duration_seconds:65})).toBeFalse();
  });

  it('shows the short context guidance and an optional image-only picker', () => {
    enable();
    expect(fixture.nativeElement.querySelector('.context-notice').textContent).toContain('last ~ 1.5 seconds');
    expect(fixture.nativeElement.textContent).toContain('Reference images (optional)');
    expect(fixture.nativeElement.querySelector('.video-toggle')).toBeNull();
    expect(fixture.nativeElement.querySelector('.audio-option').textContent).toContain('Disable sound');
    expect(component.continueAudio).toBeTrue();
    loaded(1.2);
    expect(component.canSubmit).toBeFalse();
  });

  it('requotes image counts, submits images in order, and gives changed images a new retry key', () => {
    enable();
    const references = [1,2].map(id => ({id:String(id),kind:'image',file:new File(['image'+id],id+'.png')} as VideoReference));
    component.onReferencesChanged(references);
    expect(service.getExtensionQuote).toHaveBeenCalledWith(5,2);
    expect(component.selectedCost).toBe(130);
    service.submitExtension.and.returnValue(throwError(()=>({status:0})));
    component.submit();
    const first = service.submitExtension.calls.mostRecent().args[0];
    expect(first.referenceImages).toEqual(references.map(item=>item.file));
    component.onReferencesChanged([references[1],references[0]]);
    component.submit();
    expect(service.submitExtension.calls.mostRecent().args[0].requestId).not.toBe(first.requestId);
  });

  it('ignores stale reference quotes and blocks removed picture tags until reviewed', () => {
    enable();
    const pending = new Subject<VideoExtensionQuote>();
    service.getExtensionQuote.and.returnValue(pending);
    component.onReferencesChanged([{id:'one',kind:'image'} as VideoReference]);
    pending.next(quote(5,0));
    expect(component.selectedCost).toBe(0);
    pending.next(quote(5,1));
    expect(component.selectedCost).toBe(110);
    component.prompt='<Picture 1> meets <Picture 2>.';
    component.removedReference({kind:'image',index:1});
    expect(component.prompt).toBe('[removed image] meets <Picture 1>.');
    expect(component.canSubmit).toBeFalse();
  });

  it('uses the same Disable sound checkbox behavior as the other video modes', async () => {
    enable();
    await fixture.whenStable();fixture.detectChanges();
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('.audio-option input');
    expect(checkbox.checked).toBeFalse();
    component.audioPrompt='Soft footsteps.';
    checkbox.click();fixture.detectChanges();
    await fixture.whenStable();
    expect(component.continueAudio).toBeFalse();
    expect(fixture.nativeElement.querySelector('#extensionAudioPrompt').disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Create the result without an audio track.');
    checkbox.click();fixture.detectChanges();
    await fixture.whenStable();
    expect(component.continueAudio).toBeTrue();
    expect(component.audioPrompt).toBe('Soft footsteps.');
  });

  it('prepares an uploaded GIF for seekable preview and submits the original file', async () => {
    enable();
    const pending=new Subject<Blob>();service.previewExtensionGif.and.returnValue(pending);
    const gif=new File(['GIF89a test'],'scene.gif',{type:'image/gif'});
    await component.addFiles([gif]);
    expect(component.sourceUrl).toBe('');
    expect(component.readingFile).toBeTrue();expect(component.canSubmit).toBeFalse();
    pending.next(new Blob(['mp4'],{type:'video/mp4'}));
    expect(component.sourceUrl).toBe('blob:extension-test');
    loaded(2.25);
    service.submitExtension.and.returnValue(of({job,credits_used:110,credits_remaining:890}));
    component.submit();
    expect(service.submitExtension.calls.mostRecent().args[0].sourceVideo).toBe(gif);
    expect(component.combinedSeconds).toBeCloseTo(2.25+119/24,5);
  });

  it('prepares saved GIFs by owned job ID and ignores obsolete preview responses', () => {
    const pending=new Subject<Blob>();service.previewExtensionGif.and.returnValue(pending);
    component.videoUrls=new Map([['saved-gif','/animated.gif']]);
    const gif={...job,id:'saved-gif',output_format:'gif' as const};
    expect(canExtendVideo(gif)).toBeTrue();
    component.selectJob(gif);
    expect(service.previewExtensionGif).toHaveBeenCalledWith({jobId:'saved-gif'});
    expect(component.sourceUrl).toBe('');
    component.selectJob(job);
    pending.next(new Blob(['obsolete mp4']));
    expect(component.source?.job?.id).toBe(job.id);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows GIF validation errors and releases prepared preview URLs', async () => {
    service.previewExtensionGif.and.returnValue(throwError(()=>({error:{detail:'Choose an animated GIF with more than one frame.'}})));
    await component.addFiles([new File(['GIF89a test'],'still.gif')]);
    expect(component.errorMessage).toContain('more than one frame');
    expect(component.readingFile).toBeFalse();expect(component.previewFailed).toBeTrue();
    service.previewExtensionGif.and.returnValue(of(new Blob(['mp4'])));
    component.selectJob({...job,output_format:'gif'});
    component.clearSource();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:extension-test');
  });

  it('matches GIF output controls and forces the entire result silent', async () => {
    enable();await fixture.whenStable();fixture.detectChanges();
    component.audioPrompt='Keep this audio draft.';
    const gif: HTMLInputElement=fixture.nativeElement.querySelector('.gif-option input');
    gif.click();fixture.detectChanges();await fixture.whenStable();
    expect(component.outputAsGif).toBeTrue();expect(component.continueAudio).toBeFalse();
    const sound: HTMLInputElement=fixture.nativeElement.querySelector('.audio-option input');
    expect(sound.checked).toBeTrue();expect(sound.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('GIFs cannot contain audio');
    expect(fixture.nativeElement.querySelector('.extension-result').textContent).toContain('One combined looping GIF');
    service.submitExtension.and.returnValue(throwError(()=>({status:0})));
    component.submit();
    const first=service.submitExtension.calls.mostRecent().args[0];
    expect(first.outputFormat).toBe('gif');expect(first.continueAudio).toBeFalse();expect(first.audioPrompt).toBeUndefined();
    gif.click();fixture.detectChanges();await fixture.whenStable();
    expect(component.audioPrompt).toBe('Keep this audio draft.');expect(sound.disabled).toBeFalse();
    component.submit();
    const second=service.submitExtension.calls.mostRecent().args[0];
    expect(second.outputFormat).toBe('video');expect(second.requestId).not.toBe(first.requestId);
    expect(second.continueAudio).toBeFalse();
  });
});
