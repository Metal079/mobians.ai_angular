import { signal } from '@angular/core';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { BehaviorSubject, NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { SwPush } from '@angular/service-worker';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { AuthService } from 'src/app/auth/auth.service';
import { BlobMigrationService } from 'src/app/blob-migration.service';
import { GenerationLockService } from 'src/app/generation-lock.service';
import { NotificationService } from 'src/app/notification.service';
import { SharedService } from 'src/app/shared.service';
import { DynamicPromptLibraryResponse, StableDiffusionService } from 'src/app/stable-diffusion.service';
import { DynamicPromptLibraryStateService } from 'src/app/dynamic-prompt-library-state.service';
import { HistoryDiagnosticsService } from 'src/app/history-diagnostics.service';

import { OptionsComponent } from './options.component';
import { RegionalLoraCatalogService } from './regional-editor/regional-lora-catalog.service';
import { IMAGE_EDIT_MODEL, ImageEditorService } from 'src/app/image-editor/image-editor.service';

const seedPreferenceKey = 'mobians:seed-preference:v2';
const negativePromptKey = 'mobians:negative-prompt:v2';

const testModelSettings = [
  {
    model_id: 'sonicDiffusionV4',
    display_name: 'SonicDiffusionV4',
    base_model: 'SD 1.5',
    default_cfg: 7,
    credit_cost: 10,
    lora_credit_cost: 2,
    supports_sdxl_resolution: false,
    supports_regional_prompting: false,
    supports_upscale: true,
    is_active: true,
    is_default: false,
    display_order: 10,
  },
  {
    model_id: 'autismMix',
    display_name: 'autismMix',
    base_model: 'Pony',
    default_cfg: 4,
    credit_cost: 15,
    lora_credit_cost: 5,
    supports_sdxl_resolution: true,
    supports_regional_prompting: true,
    supports_upscale: false,
    is_active: true,
    is_default: false,
    display_order: 20,
  },
  {
    model_id: 'novaMobianXL_v20',
    display_name: 'novaMobianXL_v20',
    base_model: 'Illustrious',
    default_cfg: 4,
    credit_cost: 15,
    lora_credit_cost: 5,
    supports_sdxl_resolution: true,
    supports_regional_prompting: true,
    supports_upscale: true,
    is_active: true,
    is_default: true,
    display_order: 40,
  },
  {
    model_id: 'Anima-baseV1',
    display_name: 'Anima-baseV1',
    base_model: 'Anima',
    default_cfg: 4,
    credit_cost: 20,
    lora_credit_cost: 5,
    supports_sdxl_resolution: true,
    supports_regional_prompting: true,
    supports_upscale: true,
    is_active: true,
    is_default: false,
    display_order: 50,
  },
];

const dynamicPromptLibraryResponse: DynamicPromptLibraryResponse = {
  wildcard_set: 'mobians-v1',
  categories: [
    {
      id: 'mobian/characters',
      label: 'Characters',
      token: '_mobian/characters_',
      description: 'Character ideas',
      examples: ['Sonic'],
    },
    {
      id: 'mobian/poses',
      label: 'Poses',
      token: '_mobian/poses_',
      description: 'Pose ideas',
      examples: ['heroic pose'],
    },
    {
      id: 'sonicfan/mood-ideas',
      label: 'Mood Ideas',
      token: '_sonicfan/mood-ideas_',
      description: 'Custom mood ideas',
      examples: ['confident smile'],
    },
  ],
  starter_templates: [],
  syntax_examples: [],
  defaults: {
    mode: 'random',
    preview_count: 4,
    max_generations: 32,
  },
};

class StableDiffusionServiceStub {
  getGenerationModels() {
    return of({ default_model: 'novaMobianXL_v20', models: testModelSettings });
  }
  getDynamicPromptLibrary() {
    return of(dynamicPromptLibraryResponse);
  }

  getLoras() {
    return of([]);
  }

  getLoraPreferences() {
    return of([]);
  }

  getJobStatus() {
    return NEVER;
  }
}

class SharedServiceStub {
  images: any[] = [];
  setImages(images: any[]) { this.images = images; }
  getImagesValue() { return this.images; }
  setDownloadSlots(_slots: any) {}
  disableInstructions() {}
  user = { user_id: 'owner-a', token: 'token-a' };
  getUserDataValue() { return this.user; }
  getPrompt() { return of(''); }
  referenceImage = new BehaviorSubject<any>(null);
  getReferenceImage() { return this.referenceImage.asObservable(); }
  setGenerationRequest() {}
  setPrompt() {}
  setReferenceImage() {}
}
class MessageServiceStub {
  add() {}
}
class NotificationServiceStub {
  userId?: string;
  enabled = signal(false);
  subscribeToNotifications() {}
  setEnabled(on: boolean) { this.enabled.set(on); return Promise.resolve(on); }
  jobsOn() { return false; }
}
class SwPushStub {}
class DialogServiceStub {}
class BlobMigrationServiceStub {
  progress$ = of(null);
}
class GenerationLockServiceStub {
  release() {}
  isLockedByOther() { return false; }
  tryAcquire() { return true; }
}
class AuthServiceStub {
  credits$ = of(null);
  isLoggedIn() {
    return false;
  }
}
describe('OptionsComponent', () => {
  let component: OptionsComponent;
  let fixture: ComponentFixture<OptionsComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [OptionsComponent],
      providers: [
        { provide: HistoryDiagnosticsService, useValue: { report: jasmine.createSpy('report') } },
        { provide: ImageEditorService, useValue: { available: signal(true), pending: signal(false), open: jasmine.createSpy('openEditor') } },
        { provide: CharactersService, useValue: { activeCharacter: signal(null), recordLoaded: jasmine.createSpy('recordLoaded'), recordEvent: jasmine.createSpy('recordEvent'), recordUnlinked: jasmine.createSpy('recordUnlinked'), takeImageHandoff: () => null, imageHandoffReady: new Subject<void>(), clearActiveCharacter: jasmine.createSpy('clearActiveCharacter').and.callFake(function(this: any) { this.activeCharacter.set(null); }) } },
        { provide: StableDiffusionService, useClass: StableDiffusionServiceStub },
        { provide: SharedService, useClass: SharedServiceStub },
        { provide: MessageService, useClass: MessageServiceStub },
        { provide: NotificationService, useClass: NotificationServiceStub },
        { provide: SwPush, useClass: SwPushStub },
        { provide: DialogService, useClass: DialogServiceStub },
        { provide: BlobMigrationService, useClass: BlobMigrationServiceStub },
        { provide: GenerationLockService, useClass: GenerationLockServiceStub },
        { provide: AuthService, useClass: AuthServiceStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(OptionsComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(OptionsComponent);
    component = fixture.componentInstance;
    (component as any).setModelSettings(testModelSettings, 'novaMobianXL_v20');
    component.modelsLoading = false;
    TestBed.inject(DynamicPromptLibraryStateService).library.set(dynamicPromptLibraryResponse);
  });

  afterEach(() => {
    localStorage.clear();
    document.body.classList.remove('theme-navy', 'theme-606', 'theme-eggman', 'dark-input-fields');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  const kromaModelSettings = {
    ...testModelSettings[2], model_id: 'Kroma-Krea2', display_name: 'Kroma Krea 2',
    base_model: 'Krea 2', default_cfg: 1, credit_cost: 40, lora_credit_cost: 5,
    is_default: false, supported_operations: ['txt2img', 'img2img', 'inpainting', 'upscale', 'txt2img_upscale'], output_count: 4,
    supports_negative_prompt: false, supports_dynamic_prompting: true, fixed_cfg: 1,
    supports_regional_prompting: true, supports_upscale: true,
    default_steps: 8, max_loras: 3,
  };

  function selectKroma() {
    (component as any).setModelSettings([...testModelSettings, kromaModelSettings]);
    component.changeModel('Kroma-Krea2');
  }

  it('preserves Kroma feature controls and prices the complete four-image batch with LoRAs', () => {
    selectKroma();
    component.generationRequest.loras = [{ id: 1 }, { id: 2 }] as any;
    component.updateCreditCost();
    expect(component.creditCost).toBe(50);
    const request = (component as any).applyModelRequestCapabilities({
      ...component.generationRequest, width: 512, height: 768,
      steps: 20, guidance_scale: 7, batch_size: 8, negative_prompt: 'old settings',
      dynamic_prompting: { enabled: true }, strength: 0.7,
    });
    expect([request.width, request.height, request.steps, request.guidance_scale, request.batch_size])
      .toEqual([512, 768, 8, 1, 4]);
    expect(request.negative_prompt).toBe('');
    expect(request.dynamic_prompting.enabled).toBeTrue();
    expect(request.strength).toBe(0.7);
    expect(component.upscaleCreditCost).toBe(150);
    expect(component.hiresCreditCost).toBe(200);
  });

  it('allows Kroma reference images and exposes the normal feature controls', () => {
    selectKroma();
    component.enableGenerationButton = true;
    component.hasPendingJob = false;
    component.referenceImage = 'data:image/png;base64,test' as any;
    expect(component.canGenerate).toBeTrue();
    expect(component.selectedModelSettings?.supports_regional_prompting).toBeTrue();
    expect(component.selectedModelSettings?.supports_upscale).toBeTrue();
    expect(component.selectedModelSettings?.fixed_cfg).toBe(1);
    component.referenceImage = undefined;
    component.changeModel('novaMobianXL_v20');
    expect(component.isTextOnlyModel).toBeFalse();
    expect(component.generationRequest.guidance_scale).toBe(4);
  });

  it('does not automatically or manually retry saves when local history is unsupported', async () => {
    spyOnProperty(component, 'localHistorySupported', 'get').and.returnValue(false);
    const download = spyOn<any>(component, 'downloadJobImages').and.resolveTo();
    (component as any).savePendingJob('unsupported-browser', { prompt: 'kept prompt' });
    (component as any).beginCompletedJobRecovery('unsupported-browser');
    (component as any).showHistoryRecovery('unsupported-browser');
    (component as any).onRecoveryOpportunity();
    await component.retryHistorySave();
    expect(download).not.toHaveBeenCalled();
    expect(component.historyRecoveryPending).toBeTrue();
    expect((component as any).getPendingJob().job_id).toBe('unsupported-browser');
    spyOn(window, 'confirm').and.returnValue(true);
    component.stopHistoryRecovery();
    expect(component.historyRecoveryPending).toBeFalse();
    expect((component as any).getPendingJob()).toBeNull();
  });

  it('exports prompts and generation settings without credentials or image binaries', async () => {
    const originalShared = (component as any).sharedService;
    (component as any).sharedService = { getImagesValue: () => [{ UUID: 'preview', prompt: 'kept prompt', negativePrompt: 'negative', seed: 42,
      model: 'fixture', blob: new Blob(['private binary']), url: 'blob:private', authToken: 'private token',
      loras: [{ name: 'LoRA', version_id: 2, strength: .7, authToken: 'private token' }] }] };
    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:fixture-download');
    spyOn(HTMLAnchorElement.prototype, 'click');
    component.downloadGeneratedPrompts();
    const text = await (create.calls.first().args[0] as Blob).text();
    expect(text).toContain('kept prompt');
    expect(text).toContain('42');
    expect(text).not.toContain('private');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    (component as any).sharedService = originalShared;
  });

  it('excludes editing models without replacing the generator prompt, model, or LoRAs', () => {
    const settings = [...testModelSettings, { ...testModelSettings[0], model_id: IMAGE_EDIT_MODEL, base_model: 'FLUX.2 klein 4B', is_default: false }];
    (component as any).setModelSettings(settings, 'novaMobianXL_v20');
    component.generationRequest.prompt = 'Original generator prompt';
    component.generationRequest.model = 'novaMobianXL_v20';
    component.generationRequest.loras = [{ name: 'Selected LoRA', version: '1', strength: .8 }];
    localStorage.setItem('model', 'novaMobianXL_v20');
    const before = JSON.stringify(component.generationRequest);
    expect(JSON.stringify(component.generationRequest)).toBe(before);
    expect(component.modelSettings.some(model => model.model_id === IMAGE_EDIT_MODEL)).toBeFalse();
  });

  for (const fallback of [false, true]) {
    it('keeps ' + (fallback ? 'fallback' : 'individual') + ' download previews readable after leaving the image tab', async () => {
      const shared = new SharedService();
      (component as any).sharedService = shared;
      const original = new Blob(['completed image'], { type: 'image/png' });
      const sd = TestBed.inject(StableDiffusionService) as any;
      sd.getJobImage = () => of(original);
      sd.getJob = () => of({ status: 'completed', result: Array(4).fill('fixture') });
      (TestBed.inject(BlobMigrationService) as any).base64ToBlob = () => original;

      try {
        await (component as any)[fallback ? 'downloadJobImagesFallback' : 'downloadJobImages']('fixture');
        expect(shared.getImagesValue().length).toBe(4);
        fixture.destroy();

        for (const image of shared.getImagesValue()) {
          expect((await (await fetch(image.url!)).blob()).size).toBe(original.size);
        }
      } finally {
        shared.ngOnDestroy();
      }
    });

    for (const lossy of [false, true]) {
      it('preserves the returned image format after ' + (fallback ? 'fallback' : 'individual') + ' downloads with WebP ' + lossy, async () => {
        const original = new Blob(['image'], { type: lossy ? 'image/webp' : 'image/png' });
        const sd = TestBed.inject(StableDiffusionService) as any;
        sd.getJobImage = jasmine.createSpy().and.returnValue(of(original));
        sd.getJob = jasmine.createSpy().and.returnValue(of({ status: 'completed', result: Array(4).fill('fixture') }));
        const migration = TestBed.inject(BlobMigrationService) as any;
        migration.base64ToBlob = () => original;
        migration.convertToWebP = jasmine.createSpy().and.resolveTo(new Blob(['compressed'], { type: 'image/webp' }));
        const shared = TestBed.inject(SharedService) as any;
        shared.disableInstructions = () => {};
        spyOn(shared, 'setImages').and.callThrough();
        const ingest = jasmine.createSpy().and.resolveTo(undefined);
        (component as any).historyPanel = { ingestGeneratedImages: ingest };
        component.generationRequest.lossy_images = lossy;

        await (component as any)[fallback ? 'downloadJobImagesFallback' : 'downloadJobImages']('fixture');

        const images = shared.setImages.calls.mostRecent().args[0];
        expect(images.length).toBe(4);
        expect(ingest).toHaveBeenCalledTimes(4);
        expect(ingest.calls.allArgs().flatMap((args: any[]) => args[0]).map((image: any) => image.UUID).sort())
          .toEqual(images.map((image: any) => image.UUID).sort());
        for (const image of images) {
          expect(image.blob).toBe(original);
          expect((await (await fetch(image.url)).blob()).type).toBe(original.type);
        }
        expect(migration.convertToWebP).not.toHaveBeenCalled();
      });
    }
  }

  it('shows out-of-order arrivals in stable slots and stores each image once', fakeAsync(() => {
    const shared = new SharedService();
    (component as any).sharedService = shared;
    const responses = Array.from({ length: 4 }, () => new Subject<Blob>());
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.getJobImage = jasmine.createSpy().and.callFake((_job: string, index: number) => responses[index]);
    const ingest = jasmine.createSpy().and.resolveTo(true);
    (component as any).historyPanel = { ingestGeneratedImages: ingest };
    component.enableGenerationButton = false;
    component.hasPendingJob = true;
    let slots: any = null;
    const subscription = shared.getDownloadSlots().subscribe(value => { slots = value; });
    const pending = (component as any).downloadJobImages('fixture');
    expect(sd.getJobImage.calls.allArgs().map((args: any[]) => args[1])).toEqual([0, 1]);
    responses[1].next(new Blob(['second'], { type: 'image/png' })); responses[1].complete();
    flushMicrotasks();
    expect(slots[0]).toBeNull();
    const firstVisible = slots[1];
    expect(shared.getImagesValue().length).toBe(1);
    expect(component.enableGenerationButton).toBeFalse();
    expect(sd.getJobImage.calls.mostRecent().args[1]).toBe(2);
    responses[0].next(new Blob(['first'], { type: 'image/png' })); responses[0].complete();
    flushMicrotasks();
    responses[2].next(new Blob(['third'], { type: 'image/png' })); responses[2].complete();
    responses[3].next(new Blob(['fourth'], { type: 'image/png' })); responses[3].complete();
    let finished = false; pending.then(() => { finished = true; });
    flushMicrotasks();
    expect(finished).toBeTrue();
    expect(slots).toBeNull();
    expect(shared.getImagesValue()[1].UUID).toBe(firstVisible.UUID);
    expect(shared.getImagesValue()[1].url).toBe(firstVisible.url);
    expect(ingest).toHaveBeenCalledTimes(4);
    expect(new Set(ingest.calls.allArgs().map((args: any[]) => args[0][0].UUID)).size).toBe(4);
    expect(component.enableGenerationButton).toBeTrue();
    subscription.unsubscribe(); shared.ngOnDestroy();
  }));

  it('reuses image identities after a resumed download or full-result fallback', async () => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    const shared = TestBed.inject(SharedService) as any;
    const blob = new Blob(['image'], { type: 'image/png' });
    sd.getJobImage = jasmine.createSpy().and.returnValue(of(blob));
    sd.getJob = jasmine.createSpy().and.returnValue(of({ status: 'completed', result: Array(4).fill('fixture') }));
    (TestBed.inject(BlobMigrationService) as any).base64ToBlob = () => blob;
    (component as any).historyPanel = { ingestGeneratedImages: jasmine.createSpy().and.resolveTo(true) };
    await (component as any).downloadJobImages('same-job');
    const first = shared.getImagesValue().map((image: MobiansImage) => image.UUID);
    await (component as any).downloadJobImages('same-job');
    expect(shared.getImagesValue().map((image: MobiansImage) => image.UUID)).toEqual(first);
    await (component as any).downloadJobImagesFallback('same-job');
    expect(shared.getImagesValue().map((image: MobiansImage) => image.UUID)).toEqual(first);
  });

  it('does not ingest an already saved image again when a pending job resumes', async () => {
    const ingest = jasmine.createSpy().and.resolveTo(true);
    (component as any).historyPanel = { ingestGeneratedImages: ingest };
    (component as any).savePendingJob('resumed-job');
    const image = { UUID: 'same-image' };
    await (component as any).ingestDeliveredImages('resumed-job', [image]);
    await (component as any).ingestDeliveredImages('resumed-job', [image]);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect((component as any).getPendingJob().savedGeneratedImages).toEqual(['same-image']);
    (component as any).removePendingJob();
  });

  it('retries only unsaved history images after a partial fallback save', async () => {
    const ingest = jasmine.createSpy().and.returnValues(Promise.resolve(true), Promise.resolve(false), Promise.resolve(true));
    (component as any).historyPanel = { ingestGeneratedImages: ingest };
    (component as any).savePendingJob('partial-history');
    const images = [{ UUID: 'saved' }, { UUID: 'retry' }];
    await (component as any).ingestDeliveredImages('partial-history', images);
    await (component as any).ingestDeliveredImages('partial-history', images);
    expect(ingest.calls.allArgs().map((args: any[]) => args[0][0].UUID)).toEqual(['saved', 'retry', 'retry']);
    expect((component as any).getPendingJob().savedGeneratedImages).toEqual(['saved', 'retry']);
    (component as any).removePendingJob();
  });

  for (const fallback of [false, true]) {
    it('keeps recovery until ' + (fallback ? 'fallback' : 'individual') + ' saves actually commit', fakeAsync(() => {
      const sd = TestBed.inject(StableDiffusionService) as any;
      const blob = new Blob(['completed image'], { type: 'image/png' });
      sd.getJobImage = () => of(blob);
      sd.getJob = () => of({ status: 'completed', result: Array(4).fill('fixture') });
      (TestBed.inject(BlobMigrationService) as any).base64ToBlob = () => blob;
      let commit!: () => void;
      const committed = new Promise<boolean>(resolve => commit = () => resolve(true));
      (component as any).historyPanel = { ingestGeneratedImages: () => committed };
      (component as any).savePendingJob('slow-commit', { prompt: 'preserved prompt' });

      let finished = false;
      (component as any)[fallback ? 'downloadJobImagesFallback' : 'downloadJobImages']('slow-commit')
        .then(() => finished = true);
      flushMicrotasks();
      expect(component.images.length).toBe(4);
      expect(finished).toBeFalse();
      expect(component.canGenerate).toBeFalse();
      expect((component as any).getPendingJob()).toEqual(jasmine.objectContaining({
        job_id: 'slow-commit', phase: 'saving', request: { prompt: 'preserved prompt' },
      }));

      commit(); flushMicrotasks();
      expect(finished).toBeTrue();
      expect((component as any).getPendingJob()).toBeNull();
      expect(component.hasPendingJob).toBeFalse();
      expect(component.enableGenerationButton).toBeTrue();
    }));
  }

  it('retains failed saves and retries only unsaved previews without downloading again', async () => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.getJobImage = jasmine.createSpy().and.returnValue(of(new Blob(['image'], { type: 'image/png' })));
    sd.submitJob = jasmine.createSpy();
    const ingest = jasmine.createSpy().and.callFake(async (images: MobiansImage[]) =>
      images[0].UUID !== (component as any).generatedImageId('quota-job', 2));
    (component as any).historyPanel = { ingestGeneratedImages: ingest };
    (component as any).savePendingJob('quota-job', { prompt: 'keep this prompt' });

    await (component as any).downloadJobImages('quota-job');
    const before = component.images.map(image => image.UUID);
    expect(component.images.length).toBe(4);
    expect(component.historyRecoveryPending).toBeTrue();
    expect(component.historyRecoveryUnsavedCount).toBe(1);
    expect((component as any).getPendingJob().savedGeneratedImages.length).toBe(3);
    await component.submitJob();
    expect(sd.submitJob).not.toHaveBeenCalled();

    ingest.and.resolveTo(true);
    await component.retryHistorySave();
    expect(sd.getJobImage).toHaveBeenCalledTimes(4);
    expect(ingest).toHaveBeenCalledTimes(5);
    expect(component.images.map(image => image.UUID)).toEqual(before);
    expect(component.historyRecoveryPending).toBeFalse();
    expect((component as any).getPendingJob()).toBeNull();
  });

  it('preserves partial downloads and retries the missing image with its original identity', async () => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    const image = new Blob(['image'], { type: 'image/png' });
    sd.getJobImage = jasmine.createSpy().and.callFake((_id: string, index: number) =>
      index === 3 ? throwError(() => ({ status: 404 })) : of(image));
    sd.getJob = () => throwError(() => ({ status: 404 }));
    const ingest = jasmine.createSpy().and.resolveTo(true);
    (component as any).historyPanel = { ingestGeneratedImages: ingest };
    (component as any).savePendingJob('partial-download');
    await (component as any).downloadJobImages('partial-download');
    expect(component.historyRecoveryPending).toBeTrue();
    expect(component.images.length).toBe(3);
    expect((component as any).getPendingJob().savedGeneratedImages.length).toBe(3);

    sd.getJobImage.and.returnValue(of(image));
    await component.retryHistorySave();
    expect(sd.getJobImage.calls.allArgs().map((args: any[]) => args[1])).toEqual([0, 1, 2, 3, 3]);
    expect(ingest).toHaveBeenCalledTimes(4);
    expect(component.images[3].UUID).toBe((component as any).generatedImageId('partial-download', 3));
    expect(component.historyRecoveryPending).toBeFalse();
  });

  for (const batchSize of [4, undefined]) {
    it(`downloads and saves all four upscale results with batch_size ${batchSize}`, async () => {
      const sd = TestBed.inject(StableDiffusionService) as any;
      sd.getJobImage = jasmine.createSpy().and.returnValue(of(new Blob(['image'], { type: 'image/png' })));
      const ingest = jasmine.createSpy().and.resolveTo(true);
      (component as any).historyPanel = { ingestGeneratedImages: ingest };
      (component as any).savePendingJob('four-upscales', { job_type: 'upscale', batch_size: batchSize });

      await (component as any).downloadJobImages('four-upscales');

      expect(sd.getJobImage.calls.allArgs()).toEqual([0, 1, 2, 3].map(index => ['four-upscales', index]));
      const expectedIds = [0, 1, 2, 3].map(index => (component as any).generatedImageId('four-upscales', index));
      expect(component.images.map(image => image.UUID)).toEqual(expectedIds);
      expect(ingest.calls.allArgs().map((args: any[]) => args[0][0].UUID)).toEqual(expectedIds);
      expect(component.hasPendingJob).toBeFalse();
      expect((component as any).getPendingJob()).toBeNull();
    });
  }

  it('uses the full result count when an older pending job returns fewer images', async () => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    const blob = new Blob(['image'], { type: 'image/png' });
    sd.getJobImage = (_id: string, index: number) => index === 0 ? of(blob) : throwError(() => ({ status: 404 }));
    sd.getJob = () => of({ status: 'completed', result: ['single'] });
    (TestBed.inject(BlobMigrationService) as any).base64ToBlob = () => blob;
    const ingest = jasmine.createSpy().and.resolveTo(true);
    (component as any).historyPanel = { ingestGeneratedImages: ingest };
    (component as any).savePendingJob('older-upscale');
    await (component as any).downloadJobImages('older-upscale');
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(component.hasPendingJob).toBeFalse();
    expect((component as any).getPendingJob()).toBeNull();
  });

  it('retains an unsuccessful fallback save and retries it without losing the pending request', async () => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.getJob = () => of({ status: 'completed', result: ['first', 'second'] });
    sd.getJobImage = jasmine.createSpy();
    (TestBed.inject(BlobMigrationService) as any).base64ToBlob = () => new Blob(['image'], { type: 'image/png' });
    const ingest = jasmine.createSpy().and.returnValues(Promise.resolve(true), Promise.resolve(false));
    (component as any).historyPanel = { ingestGeneratedImages: ingest };
    (component as any).savePendingJob('fallback-save', { prompt: 'original', guidance_scale: 7, seed: 100 });
    component.generationRequest.prompt = 'next prompt';
    await (component as any).downloadJobImagesFallback('fallback-save');
    expect(component.historyRecoveryPending).toBeTrue();
    expect(component.historyRecoveryUnsavedCount).toBe(1);
    expect((component as any).getPendingJob().request.prompt).toBe('original');

    ingest.and.resolveTo(true);
    await component.retryHistorySave();
    expect(sd.getJobImage).not.toHaveBeenCalled();
    expect(ingest).toHaveBeenCalledTimes(3);
    expect(ingest.calls.mostRecent().args[0][0]).toEqual(jasmine.objectContaining({ prompt: 'original', cfg: 7, seed: 100 }));
    expect((component as any).getPendingJob()).toBeNull();
  });

  it('keeps current-tab recovery progress if localStorage stops accepting updates', async () => {
    (component as any).savePendingJob('storage-quota', { prompt: 'keep this' });
    const setItem = spyOn(Storage.prototype, 'setItem').and.callFake(() => { throw new DOMException('full', 'QuotaExceededError'); });
    (component as any).beginCompletedJobRecovery('storage-quota');
    (component as any).historyPanel = { ingestGeneratedImages: () => Promise.resolve(true) };
    await (component as any).ingestDeliveredImages('storage-quota', [{ UUID: 'saved-in-db' }]);
    expect((component as any).getPendingJob()).toEqual(jasmine.objectContaining({
      job_id: 'storage-quota', phase: 'saving', savedGeneratedImages: ['saved-in-db'],
    }));
    expect(TestBed.inject(HistoryDiagnosticsService).report).toHaveBeenCalledWith('generation.save', jasmine.any(DOMException), { savedCount: 1 });
    setItem.and.callThrough();
  });

  it('restores incomplete saves after reload and never expires them as an unfinished generation', fakeAsync(() => {
    const savedImage = (component as any).generatedImageId('reload-save', 0);
    localStorage.setItem('mobians:pending-job', JSON.stringify({
      job_id: 'reload-save', phase: 'saving', expectedImageCount: 4,
      createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      savedGeneratedImages: [savedImage], request: { prompt: 'original prompt', seed: 123 },
    }));
    const sd = TestBed.inject(StableDiffusionService) as any;
    const poll = spyOn(component, 'getJob');
    sd.getJobImage = jasmine.createSpy().and.returnValue(of(new Blob(['image'], { type: 'image/png' })));
    const ingest = jasmine.createSpy().and.resolveTo(true);
    (component as any).historyPanel = { ingestGeneratedImages: ingest };

    component.ngOnInit();
    flushMicrotasks();
    expect(component.historyRecoveryPending).toBeTrue();
    expect((component as any).getPendingJob()?.job_id).toBe('reload-save');
    tick(0); flushMicrotasks();
    expect(poll).not.toHaveBeenCalled();
    expect(sd.getJobImage.calls.allArgs().map((args: any[]) => args[1])).toEqual([1, 2, 3]);
    expect(ingest).toHaveBeenCalledTimes(3);
    expect(ingest.calls.first().args[0][0]).toEqual(jasmine.objectContaining({ prompt: 'original prompt', seed: 123 }));
    expect(component.historyRecoveryPending).toBeFalse();
    expect((component as any).getPendingJob()).toBeNull();
  }));

  it('keeps background deliveries for saving when the mobile page becomes visible', fakeAsync(() => {
    const visibility = spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden');
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.getJobImage = jasmine.createSpy().and.returnValue(of(new Blob(['image'], { type: 'image/png' })));
    const ingest = jasmine.createSpy().and.resolveTo(true);
    (component as any).historyPanel = { ingestGeneratedImages: ingest };
    (component as any).savePendingJob('background-delivery');
    void (component as any).downloadJobImages('background-delivery');
    flushMicrotasks();
    expect(ingest).not.toHaveBeenCalled();
    expect(component.images.length).toBe(4);
    expect(component.historyRecoveryPending).toBeTrue();
    expect(component.historyRecoveryInProgress).toBeFalse();
    expect((component as any).getPendingJob()?.phase).toBe('saving');

    void component.retryHistorySave();
    flushMicrotasks();
    expect(ingest).not.toHaveBeenCalled();
    visibility.and.returnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    flushMicrotasks();
    expect(ingest).toHaveBeenCalledTimes(4);
    expect(sd.getJobImage).toHaveBeenCalledTimes(4); // Reuse the retained previews.
    expect(component.historyRecoveryInProgress).toBeFalse();
    expect(component.historyRecoveryPending).toBeFalse();
    expect(component.canGenerate).toBeTrue();
    expect((component as any).getPendingJob()).toBeNull();
  }));

  it('resumes deferred saves if visibility returns before the last download finishes', fakeAsync(() => {
    const visibility = spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden');
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    const sd = TestBed.inject(StableDiffusionService) as any;
    const lastImage = new Subject<Blob>();
    const blob = new Blob(['image'], { type: 'image/png' });
    sd.getJobImage = jasmine.createSpy().and.callFake((_job: string, index: number) => index === 0 ? of(blob) : lastImage);
    const ingest = jasmine.createSpy().and.resolveTo(true);
    (component as any).historyPanel = { ingestGeneratedImages: ingest };
    (component as any).savePendingJob('resume-during-download', { batch_size: 2 });
    void (component as any).downloadJobImages('resume-during-download');
    flushMicrotasks();
    expect(ingest).not.toHaveBeenCalled();
    expect((component as any).deliveryInProgress).toBeTrue();

    visibility.and.returnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    lastImage.next(blob);
    lastImage.complete();
    flushMicrotasks();
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(sd.getJobImage).toHaveBeenCalledTimes(2);
    expect(component.historyRecoveryPending).toBeFalse();
    expect(component.historyRecoveryInProgress).toBeFalse();
    expect(component.canGenerate).toBeTrue();
    expect((component as any).getPendingJob()).toBeNull();
  }));

  it('bounds recovery on repeated visibility and online events and stops listening on destruction', fakeAsync(() => {
    (component as any).savePendingJob('bounded-retry');
    (component as any).beginCompletedJobRecovery('bounded-retry');
    (component as any).showHistoryRecovery('bounded-retry');
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    const retry = spyOn(component, 'retryHistorySave').and.resolveTo();
    for (let attempt = 0; attempt < 5; attempt++) {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      tick(30000);
    }
    expect(retry).toHaveBeenCalledTimes(2);
    fixture.destroy();
    window.dispatchEvent(new Event('online'));
    expect(retry).toHaveBeenCalledTimes(2);
  }));

  it('preserves previews unless the user explicitly stops recovery', async () => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.getJobImage = () => of(new Blob(['image'], { type: 'image/png' }));
    sd.cancelJob = jasmine.createSpy();
    (component as any).historyPanel = { ingestGeneratedImages: () => Promise.reject(new DOMException('full', 'QuotaExceededError')) };
    (component as any).savePendingJob('stop-recovery');
    await (component as any).downloadJobImages('stop-recovery');
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    component.stopHistoryRecovery();
    expect(component.historyRecoveryPending).toBeTrue();
    expect((component as any).getPendingJob()).not.toBeNull();
    confirm.and.returnValue(true);
    component.stopHistoryRecovery();
    expect(component.historyRecoveryPending).toBeFalse();
    expect((component as any).getPendingJob()).toBeNull();
    expect(component.images.length).toBe(4);
    expect(sd.cancelJob).not.toHaveBeenCalled();
    expect(TestBed.inject(HistoryDiagnosticsService).report).toHaveBeenCalledWith('generation.save', jasmine.any(DOMException), { imageCount: 1 });
  });

  it('latches early cancel until the submit response arrives and ignores rapid repeated clicks', fakeAsync(() => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    const submitted = new Subject<any>();
    const cancelled = new Subject<any>();
    sd.submitJob = jasmine.createSpy().and.returnValue(submitted);
    sd.cancelJob = jasmine.createSpy().and.returnValue(cancelled);
    const poll = spyOn(sd, 'getJobStatus');
    const release = spyOn(TestBed.inject(GenerationLockService), 'release');

    component.submitJob();
    for (let i = 0; i < 10; i++) {
      component.cancelPendingJob();
      component.submitJob();
    }
    expect(sd.submitJob).toHaveBeenCalledTimes(1);
    expect(component.cancelInProgress).toBeTrue();
    expect(component.canGenerate).toBeFalse();
    expect(release).not.toHaveBeenCalled();
    expect(sd.cancelJob).not.toHaveBeenCalled();

    submitted.next({ job_id: 'late-job' });
    submitted.complete();
    component.cancelPendingJob();
    expect(sd.cancelJob).toHaveBeenCalledOnceWith('late-job');
    tick(5000);
    expect(poll).not.toHaveBeenCalled();
    cancelled.next({ credits_refunded: 0 });
    cancelled.complete();
    expect(component.canGenerate).toBeTrue();
    expect(component.hasPendingJob).toBeFalse();
    expect(localStorage.getItem('mobians:pending-job')).toBeNull();
    tick(5000);
    expect(poll).not.toHaveBeenCalled();
  }));

  it('cancels during asynchronous image preparation without submitting a job', fakeAsync(() => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.submitJob = jasmine.createSpy();
    const migration = TestBed.inject(BlobMigrationService) as any;
    let resolveImage!: (value: string) => void;
    migration.blobToBase64 = () => new Promise<string>(resolve => resolveImage = resolve);
    component.referenceImage = { blob: new Blob(['image']) } as any;
    component.submitJob();
    component.cancelPendingJob();
    component.submitJob();
    resolveImage('image-data');
    flushMicrotasks();
    expect(sd.submitJob).not.toHaveBeenCalled();
    expect(component.canGenerate).toBeTrue();
  }));

  it('replaces the old poller and aborts status requests as soon as cancel is clicked', fakeAsync(() => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    const aborted = jasmine.createSpy();
    const poll = spyOn(sd, 'getJobStatus').and.callFake(() => new Observable(() => aborted));
    const cancelled = new Subject<any>();
    sd.cancelJob = jasmine.createSpy().and.returnValue(cancelled);
    component.getJob('old'); tick(0);
    component.getJob('current'); tick(0);
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(component.jobID).toBe('current');
    tick(5000);
    expect(poll).toHaveBeenCalledTimes(2); // Slow requests never accumulate queued ticks.
    component.cancelPendingJob();
    expect(aborted).toHaveBeenCalledTimes(2);
    tick(5000);
    expect(poll).toHaveBeenCalledTimes(2);
    cancelled.next({}); cancelled.complete();
    expect(component.canGenerate).toBeTrue();
  }));

  it('keeps the existing job active when the server refuses cancellation', fakeAsync(() => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.cancelJob = jasmine.createSpy().and.returnValue(throwError(() => ({ status: 409 })));
    sd.submitJob = jasmine.createSpy();
    const poll = spyOn(sd, 'getJobStatus').and.returnValue(NEVER);
    component.getJob('running'); tick(0);
    component.cancelPendingJob(); tick(0);
    component.submitJob();
    expect(component.canGenerate).toBeFalse();
    expect(component.hasPendingJob).toBeTrue();
    expect(component.cancelInProgress).toBeFalse();
    expect(sd.submitJob).not.toHaveBeenCalled();
    expect(poll).toHaveBeenCalledTimes(2);
    fixture.destroy();
  }));

  for (const fallback of [false, true]) {
    it('aborts an active ' + (fallback ? 'fallback' : 'individual') + ' download on cancel', fakeAsync(() => {
      const sd = TestBed.inject(StableDiffusionService) as any;
      const aborted = jasmine.createSpy();
      sd[fallback ? 'getJob' : 'getJobImage'] = jasmine.createSpy().and.returnValue(new Observable(() => aborted));
      sd.cancelJob = jasmine.createSpy().and.returnValue(of({}));
      component.jobID = 'download';
      const publish = spyOn(component.imagesChange, 'emit');
      (component as any)[fallback ? 'downloadJobImagesFallback' : 'downloadJobImages']('download');
      component.cancelPendingJob();
      flushMicrotasks(); tick(60000);
      expect(aborted).toHaveBeenCalledTimes(fallback ? 1 : 2);
      expect(sd[fallback ? 'getJob' : 'getJobImage']).toHaveBeenCalledTimes(fallback ? 1 : 2);
      expect(publish).not.toHaveBeenCalled();
      expect(component.canGenerate).toBeTrue();
    }));

    it('stops ' + (fallback ? 'fallback' : 'individual') + ' download retries after cancel and a new generation', fakeAsync(() => {
      const sd = TestBed.inject(StableDiffusionService) as any;
      sd[fallback ? 'getJob' : 'getJobImage'] = jasmine.createSpy().and.returnValue(throwError(() => ({ status: 503 })));
      sd.cancelJob = jasmine.createSpy().and.returnValue(of({}));
      sd.submitJob = jasmine.createSpy().and.returnValue(NEVER);
      component.jobID = 'download';
      (component as any)[fallback ? 'downloadJobImagesFallback' : 'downloadJobImages']('download');
      flushMicrotasks();
      component.cancelPendingJob();
      component.submitJob();
      flushMicrotasks(); tick(60000);
      expect(sd[fallback ? 'getJob' : 'getJobImage']).toHaveBeenCalledTimes(fallback ? 1 : 2);
      expect(component.hasPendingJob).toBeTrue();
    }));
  }

  it('stops stale status callbacks when another tab moves the job into save recovery', fakeAsync(() => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    const status = new Subject<any>();
    const poll = spyOn(sd, 'getJobStatus').and.returnValue(status);
    (component as any).savePendingJob('other-tab-saving');
    component.getJob('other-tab-saving'); tick(0);
    expect(status.observers.length).toBe(1);
    const recovery = JSON.stringify({ job_id: 'other-tab-saving', phase: 'saving', expectedImageCount: 4 });
    localStorage.setItem('mobians:pending-job', recovery);
    window.dispatchEvent(new StorageEvent('storage', { key: 'mobians:pending-job', newValue: recovery }));
    expect(status.observers.length).toBe(0);

    // A stale response can arrive after the other tab started saving. Neither
    // its error handler nor unsubscribe finalizer may clear the shared marker.
    status.error({ status: 404 });
    tick(5000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect((component as any).getPendingJob()).toEqual(jasmine.objectContaining({ job_id: 'other-tab-saving', phase: 'saving' }));
    expect(component.historyRecoveryPending).toBeTrue();
    expect(component.canGenerate).toBeFalse();
  }));

  it('stops polling when another tab removes the pending job', fakeAsync(() => {
    const sd = TestBed.inject(StableDiffusionService) as any;
    const aborted = jasmine.createSpy();
    spyOn(sd, 'getJobStatus').and.returnValue(new Observable(() => aborted));
    component.getJob('other-tab'); tick(0);
    window.dispatchEvent(new StorageEvent('storage', { key: 'mobians:pending-job', newValue: null }));
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(component.canGenerate).toBeTrue();
    tick(5000);
    expect(sd.getJobStatus).toHaveBeenCalledTimes(1);
  }));

  it('submits the selected look with unchanged fixture credit estimates and snapshots its account', async () => {
    const characters = TestBed.inject(CharactersService);
    characters.activeCharacter.set({ id: 'amy', imageId: 'beach-look', name: 'Amy Rose' });
    const sd = TestBed.inject(StableDiffusionService) as any;
    const reply = new Subject<any>(); sd.submitJob = jasmine.createSpy().and.returnValue(reply);
    spyOn(component, 'getJob');
    component.queueType = 'free';
    component.generationRequest.model = 'novaMobianXL_v20';
    component.generationRequest.prompt = 'pink quills, bikini'; component.generationRequest.loras = [];
    component.updateCreditCost(); expect(component.creditCost).toBe(15);
    await component.submitJob();
    expect(sd.submitJob.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ character_id: 'amy', character_look_id: 'beach-look', prompt: 'pink quills, bikini', queue_type: 'free' }));
    const shared = TestBed.inject(SharedService) as any;
    shared.user = { user_id: 'owner-b', token: 'token-b' };
    characters.activeCharacter.set(null);
    reply.next({ job_id: 'fixture-only', character_id: 'amy', character_look_id: 'beach-look' }); reply.complete();
    const pending = JSON.parse(localStorage.getItem('mobians:pending-job')!);
    expect(pending.request.character_owner).toBe('owner-a');
    expect((component as any).getCharacterAttributionSnapshot()).toEqual({});
    shared.user = { user_id: 'owner-a', token: 'token-a' };
    expect((component as any).getCharacterAttributionSnapshot()).toEqual({ characterId: 'amy', characterLookId: 'beach-look' });
  });

  it('keeps attribution during ordinary prompt edits and removes stale request IDs after unlink', async () => {
    const characters = TestBed.inject(CharactersService);
    characters.activeCharacter.set({ id: 'amy', imageId: 'spy-look', name: 'Amy' });
    component.onPromptInputChange('Amy in a forest');
    expect(characters.activeCharacter()?.imageId).toBe('spy-look');
    component.generationRequest.character_id = 'stale-character'; component.generationRequest.character_look_id = 'stale-look';
    component.dismissCharacter();
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.submitJob = jasmine.createSpy().and.returnValue(NEVER);
    component.queueType = 'free'; await component.submitJob();
    expect(sd.submitJob.calls.mostRecent().args[0].character_id).toBeUndefined();
    expect(sd.submitJob.calls.mostRecent().args[0].character_look_id).toBeUndefined();
  });

  it('loads a character setup without stale masks, regions, dynamic prompts, or a fixed seed', () => {
    const characters = TestBed.inject(CharactersService);
    spyOn(characters, 'takeImageHandoff').and.returnValue({ name: 'Ash', recipe: {
      label: 'Forest', model: 'novaMobianXL_v20', appearance: 'blue fox', scene: 'forest',
      negative_prompt: 'blurry', width: 512, height: 768, guidance_scale: 5,
      loras: [{ id: 7, name: 'Fox', strength: .7 }],
    } });
    component.generationRequest.mask_image = 'old mask';
    component.generationRequest.seed = 123;
    component.generationRequest.regional_prompting = { enabled: true, regions: [] };
    component.generationRequest.dynamic_prompting = { enabled: true, template: '_old_' };
    spyOn(component, 'saveSettings');

    (component as any).applyCharacterHandoff();

    expect(component.generationRequest.prompt).toBe('blue fox, forest');
    expect(component.generationRequest.model).toBe('novaMobianXL_v20');
    expect(component.generationRequest.loras[0].strength).toBe(.7);
    expect(component.generationRequest.guidance_scale).toBe(5);
    expect(component.generationRequest.mask_image).toBeUndefined();
    expect(component.generationRequest.seed).toBeUndefined();
    expect(component.generationRequest.regional_prompting.enabled).toBeFalse();
    expect(component.generationRequest.dynamic_prompting.enabled).toBeFalse();
    expect(component.generationRequest.job_type).toBe('txt2img');
    expect(component.loadedCharacterName).toBe('Ash');
  });

  it('loads prompt-only characters using the current model, LoRAs, guidance and image size', () => {
    spyOn(TestBed.inject(CharactersService), 'takeImageHandoff').and.returnValue({ name: 'Ash', currentModel: 'current-model', currentLoras: [{ id: 8, name: 'Current style', strength: .6 }], recipe: {
      label: 'Prompts', model: '', appearance: 'blue fox', scene: 'forest', negative_prompt: 'blurry',
      width: 512, height: 768, guidance_scale: 4, loras: [],
    } });
    component.generationRequest.model = 'current-model';
    component.generationRequest.loras = []; // The route was recreated with default selections.
    component.generationRequest.guidance_scale = 7;
    component.generationRequest.width = 768; component.generationRequest.height = 512;
    spyOn(component, 'saveSettings');
    (component as any).applyCharacterHandoff();
    expect(component.generationRequest.model).toBe('current-model');
    expect(component.generationRequest.loras[0].id).toBe(8);
    expect(component.generationRequest.loras[0].strength).toBe(.6);
    expect(component.generationRequest.guidance_scale).toBe(7);
    expect(component.generationRequest.width).toBe(768); expect(component.generationRequest.height).toBe(512);
    expect(component.generationRequest.prompt).toBe('blue fox, forest');
    expect(component.generationRequest.negative_prompt).toBe('blurry');
  });

  for (const lookModel of ['', 'Kroma-Krea2']) {
    it(`keeps the current negative prompt when a look ${lookModel ? `saved on ${lookModel}` : 'loaded as prompts only'} has none`, () => {
      (component as any).setModelSettings([...testModelSettings, kromaModelSettings]);
      spyOn(TestBed.inject(CharactersService), 'takeImageHandoff').and.returnValue({ name: 'Ash', recipe: {
        label: 'Kroma look', model: lookModel, appearance: 'blue fox', scene: '', negative_prompt: '',
        width: 512, height: 512, guidance_scale: 1, loras: [],
      } });
      component.generationRequest.negative_prompt = 'Keep my negative prompt';
      const previous = structuredClone(component.generationRequest);
      spyOn(component, 'saveSettings');

      (component as any).applyCharacterHandoff();

      expect(component.generationRequest.prompt).toBe('blue fox');
      expect(component.generationRequest.model).toBe(lookModel || previous.model);
      expect(component.generationRequest.negative_prompt).toBe('Keep my negative prompt');
      component.undoCharacter();
      expect(component.generationRequest).toEqual(previous);
    });
  }

  it('keeps the current request if a job started before the character handoff is consumed', () => {
    spyOn(TestBed.inject(CharactersService), 'takeImageHandoff').and.returnValue({ name: 'Ash', recipe: {} as any });
    const request = component.generationRequest;
    component.hasPendingJob = true;
    (component as any).applyCharacterHandoff();
    expect(component.generationRequest).toBe(request);
    expect(component.loadedCharacterName).toBe('');
  });

  it('loads a character selected while the generator route is already open without submitting', () => {
    const characters = TestBed.inject(CharactersService);
    const handoff = spyOn(characters, 'takeImageHandoff').and.returnValue(null);
    spyOn(component, 'saveSettings');
    const submit = spyOn(component, 'submitJob');
    (component as any).connectCharacterHandoffs();
    handoff.and.returnValue({ name: 'Ash', recipe: {
      label: 'Default', model: '', appearance: 'blue fox', scene: 'forest', negative_prompt: '',
      width: 512, height: 512, guidance_scale: 4, loras: [],
    } });

    characters.imageHandoffReady.next();

    expect(component.generationRequest.prompt).toBe('blue fox, forest');
    expect(component.loadedCharacterName).toBe('Ash');
    expect(submit).not.toHaveBeenCalled();
    fixture.destroy();
    handoff.calls.reset();
    characters.imageHandoffReady.next();
    expect(handoff).not.toHaveBeenCalled();
  });

  it('undoes a character selection back to the previous prompt, model, LoRAs and image dimensions', () => {
    const characters = TestBed.inject(CharactersService);
    spyOn(characters, 'takeImageHandoff').and.returnValue({ name: 'Ash', recipe: {
      label: 'Default', model: 'Anima-baseV1', appearance: 'blue fox', scene: 'forest', negative_prompt: '',
      width: 512, height: 512, guidance_scale: 4, loras: [],
    } });
    component.generationRequest.prompt = 'My original idea';
    component.generationRequest.loras = [{ id: 5, name: 'Original style', strength: .5 }];
    component.generationRequest.seed = 123;
    component.generationRequest.width = 768;
    const previous = structuredClone(component.generationRequest);
    spyOn(component, 'saveSettings');

    (component as any).applyCharacterHandoff();
    expect(component.canUndoCharacter).toBeTrue();
    component.undoCharacter();

    expect(component.generationRequest).toEqual(previous);
    expect(component.loadedCharacterName).toBe('');
    expect(component.canUndoCharacter).toBeFalse();
    expect(characters.clearActiveCharacter).toHaveBeenCalled();
  });

  it('does not undo while a new image job is running', () => {
    (component as any).characterUndo = { request: { prompt: 'previous' } };
    const current = component.generationRequest;
    localStorage.setItem('mobians:pending-job', 'running');
    component.undoCharacter();
    expect(component.generationRequest).toBe(current);
  });

  it('keeps the request when another tab starts a job during character loading', () => {
    const characters = TestBed.inject(CharactersService);
    spyOn(characters, 'takeImageHandoff').and.returnValue({ name: 'Ash', recipe: {} as any });
    localStorage.setItem('mobians:pending-job', 'another-tab-job');
    const current = component.generationRequest;
    (component as any).applyCharacterHandoff();
    expect(component.generationRequest).toBe(current);
    expect(component.loadedCharacterName).toBe('');
    expect(characters.clearActiveCharacter).toHaveBeenCalled();
  });

  describe('adding a character to the prompt', () => {
    let characters: any;
    let messages: jasmine.Spy;
    const look = (overrides: any = {}) => ({
      label: 'Default', model: '', appearance: 'blue fox, red scarf', scene: '', negative_prompt: 'blurry',
      width: 512, height: 768, guidance_scale: 5, loras: [], ...overrides,
    });
    const handoff = (overrides: any = {}) => ({
      name: 'Ash', characterId: 'ash', imageId: 'ash-look', mode: 'add', source: 'generator_add', recipe: look(), ...overrides,
    });
    const add = (pending: any) => {
      spyOn(characters, 'takeImageHandoff').and.returnValue(pending);
      (component as any).applyCharacterHandoff();
      characters.takeImageHandoff.calls.reset();
      (characters.takeImageHandoff as jasmine.Spy).and.stub();
    };
    const addAgain = (pending: any) => {
      (characters.takeImageHandoff as jasmine.Spy).and.returnValue(pending);
      (component as any).applyCharacterHandoff();
    };

    beforeEach(() => {
      characters = TestBed.inject(CharactersService);
      messages = spyOn(TestBed.inject(MessageService), 'add');
      spyOn(component, 'saveSettings');
      // Hi-res is a signed-in feature; signed out, any price update switches it off.
      spyOn(TestBed.inject(AuthService), 'isLoggedIn').and.returnValue(true);
    });

    it('puts the character in front of what was typed and leaves everything else alone', () => {
      const reference = { UUID: 'ref', aspectRatio: 'square' } as any;
      component.referenceImage = reference;
      component.hiresEnabled = true;
      component.generationRequest = {
        ...component.generationRequest, prompt: 'sitting in a cafe, rain outside', negative_prompt: 'my own negative',
        seed: 123, job_type: 'img2img', mask_image: 'mask', guidance_scale: 7, width: 768, height: 512,
        regional_prompting: { enabled: true, version: 2, regions: [{ id: 'r', prompt: 'left', x: 0, y: 0, width: 0.5, height: 1 }] },
        loras: [{ id: 5, name: 'My style', strength: .5 }],
      };
      const before = structuredClone(component.generationRequest);
      const loras = component.generationRequest.loras;

      add(handoff());

      expect(component.generationRequest.prompt).toBe('blue fox, red scarf, sitting in a cafe, rain outside');
      expect({ ...component.generationRequest, prompt: before.prompt }).toEqual(before);
      expect(component.generationRequest.loras).toBe(loras);
      expect(component.referenceImage).toBe(reference);
      expect(component.hiresEnabled).toBeTrue();
      expect(characters.activeCharacter()).toEqual({ id: 'ash', imageId: 'ash-look', name: 'Ash', inserted: 'blue fox, red scarf' });
      expect(characters.recordLoaded).toHaveBeenCalledOnceWith('ash', 'ash-look', 'generator_add');
      expect(messages.calls.mostRecent().args[0].summary).toBe('Ash added to your prompt');
      expect(component.canUndoCharacter).toBeTrue();
    });

    it('fills an empty prompt box with the character alone and takes its negative prompt when there is none', () => {
      component.generationRequest.prompt = '';
      component.generationRequest.negative_prompt = '   ';
      add(handoff());
      expect(component.generationRequest.prompt).toBe('blue fox, red scarf');
      expect(component.generationRequest.negative_prompt).toBe('blurry');
    });

    it('does not repeat tags the user already has, and says so', () => {
      component.generationRequest.prompt = 'masterpiece, Red Scarf, walking';
      add(handoff({ recipe: look({ appearance: 'masterpiece, blue fox, red scarf' }) }));
      expect(component.generationRequest.prompt).toBe('masterpiece, blue fox, red scarf, walking');
      expect(messages.calls.mostRecent().args[0].detail).toContain('2 tags you already had were not repeated.');
    });

    it('keeps a dynamic prompt dynamic and does not look for repeated tags inside it', () => {
      component.generationRequest.prompt = '{blue fox|green cat}, blue fox, _mobian/poses_';
      add(handoff());
      expect(component.generationRequest.prompt).toBe('blue fox, red scarf, {blue fox|green cat}, blue fox, _mobian/poses_');
      expect(component.generationRequest.dynamic_prompting.enabled).toBeTrue();
      expect(component.generationRequest.dynamic_prompting.template).toBe(component.generationRequest.prompt);
    });

    it('warns when the character text would break a dynamic prompt', () => {
      component.generationRequest.prompt = 'walking, {day|night}';
      add(handoff({ recipe: look({ appearance: 'blue fox, long_hair_between_eyes' }) }));
      expect(component.generationRequest.prompt).toBe('blue fox, long_hair_between_eyes, walking, {day|night}');
      expect(messages.calls.mostRecent().args[0].detail).toContain('between underscores');
    });

    for (const scenario of [
      { name: 'a plain prompt past 8,000 characters', typed: 'x'.repeat(7990), limit: '8,000' },
      { name: 'a dynamic prompt past 3,000 characters', typed: '{a|b}, ' + 'x'.repeat(2990), limit: '3,000' },
    ]) {
      it(`refuses ${scenario.name} and changes nothing`, () => {
        const earlier = { id: 'amy', imageId: 'amy-look', name: 'Amy' };
        characters.activeCharacter.set(earlier);
        component.generationRequest.prompt = scenario.typed;
        const request = component.generationRequest;
        const before = structuredClone(request);

        add(handoff());

        expect(component.generationRequest).toBe(request);
        expect(component.generationRequest).toEqual(before);
        expect(characters.activeCharacter()).toEqual(earlier);
        expect(characters.recordLoaded).not.toHaveBeenCalled();
        expect(component.canUndoCharacter).toBeFalse();
        const toast = messages.calls.mostRecent().args[0];
        expect(toast.severity).toBe('warn');
        expect(toast.detail).toContain(scenario.limit);
      });
    }

    it('swaps an earlier character instead of piling a second one on top', () => {
      component.generationRequest.prompt = 'walking in the rain';
      add(handoff());
      addAgain(handoff({ name: 'Amy', characterId: 'amy', imageId: 'amy-look', recipe: look({ appearance: 'pink hedgehog, red dress' }) }));
      expect(component.generationRequest.prompt).toBe('pink hedgehog, red dress, walking in the rain');
      expect(characters.activeCharacter()).toEqual({ id: 'amy', imageId: 'amy-look', name: 'Amy', inserted: 'pink hedgehog, red dress' });
      expect(messages.calls.mostRecent().args[0].summary).toBe('Amy replaced Ash in your prompt');
    });

    it('swaps out a character that was loaded with "replace", keeping the one-time extra details', () => {
      add(handoff({ mode: 'replace', source: 'character_page', recipe: look({ scene: 'reading in a library' }) }));
      expect(component.generationRequest.prompt).toBe('blue fox, red scarf, reading in a library');
      expect(characters.activeCharacter().inserted).toBe('blue fox, red scarf');
      addAgain(handoff({ name: 'Amy', characterId: 'amy', imageId: 'amy-look', recipe: look({ appearance: 'pink hedgehog' }) }));
      expect(component.generationRequest.prompt).toBe('pink hedgehog, reading in a library');
    });

    it('switches to a pinned model as a manual change does, with the look’s guidance and LoRAs first', () => {
      component.generationRequest.model = 'novaMobianXL_v20';
      component.generationRequest.guidance_scale = 7;
      component.generationRequest.prompt = 'walking';
      component.generationRequest.loras = [{ id: 5, version_id: 50, name: 'Mine A' }, { id: 6, version_id: 60, name: 'Mine B' }, { id: 7, version_id: 70, name: 'Mine C' }];
      component.hiresEnabled = true;
      add(handoff({ recipe: look({ model: 'Anima-baseV1', guidance_scale: 4.5, loras: [{ id: 9, version_id: 90, name: 'Fox', strength: .7 }] }) }));
      expect(component.generationRequest.model).toBe('Anima-baseV1');
      expect(component.generationRequest.guidance_scale).toBe(4.5);
      expect(component.generationRequest.loras.map((lora: any) => lora.id)).toEqual([9, 5, 6]);
      expect(component.generationRequest.loras[0].strength).toBe(.7);
      expect(component.generationRequest.prompt).toBe('blue fox, red scarf, walking');
      expect(component.hiresEnabled).toBeTrue();
      const detail = messages.calls.mostRecent().args[0].detail;
      expect(detail).toContain('Model switched to');
      expect(detail).toContain('1 of your LoRAs did not fit and was left out.');
    });

    it('keeps the current guidance for a look pinned to the model already selected, and does not double a shared LoRA', () => {
      component.generationRequest.model = 'novaMobianXL_v20';
      component.generationRequest.guidance_scale = 7;
      component.generationRequest.loras = [{ id: 9, version_id: 90, name: 'Fox', strength: .4 }, { id: 5, version_id: 50, name: 'Mine' }];
      add(handoff({ recipe: look({ model: 'novaMobianXL_v20', guidance_scale: 4.5, loras: [{ id: 9, version_id: 90, name: 'Fox', strength: .7 }] }) }));
      expect(component.generationRequest.model).toBe('novaMobianXL_v20');
      expect(component.generationRequest.guidance_scale).toBe(7);
      expect(component.generationRequest.loras.map((lora: any) => [lora.id, lora.strength])).toEqual([[9, .7], [5, 1]]);
    });

    it('undoes back to exactly the earlier setup and links the earlier character again', () => {
      const earlier = { id: 'amy', imageId: 'amy-look', name: 'Amy', inserted: 'pink hedgehog' };
      characters.activeCharacter.set(earlier);
      component.generationRequest.prompt = 'pink hedgehog, walking';
      component.generationRequest.loras = [{ id: 5, name: 'Mine', strength: .5 }];
      const before = structuredClone(component.generationRequest);

      add(handoff({ recipe: look({ model: 'Anima-baseV1', loras: [{ id: 9, version_id: 90, name: 'Fox', strength: .7 }] }) }));
      expect(component.generationRequest.prompt).toBe('blue fox, red scarf, walking');
      component.undoCharacter();

      expect(component.generationRequest).toEqual(before);
      expect(characters.activeCharacter()).toEqual(earlier);
      expect(characters.recordUnlinked).toHaveBeenCalledOnceWith('undo', jasmine.objectContaining({ id: 'ash' }));
      expect(characters.clearActiveCharacter).not.toHaveBeenCalled();
      expect(component.canUndoCharacter).toBeFalse();
    });

    it('undoes to no character when none was linked before', () => {
      component.generationRequest.prompt = 'walking';
      const before = structuredClone(component.generationRequest);
      add(handoff());
      component.undoCharacter();
      expect(component.generationRequest).toEqual(before);
      expect(characters.activeCharacter()).toBeNull();
      expect(characters.recordUnlinked).toHaveBeenCalledOnceWith('undo');
    });

    it('treats a look opened as a reference picture as a replace even if "add" was asked for', () => {
      component.generationRequest.prompt = 'walking';
      add(handoff({ image: { UUID: 'character-ash-look', aspectRatio: 'portrait' } }));
      expect(component.generationRequest.prompt).toBe('blue fox, red scarf');
    });

    it('keeps the added text with a pending job so a refresh can still swap it', async () => {
      component.generationRequest.prompt = 'walking';
      add(handoff());
      const sd = TestBed.inject(StableDiffusionService) as any;
      const reply = new Subject<any>(); sd.submitJob = jasmine.createSpy().and.returnValue(reply);
      spyOn(component, 'getJob');
      component.queueType = 'free';
      await component.submitJob();
      reply.next({ job_id: 'job-1', character_id: 'ash', character_look_id: 'ash-look' }); reply.complete();
      const pending = JSON.parse(localStorage.getItem('mobians:pending-job')!);
      expect(pending.characterInserted).toBe('blue fox, red scarf');
      expect(pending.request.characterInserted).toBeUndefined();
    });
  });

  describe('the character link', () => {
    it('records why a character was unlinked, and nothing when the account itself went away', () => {
      const characters = TestBed.inject(CharactersService) as any;
      characters.activeCharacter.set({ id: 'amy', imageId: 'amy-look', name: 'Amy' });
      component.dismissCharacter('manual');
      expect(characters.recordUnlinked).toHaveBeenCalledOnceWith('manual');
      expect(characters.activeCharacter()).toBeNull();
      characters.recordUnlinked.calls.reset();
      component.dismissCharacter();
      expect(characters.recordUnlinked).not.toHaveBeenCalled();
    });

    it('stays when a picture made with that character is enlarged, and goes when another picture becomes the reference', async () => {
      const characters = TestBed.inject(CharactersService) as any;
      const shared = TestBed.inject(SharedService) as any;
      await component.ngOnInit();
      shared.images = [{ UUID: 'made-with-amy', characterId: 'amy' }, { UUID: 'made-without', characterId: undefined }];
      characters.activeCharacter.set({ id: 'amy', imageId: 'amy-look', name: 'Amy' });

      shared.referenceImage.next({ UUID: 'made-with-amy', aspectRatio: 'square' });
      expect(characters.activeCharacter()?.id).toBe('amy');
      expect(characters.recordUnlinked).not.toHaveBeenCalled();
      expect(component.generationRequest.job_type).toBe('img2img');

      shared.referenceImage.next({ UUID: 'made-without', aspectRatio: 'square' });
      expect(characters.activeCharacter()).toBeNull();
      expect(characters.recordUnlinked).toHaveBeenCalledOnceWith('reference');
    });

    it('goes when an uploaded picture becomes the reference', async () => {
      const characters = TestBed.inject(CharactersService) as any;
      const shared = TestBed.inject(SharedService) as any;
      await component.ngOnInit();
      shared.images = [{ UUID: 'made-with-amy', characterId: 'amy' }];
      characters.activeCharacter.set({ id: 'amy', imageId: 'amy-look', name: 'Amy' });
      shared.referenceImage.next({ UUID: 'upload-1', aspectRatio: 'square' });
      expect(characters.activeCharacter()).toBeNull();
    });
  });

  it('shows the start instructions after removing the reference only when there are no results to go back to', () => {
    const shared = TestBed.inject(SharedService) as any;
    shared.enableInstructions = jasmine.createSpy('enableInstructions');
    shared.images = [{ UUID: 'result-1' }];
    component.images = [];   // this component's own list is emptied whenever a reference is set
    component.removeReferenceImage();
    expect(shared.enableInstructions).not.toHaveBeenCalled();
    shared.images = [];
    component.removeReferenceImage();
    expect(shared.enableInstructions).toHaveBeenCalledTimes(1);
  });

  it('tells the page when finished images could not be stored, so the grid can offer Download', () => {
    const changes: boolean[] = [];
    component.historyRecoveryChange.subscribe(value => changes.push(value));
    component.historyRecoveryPending = true;
    component.historyRecoveryPending = true;
    component.historyRecoveryPending = false;
    expect(changes).toEqual([true, false]);
  });

  it('keeps a pending image job when the route is destroyed and resumes polling immediately', fakeAsync(() => {
    const jobId = 'image-job-123';
    localStorage.setItem('mobians:pending-job', JSON.stringify({
      job_id: jobId,
      createdAt: Date.now(),
    }));
    const stableDiffusionService = TestBed.inject(StableDiffusionService) as any;
    const generationLock = TestBed.inject(GenerationLockService) as any;
    const statusSpy = spyOn(stableDiffusionService, 'getJobStatus').and.returnValue(NEVER);
    const releaseSpy = spyOn(generationLock, 'release');

    component.getJob(jobId);
    tick(0);

    expect(statusSpy).toHaveBeenCalledOnceWith(jobId);

    fixture.destroy();

    expect(JSON.parse(localStorage.getItem('mobians:pending-job') || '{}').job_id).toBe(jobId);
    expect(releaseSpy).not.toHaveBeenCalled();
  }));

  for (const state of ['running', 'saving', 'expired'] as const) {
    for (const seedChoice of [undefined, -1, 0, 42]) {
      it(`preserves seed choice ${seedChoice} when restoring a ${state} job`, async () => {
        localStorage.setItem(seedPreferenceKey, JSON.stringify({ seed: seedChoice ?? null }));
        localStorage.setItem('mobians:pending-job', JSON.stringify({
          job_id: 'seed-recovery',
          createdAt: Date.now() - (state === 'expired' ? 25 * 60 * 60 * 1000 : 0),
          phase: state === 'saving' ? 'saving' : undefined,
          request: { prompt: 'Recovered prompt', seed: 87654321, model: 'novaMobianXL_v20' },
        }));
        spyOn(component, 'getJob');
        spyOn(component, 'retryHistorySave').and.resolveTo();

        await component.ngOnInit();

        expect(component.generationRequest.seed).toBe(seedChoice);
        expect(component.currentSeed).toBe(87654321);
        expect(component.generationRequest.prompt).toBe('Recovered prompt');
        if (state !== 'expired') expect((component as any).getPendingJob().request.seed).toBe(87654321);
        component.saveSettings();
        expect(JSON.parse(localStorage.getItem(seedPreferenceKey)!).seed).toBe(seedChoice ?? null);
        fixture.destroy();
      });
    }
  }

  for (const state of ['running', 'saving', 'expired'] as const) {
    it(`keeps the saved negative prompt when restoring a ${state} job from a model without negative prompts`, async () => {
      const sd = TestBed.inject(StableDiffusionService) as any;
      spyOn(sd, 'getGenerationModels').and.returnValue(of({
        default_model: 'novaMobianXL_v20', models: [...testModelSettings, kromaModelSettings],
      }));
      localStorage.setItem(negativePromptKey, 'Keep my negative prompt');
      localStorage.setItem('model', 'Kroma-Krea2');
      localStorage.setItem('mobians:pending-job', JSON.stringify({
        job_id: 'kroma-recovery',
        createdAt: Date.now() - (state === 'expired' ? 25 * 60 * 60 * 1000 : 0),
        phase: state === 'saving' ? 'saving' : undefined,
        // Submitted Kroma requests carry the empty negative prompt the model requires.
        request: { prompt: 'Recovered prompt', negative_prompt: '', guidance_scale: 1, model: 'Kroma-Krea2' },
      }));
      spyOn(component, 'getJob');
      spyOn(component, 'retryHistorySave').and.resolveTo();

      await component.ngOnInit();

      expect(component.generationRequest.model).toBe('Kroma-Krea2');
      expect(component.generationRequest.negative_prompt).toBe('Keep my negative prompt');
      // Switching back to a model with a negative prompt must not persist an empty one.
      component.changeModel('novaMobianXL_v20');
      expect(localStorage.getItem(negativePromptKey)).toBe('Keep my negative prompt');
      fixture.destroy();
    });
  }

  it('sends an empty negative prompt for models without one while keeping the saved text', async () => {
    selectKroma();
    await component.loadSettings();
    component.generationRequest.negative_prompt = 'Keep my negative prompt';
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.submitJob = jasmine.createSpy().and.returnValue(of({ job_id: 'kroma-submission' }));
    spyOn(component, 'getJob');

    await component.submitJob();

    expect(sd.submitJob.calls.mostRecent().args[0].negative_prompt).toBe('');
    // History metadata records what the job actually used.
    expect((component as any).getPendingJob().request.negative_prompt).toBe('');
    expect(component.generationRequest.negative_prompt).toBe('Keep my negative prompt');
    expect(localStorage.getItem(negativePromptKey)).toBe('Keep my negative prompt');
  });

  for (const empty of ['', '  \n']) {
    it(`resets a saved empty negative prompt ${JSON.stringify(empty)} to the default once`, async () => {
      localStorage.setItem('negative-prompt-input', empty);

      await component.loadSettings();

      expect(component.generationRequest.negative_prompt).toBe(component.defaultNegativePrompt);
      expect(localStorage.getItem(negativePromptKey)).toBe(component.defaultNegativePrompt);
      // An empty negative prompt chosen afterwards is deliberate and survives reloads.
      component.generationRequest.negative_prompt = '';
      component.saveSettings();
      await component.loadSettings();
      expect(component.generationRequest.negative_prompt).toBe('');
    });
  }

  it('keeps a saved negative prompt and ignores later writes from older open tabs', async () => {
    localStorage.setItem('negative-prompt-input', 'Keep my negative prompt');

    await component.loadSettings();

    expect(component.generationRequest.negative_prompt).toBe('Keep my negative prompt');
    expect(localStorage.getItem(negativePromptKey)).toBe('Keep my negative prompt');
    localStorage.setItem('negative-prompt-input', ''); // An older tab repeats the bug.
    await component.loadSettings();
    expect(component.generationRequest.negative_prompt).toBe('Keep my negative prompt');
  });

  it('uses the default negative prompt for new users and after resetting saved options', async () => {
    await component.loadSettings();
    expect(component.generationRequest.negative_prompt).toBe(component.defaultNegativePrompt);

    component.generationRequest.negative_prompt = 'Custom negative prompt';
    component.saveSettings();
    localStorage.setItem('negative-prompt-input', 'Stale legacy negative prompt');
    spyOn(window, 'confirm').and.returnValue(true);
    component.resetSessionStorage();
    await component.loadSettings();

    expect(component.generationRequest.negative_prompt).toBe(component.defaultNegativePrompt);
    expect(localStorage.getItem(negativePromptKey)).toBe(component.defaultNegativePrompt);
  });

  for (const seedChoice of [undefined, null, -1, 0, 42]) {
    it(`keeps seed choice ${seedChoice} separate from each submitted seed`, async () => {
      await component.loadSettings();
      component.generationRequest.seed = seedChoice;
      component.generationRequest.prompt = '{Sonic|Tails}';
      const sd = TestBed.inject(StableDiffusionService) as any;
      sd.submitJob = jasmine.createSpy().and.returnValue(of({ job_id: 'seed-submission' }));
      spyOn(component, 'getJob');
      const random = spyOn(Math, 'random').and.returnValue(.12345678);
      const seeds: number[] = [];
      for (const randomValue of [.12345678, .87654321]) {
        random.and.returnValue(randomValue);
        await component.submitJob();
        const request = sd.submitJob.calls.mostRecent().args[0];
        seeds.push(request.seed);
        expect(component.generationRequest.seed).toBe(seedChoice);
        expect(component.currentSeed).toBe(request.seed);
        expect(request.dynamic_prompting.expansion_seed).toBe(request.seed);
        expect((component as any).getPendingJob().request.seed).toBe(request.seed);
        expect(JSON.parse(localStorage.getItem(seedPreferenceKey)!).seed).toBe(seedChoice ?? null);
        (component as any).resetCancelledJob();
      }
      expect(seeds).toEqual(seedChoice == null || seedChoice === -1 ? [12345678, 87654321] : [seedChoice, seedChoice]);
    });
  }

  it('does not persist a generated seed while reference image preparation is pending', async () => {
    await component.loadSettings();
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.submitJob = jasmine.createSpy().and.returnValue(NEVER);
    let resolveImage!: (value: string) => void;
    (TestBed.inject(BlobMigrationService) as any).blobToBase64 = () => new Promise<string>(resolve => resolveImage = resolve);
    component.referenceImage = { blob: new Blob(['image']) } as any;

    const submission = component.submitJob();
    expect(component.generationRequest.seed).toBeUndefined();
    component.onPromptInputChange('Edited while preparing the image');
    expect(localStorage.getItem('seed-input')).toBeNull();
    expect(JSON.parse(localStorage.getItem(seedPreferenceKey)!).seed).toBeNull();
    // A deliberate choice made during preparation belongs to the next request.
    component.generationRequest.seed = 42;
    resolveImage('image-data');
    await submission;
    expect(component.generationRequest.seed).toBe(42);
    expect(sd.submitJob.calls.mostRecent().args[0].seed).toBe(component.currentSeed);
  });

  for (const legacySeed of [0, 42, 87654321]) {
    it(`resets legacy seed ${legacySeed} once without changing unrelated saved data`, async () => {
      localStorage.setItem('seed-input', String(legacySeed));
      localStorage.setItem('prompt-input', 'Keep my prompt');
      localStorage.setItem('negative-prompt-input', 'Keep my negative prompt');
      localStorage.setItem('panel-theme', 'navy');
      const pending = JSON.stringify({ job_id: 'legacy-job', request: { seed: legacySeed } });
      localStorage.setItem('mobians:pending-job', pending);

      await component.loadSettings();
      component.saveSettings();
      await component.loadSettings();

      expect(component.generationRequest.seed).toBeUndefined();
      expect(localStorage.getItem('seed-input')).toBeNull();
      expect(JSON.parse(localStorage.getItem(seedPreferenceKey)!)).toEqual({ seed: null });
      expect(localStorage.getItem('mobians:pending-job')).toBe(pending);
      expect(component.generationRequest.prompt).toBe('Keep my prompt');
      expect(component.generationRequest.negative_prompt).toBe('Keep my negative prompt');
      expect(component.panelTheme).toBe('navy');
    });
  }

  it('resumes an affected job without reusing its legacy fixed seed on the next submission', async () => {
    localStorage.setItem('seed-input', '87654321');
    localStorage.setItem('mobians:pending-job', JSON.stringify({
      job_id: 'legacy-job', createdAt: Date.now(),
      request: { seed: 87654321, prompt: 'Recovered prompt', model: 'novaMobianXL_v20' },
    }));
    spyOn(component, 'getJob');
    await component.ngOnInit();
    expect(component.currentSeed).toBe(87654321);
    expect(component.generationRequest.seed).toBeUndefined();
    expect((component as any).getPendingJob().request.seed).toBe(87654321);
    (component as any).resetCancelledJob();
    const sd = TestBed.inject(StableDiffusionService) as any;
    sd.submitJob = jasmine.createSpy().and.returnValue(NEVER);
    spyOn(Math, 'random').and.returnValue(.12345678);
    await component.submitJob();
    expect(sd.submitJob.calls.mostRecent().args[0].seed).toBe(12345678);
    expect(JSON.parse(localStorage.getItem(seedPreferenceKey)!).seed).toBeNull();
  });

  it('defaults to random for fresh, random, or invalid legacy seed settings', async () => {
    for (const legacySeed of [null, '-1', '', 'invalid', 'NaN']) {
      localStorage.removeItem(seedPreferenceKey);
      if (legacySeed === null) localStorage.removeItem('seed-input');
      else localStorage.setItem('seed-input', legacySeed);
      await component.loadSettings();
      expect(component.generationRequest.seed).toBeUndefined();
      expect(JSON.parse(localStorage.getItem(seedPreferenceKey)!)).toEqual({ seed: null });
    }
  });

  it('persists a new seed choice immediately and ignores legacy writes from older tabs', async () => {
    localStorage.setItem('seed-input', '87654321');
    await component.loadSettings();
    for (const seed of [null, 0, 1234, -1]) {
      component.generationRequest.seed = seed;
      component.saveSettings();
      expect(JSON.parse(localStorage.getItem(seedPreferenceKey)!)).toEqual({ seed });
      localStorage.setItem('seed-input', '87654321');
      await component.loadSettings();
      expect(component.generationRequest.seed).toBe(seed ?? undefined);
    }
  });

  it('falls back to random when new seed preferences are damaged instead of reviving a legacy seed', async () => {
    localStorage.setItem(seedPreferenceKey, 'broken json');
    localStorage.setItem('seed-input', '87654321');
    await component.loadSettings();
    expect(component.generationRequest.seed).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(seedPreferenceKey)!)).toEqual({ seed: null });
  });

  it('retains the seed migration when resetting saved options', async () => {
    localStorage.setItem('seed-input', '87654321');
    await component.loadSettings();
    spyOn(window, 'confirm').and.returnValue(true);
    component.resetSessionStorage();
    await component.loadSettings();
    expect(component.generationRequest.seed).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(seedPreferenceKey)!)).toEqual({ seed: null });
  });

  it('does not overwrite persisted settings before hydration is complete', () => {
    localStorage.setItem('prompt-input', 'saved prompt');
    component.generationRequest.prompt = '';

    component.saveSettings();

    expect(localStorage.getItem('prompt-input')).toBe('saved prompt');
  });

  it('restores saved settings without model catalog availability', async () => {
    (component as any).modelSettings = [];
    component.models_types = {};
    localStorage.setItem('prompt-input', 'remembered prompt');
    localStorage.setItem('panel-theme', 'navy');
    localStorage.setItem('model', 'Anima-baseV1');
    localStorage.setItem('cfg', '6');

    await component.loadSettings();

    expect(component.generationRequest.prompt).toBe('remembered prompt');
    expect(component.panelTheme).toBe('navy');
    expect(component.generationRequest.model).toBe('Anima-baseV1');
    expect(component.generationRequest.guidance_scale).toBe(6);
  });

  it('leaves notifications alone: loading, saving and resetting options never change them', async () => {
    (component as any).modelSettings = [];
    component.models_types = {};
    const notifications = TestBed.inject(NotificationService) as unknown as NotificationServiceStub;
    const setEnabled = spyOn(notifications, 'setEnabled').and.callThrough();
    localStorage.setItem('notifications-enabled', 'true');
    localStorage.setItem('notifications-user-id', 'browser-id-1234');

    await component.loadSettings();
    component.saveSettings();
    spyOn(window, 'confirm').and.returnValue(true);
    component.resetSessionStorage();

    expect(setEnabled).not.toHaveBeenCalled();             // turning on again would re-tick switches the person turned off
    expect(localStorage.getItem('notifications-enabled')).toBe('true');
    expect(localStorage.getItem('notifications-user-id')).toBe('browser-id-1234');
  });

  it("restores 606's theme and applies it to the page", async () => {
    (component as any).modelSettings = [];
    component.models_types = {};
    localStorage.setItem('panel-theme', '606');

    await component.loadSettings();

    expect(component.panelTheme).toBe('606');
    expect(document.body.classList.contains('theme-606')).toBeTrue();
    expect(document.body.classList.contains('theme-navy')).toBeFalse();
    expect(document.body.classList.contains('theme-eggman')).toBeFalse();
  });

  it('uses the SDXL-sized defaults for Anima-baseV1', () => {
    expect((component as any).usesSdxlResolutionDefaults('Anima-baseV1')).toBeTrue();
    expect((component as any).supportsRegionalPrompting('Anima-baseV1')).toBeTrue();
  });

  it('calculates Anima-baseV1 credit costs with LoRAs', () => {
    component.generationRequest.model = 'Anima-baseV1';
    component.generationRequest.loras = [{}, {}];

    component.updateCreditCost();

    expect(component.creditCost).toBe(30);
    expect(component.upscaleCreditCost).toBe(90);
    expect(component.hiresCreditCost).toBe(120);
  });

  it('uses backend model catalog settings for defaults and credit costs', () => {
    (component as any).setModelSettings([
      {
        model_id: 'customModel',
        display_name: 'Custom Model',
        base_model: 'CustomBase',
        default_cfg: 6,
        credit_cost: 18,
        lora_credit_cost: 4,
        supports_sdxl_resolution: false,
        supports_regional_prompting: true,
        supports_upscale: false,
        is_active: true,
        is_default: true,
        display_order: 1,
      },
    ], 'customModel');

    component.generationRequest.model = 'customModel';
    component.generationRequest.loras = [{}, {}];

    component.changeModel({ target: { value: 'customModel' } } as any);

    expect(component.generationRequest.guidance_scale).toBe(6);
    expect(component.creditCost).toBe(26);
    expect(component.upscaleCreditCost).toBe(78);
    expect(component.hiresCreditCost).toBe(104);
    expect((component as any).supportsRegionalPrompting('customModel')).toBeTrue();
    expect(component.supportsUpscale('customModel')).toBeFalse();
    expect(component.models_types['customModel']).toBe('CustomBase');
  });

  it('rejects backend model catalog defaults outside the CFG slider range', () => {
    expect(() => (component as any).setModelSettings([
      {
        ...testModelSettings[0],
        default_cfg: 0,
      },
    ], 'sonicDiffusionV4')).toThrowError(/Invalid default CFG/);
  });

  it('rejects decimal backend model catalog CFG defaults', () => {
    expect(() => (component as any).setModelSettings([
      {
        ...testModelSettings[0],
        default_cfg: 6.5,
      },
    ], 'sonicDiffusionV4')).toThrowError(/Invalid default CFG/);
  });

  it('keeps regional prompting enabled for Anima-baseV1 while keeping its default CFG', () => {
    component.generationRequest.regional_prompting = {
      enabled: true,
      regions: [
        {
          id: 'region-1',
          prompt: 'foreground character',
          negative_prompt: '',
          x: 0,
          y: 0,
          width: 0.5,
          height: 1,
          denoise_strength: 1,
          feather: 32,
          opacity: 1,
          inherit_base_prompt: true,
        },
      ],
    };

    component.changeModel('Anima-baseV1');

    expect(component.generationRequest.guidance_scale).toBe(4);
    expect(component.generationRequest.regional_prompting.enabled).toBeTrue();
    expect(component.generationRequest.regional_prompting.regions.length).toBe(1);
  });

  describe('regional prompting v2', () => {
    const working = () => ({
      enabled: true, version: 2, separation: 'strict', layout_hints: false,
      regions: [
        { id: 'r-1', name: 'Left', prompt: ' sonic ', negative_prompt: 'shadow', x: 0, y: 0, width: 0.5, height: 1, strength: 0.8, feather: 30, inherit_base_prompt: true, denoise_strength: 0.8, opacity: 1 },
        { id: 'r-2', prompt: '', x: 0.5, y: 0, width: 0.5, height: 1, strength: 1, feather: 24, inherit_base_prompt: true, denoise_strength: 1, opacity: 1 },
      ],
    });

    it('saves the regions with the other settings and restores them after a reload', async () => {
      await component.loadSettings();
      component.generationRequest.regional_prompting = working();
      component.saveSettings();
      const stored = JSON.parse(localStorage.getItem('regional-prompting')!);
      expect(stored.regions.length).toBe(2);
      component.generationRequest.regional_prompting = { enabled: false, regions: [] };
      await component.loadSettings();
      expect(component.generationRequest.regional_prompting.enabled).toBeTrue();
      expect(component.generationRequest.regional_prompting.separation).toBe('strict');
      expect(component.generationRequest.regional_prompting.regions.map((r: any) => r.id)).toEqual(['r-1', 'r-2']);
    });

    it('upgrades saved version 1 regions when loading', async () => {
      localStorage.setItem('regional-prompting', JSON.stringify({ enabled: true, regions: [{ id: 'old', prompt: 'amy', x: 0, y: 0, width: 0.5, height: 1, denoise_strength: 0.5, opacity: 1, feather: 32 }] }));
      await component.loadSettings();
      const config = component.generationRequest.regional_prompting;
      expect(config.version).toBe(2);
      expect(config.layout_hints).toBeFalse();
      expect(config.regions[0]).toEqual(jasmine.objectContaining({ strength: 0.5, inherit_base_prompt: true }));
    });

    it('pauses on an unsupported model and resumes on a supported one without losing the switch', () => {
      component.generationRequest.regional_prompting = working();
      component.changeModel('sonicDiffusionV4');
      expect(component.generationRequest.regional_prompting.enabled).toBeTrue();
      expect(component.regionalChipStatus.kind).toBe('paused');
      component.changeModel('novaMobianXL_v20');
      expect(component.regionalChipStatus.kind).toBe('warning');
      expect(component.regionalChipStatus.label).toBe('Regions on · 1');
    });

    it('sends the version 2 payload, skips empty regions and keeps the working regions', async () => {
      await component.loadSettings();
      component.generationRequest.regional_prompting = working();
      const sd = TestBed.inject(StableDiffusionService) as any;
      sd.submitJob = jasmine.createSpy().and.returnValue(of({ job_id: 'regional-job' }));
      spyOn(component, 'getJob');
      const messages = TestBed.inject(MessageService) as any;
      spyOn(messages, 'add');

      await component.submitJob();

      const sent = sd.submitJob.calls.mostRecent().args[0].regional_prompting;
      expect(sent).toEqual({
        enabled: true, version: 2, separation: 'strict', layout_hints: false,
        regions: [{ id: 'r-1', prompt: 'sonic', negative_prompt: 'shadow', x: 0, y: 0, width: 0.5, height: 1, strength: 0.8, feather: 30, inherit_base_prompt: true, denoise_strength: 0.8, opacity: 1 }],
      });
      expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Some regions were skipped' }));
      expect((component as any).getPendingJob().request.regional_prompting).toEqual(sent);
      expect(component.generationRequest.regional_prompting.regions.length).toBe(2);
    });

    it('warns when the server reports that the regions were not applied', async () => {
      await component.loadSettings();
      component.generationRequest.regional_prompting = { ...working(), regions: [working().regions[0]] };
      const sd = TestBed.inject(StableDiffusionService) as any;
      sd.submitJob = jasmine.createSpy().and.returnValue(of({ job_id: 'regional-job', regional: { applied: false, regions: 0, removed_empty: 0 } }));
      spyOn(component, 'getJob');
      const messages = TestBed.inject(MessageService) as any;
      spyOn(messages, 'add');
      await component.submitJob();
      expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Regions not applied' }));
    });

    it('records the region text the server queued after expanding dynamic prompts', async () => {
      await component.loadSettings();
      component.generationRequest.regional_prompting = { ...working(), regions: [{ ...working().regions[0], prompt: '{sonic|tails}' }] };
      const sd = TestBed.inject(StableDiffusionService) as any;
      sd.submitJob = jasmine.createSpy().and.returnValue(of({
        job_id: 'regional-job',
        regional: { applied: true, regions: 1, removed_empty: 0, expanded_regions: [{ id: 'r-1', prompt: 'tails', negative_prompt: 'shadow' }] },
      }));
      spyOn(component, 'getJob');
      await component.submitJob();
      expect(sd.submitJob.calls.mostRecent().args[0].regional_prompting.regions[0].prompt).toBe('{sonic|tails}');
      expect((component as any).getPendingJob().request.regional_prompting.regions[0].prompt).toBe('tails');
      expect(component.generationRequest.regional_prompting.regions[0].prompt).toBe('{sonic|tails}');
    });

    it('sends regions switched off for an unsupported model', async () => {
      await component.loadSettings();
      component.generationRequest.regional_prompting = working();
      component.changeModel('sonicDiffusionV4');
      const sd = TestBed.inject(StableDiffusionService) as any;
      sd.submitJob = jasmine.createSpy().and.returnValue(of({ job_id: 'plain-job' }));
      spyOn(component, 'getJob');
      await component.submitJob();
      expect(sd.submitJob.calls.mostRecent().args[0].regional_prompting).toEqual({ enabled: false, regions: [] });
    });

    it('charges region LoRAs like job LoRAs, sends them with their region and pauses them on other models', async () => {
      await component.loadSettings();
      const regional = {
        supported: true, max_regions: 8, negative_prompts: true, layout_hints: false,
        job_types: ['txt2img', 'img2img', 'inpainting', 'upscale', 'txt2img_upscale'], region_loras: true, max_region_loras: 2, max_total_loras: 3,
      };
      (component as any).setModelSettings(testModelSettings.map(model => model.model_id === 'novaMobianXL_v20' ? { ...model, regional } : model), 'novaMobianXL_v20');
      component.changeModel('novaMobianXL_v20');
      component.generationRequest.loras = [{ id: 21, version_id: 2101, name: 'Style', version: 'v1', base_model: 'Illustrious' }];
      const amy = { id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.7, base_model: 'Illustrious' };
      component.generationRequest.regional_prompting = { ...working(), regions: [{ ...working().regions[0], loras: [amy] }] };
      component.saveSettings();
      expect(component.creditCost).toBe(15 + 2 * 5);
      expect(component.hiresCreditCost).toBe((15 + 2 * 5) * 4);
      expect(JSON.parse(localStorage.getItem('regional-prompting')!).regions[0].loras[0]).toEqual(amy);

      const sd = TestBed.inject(StableDiffusionService) as any;
      sd.submitJob = jasmine.createSpy().and.returnValue(of({
        job_id: 'regional-job', regional: { applied: true, regions: 1, removed_empty: 0, region_loras: 1 },
      }));
      spyOn(component, 'getJob');
      await component.submitJob();
      const sent = sd.submitJob.calls.mostRecent().args[0].regional_prompting;
      expect(sent.regions[0].loras).toEqual([{ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.7 }]);
      expect((component as any).getPendingJob().request.regional_prompting.regions[0].loras.length).toBe(1);

      // A model without LoRAs per region: kept in the editor, not sent, not charged.
      component.changeModel('Anima-baseV1');
      expect(component.creditCost).toBe(20 + 5);
      expect(component.generationRequest.regional_prompting.regions[0].loras.length).toBe(1);
      expect(component.regionalChipStatus.warnings.join(' ')).toContain('does not use LoRAs per region');
    });

    it('loads the LoRA catalog with the page for saved region LoRAs, without the editor open', async () => {
      // A region LoRA from history or a preset carries no base model; the catalog decides whether it is sent.
      const load = spyOn(TestBed.inject(RegionalLoraCatalogService), 'ensureLoaded');
      const regional = {
        supported: true, max_regions: 8, negative_prompts: true, layout_hints: false,
        job_types: ['txt2img', 'img2img', 'inpainting', 'upscale', 'txt2img_upscale'], region_loras: true, max_region_loras: 2, max_total_loras: 3,
      };
      (component as any).setModelSettings(testModelSettings.map(model => model.model_id === 'novaMobianXL_v20' ? { ...model, regional } : model), 'novaMobianXL_v20');
      component.changeModel('novaMobianXL_v20');
      expect(load).not.toHaveBeenCalled();   // no region LoRAs yet
      localStorage.setItem('regional-prompting', JSON.stringify({
        ...working(), regions: [{ ...working().regions[0], loras: [{ id: 11, version_id: 1101, name: 'Amy Rose', strength: 0.7 }] }],
      }));
      await component.loadSettings();
      expect(component.generationRequest.regional_prompting.regions[0].loras.length).toBe(1);
      expect(load).toHaveBeenCalled();
      load.calls.reset();
      component.changeModel('Anima-baseV1');   // no LoRAs per region: nothing to look up
      expect(load).not.toHaveBeenCalled();
    });

    it('tells the user when the server dropped region LoRAs', async () => {
      await component.loadSettings();
      component.generationRequest.regional_prompting = { ...working(), regions: [working().regions[0]] };
      const sd = TestBed.inject(StableDiffusionService) as any;
      sd.submitJob = jasmine.createSpy().and.returnValue(of({
        job_id: 'regional-job',
        regional: {
          applied: true, regions: 1, removed_empty: 0, region_loras: 0, region_loras_dropped: 'model_not_supported',
          region_lora_duplicates: [{ region: 1, name: 'Amy Rose', reason: 'job_lora' }],
        },
      }));
      spyOn(component, 'getJob');
      const messages = TestBed.inject(MessageService) as any;
      spyOn(messages, 'add');
      await component.submitJob();
      expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Region LoRAs not used' }));
      expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Region LoRA used once', detail: jasmine.stringMatching(/Amy Rose/) }));
    });

    it('reuses a layout from history through the regional editor', async () => {
      await component.loadSettings();
      const store = component.regionalEditor;
      // ngOnInit subscribes this handler to store.reuseRequests$ (the history menu, info dialog and LoRA prompt call requestReuse).
      (component as any).reuseRegionalLayout({ regional: { enabled: true, regions: [{ id: 'h', prompt: 'tails', x: 0.1, y: 0.1, width: 0.3, height: 0.3, denoise_strength: 1, opacity: 1, feather: 6, loras: [{ id: 12, version_id: 1201, name: 'Shadow', version: 'v1', strength: 0.9 }] }] }, openEditor: false });
      const config = component.generationRequest.regional_prompting;
      expect(config.enabled).toBeTrue();
      expect(config.regions[0]).toEqual(jasmine.objectContaining({ id: 'h', prompt: 'tails', feather: 6 }));
      expect(config.regions[0].loras).toEqual([{ id: 12, version_id: 1201, name: 'Shadow', version: 'v1', strength: 0.9 }]);   // region LoRAs come back too
      expect(JSON.parse(localStorage.getItem('regional-prompting')!).regions[0].prompt).toBe('tails');
      expect(store.undo(config)).toBeTrue();
      expect(config.regions.length).toBe(0);
    });
  });

  it('auto-enables dynamic prompting for typed variant syntax', () => {
    component.generationRequest.prompt = 'A {heroic|playful|dramatic} Sonic-style portrait';
    component.generationRequest.dynamic_prompting = { enabled: false };

    component.onPromptInputChange();
    const config = (component as any).getDynamicPromptingForRequest();

    expect(component.isDynamicPromptActive()).toBeTrue();
    expect(component.generationRequest.dynamic_prompting?.enabled).toBeTrue();
    expect(component.generationRequest.dynamic_prompting?.template).toBe('A {heroic|playful|dramatic} Sonic-style portrait');
    expect(config.enabled).toBeTrue();
    expect(config.template).toBe('A {heroic|playful|dramatic} Sonic-style portrait');
  });

  it('does not auto-enable dynamic prompting for bare category paths', () => {
    component.generationRequest.prompt = 'mobian/characters, mobian/poses, mobian/scenes';
    component.generationRequest.dynamic_prompting = { enabled: false };

    component.onPromptInputChange();
    const config = (component as any).getDynamicPromptingForRequest();

    expect(component.isDynamicPromptActive()).toBeFalse();
    expect(component.generationRequest.dynamic_prompting?.enabled).toBeFalse();
    expect(config.enabled).toBeFalse();
    expect(config.template).toBe('mobian/characters, mobian/poses, mobian/scenes');
  });

  it('auto-enables dynamic prompting for known wildcard tokens', () => {
    component.generationRequest.prompt = 'A portrait of _mobian/characters_';
    component.generationRequest.dynamic_prompting = { enabled: false };

    component.onPromptInputChange();
    const config = (component as any).getDynamicPromptingForRequest();

    expect(component.isDynamicPromptActive()).toBeTrue();
    expect(component.generationRequest.dynamic_prompting?.enabled).toBeTrue();
    expect(config.enabled).toBeTrue();
    expect(config.template).toBe('A portrait of _mobian/characters_');
  });

  it('auto-enables dynamic prompting for typed template tokens', () => {
    component.generationRequest.prompt = 'A portrait from __mobian/character-spotlight__';
    component.generationRequest.dynamic_prompting = { enabled: false };

    component.onPromptInputChange();
    const config = (component as any).getDynamicPromptingForRequest();

    expect(component.isDynamicPromptActive()).toBeTrue();
    expect(config.enabled).toBeTrue();
    expect(config.template).toBe('A portrait from __mobian/character-spotlight__');
  });

  it('treats legacy custom category alias tokens as unknown wildcards', () => {
    component.generationRequest.prompt = 'A portrait with _custom/bffde430-c3d5-4f9f-9560-0b1049c9e143_';
    component.generationRequest.dynamic_prompting = { enabled: false };

    const config = (component as any).getDynamicPromptingForRequest();
    const highlighted = component.getDynamicPromptHighlightHtml();

    expect(component.isDynamicPromptActive()).toBeFalse();
    expect(config.enabled).toBeFalse();
    expect(highlighted).toContain('_custom/bffde430-c3d5-4f9f-9560-0b1049c9e143_');
    expect(highlighted).not.toContain('<span class="dynamic-prompt-token">_custom/bffde430-c3d5-4f9f-9560-0b1049c9e143_</span>');
  });

  it('keeps unknown wildcard tokens inactive when they are the only syntax', () => {
    component.generationRequest.prompt = 'A portrait of _mobian/not-real_';
    component.generationRequest.dynamic_prompting = { enabled: false };

    const config = (component as any).getDynamicPromptingForRequest();
    const highlighted = component.getDynamicPromptHighlightHtml();

    expect(component.isDynamicPromptActive()).toBeFalse();
    expect(config.enabled).toBeFalse();
    expect(highlighted).toContain('_mobian/not-real_');
    expect(highlighted).not.toContain('<span class="dynamic-prompt-token">_mobian/not-real_</span>');
  });

  it('highlights only dynamic prompt syntax tokens', () => {
    component.generationRequest.prompt = 'A <hero> {heroic|playful} with _mobian/characters_ and __mobian/character-spotlight__';

    const highlighted = component.getDynamicPromptHighlightHtml();

    expect(highlighted).toContain('A &lt;hero&gt; ');
    expect(highlighted).toContain('<span class="dynamic-prompt-token">{heroic|playful}</span>');
    expect(highlighted).toContain('<span class="dynamic-prompt-token">_mobian/characters_</span>');
    expect(highlighted).toContain('<span class="dynamic-prompt-token">__mobian/character-spotlight__</span>');
    expect(highlighted).not.toContain('<span class="dynamic-prompt-token">A &lt;hero&gt;</span>');
  });

  it('highlights known wildcard tokens while leaving unknown tokens normal', () => {
    component.generationRequest.prompt = '_mobian/characters_ and _mobian/not-real_';

    const highlighted = component.getDynamicPromptHighlightHtml();

    expect(highlighted).toContain('<span class="dynamic-prompt-token">_mobian/characters_</span>');
    expect(highlighted).toContain(' and _mobian/not-real_');
    expect(highlighted).not.toContain('<span class="dynamic-prompt-token">_mobian/not-real_</span>');
  });

  it('migrates stored category prompts to single underscore syntax once', async () => {
    localStorage.setItem('prompt-input', 'A portrait of __mobian/characters__');
    localStorage.setItem('dynamic-prompting', JSON.stringify({ enabled: true, template: '__mobian/poses__' }));
    localStorage.removeItem('mobians:dynamic-prompt-category-syntax-v2');

    await component.loadSettings();

    expect(component.generationRequest.prompt).toBe('A portrait of _mobian/characters_');
    expect(component.generationRequest.dynamic_prompting.template).toBe('_mobian/poses_');
    expect(localStorage.getItem('mobians:dynamic-prompt-category-syntax-v2')).toBe('done');
  });
});
import { CharactersService } from 'src/app/characters/characters.service';

describe('OptionsComponent asynchronous initial state', () => {
  let fixture: ComponentFixture<OptionsComponent>;
  let catalog: Subject<any>;
  let credits: Subject<any>;

  beforeEach(async () => {
    localStorage.clear();
    catalog = new Subject();
    credits = new Subject();
    const sd = new StableDiffusionServiceStub();
    spyOn(sd, 'getGenerationModels').and.returnValue(catalog);
    await TestBed.configureTestingModule({
      imports: [OptionsComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ImageEditorService, useValue: { available: signal(true), pending: signal(false), open: jasmine.createSpy('openEditor') } },
        { provide: CharactersService, useValue: { activeCharacter: signal(null), recordLoaded: () => {}, recordEvent: () => {}, recordUnlinked: () => {}, takeImageHandoff: () => null, imageHandoffReady: new Subject<void>(), clearActiveCharacter: () => {} } },
        { provide: StableDiffusionService, useValue: sd },
        { provide: SharedService, useClass: SharedServiceStub },
        { provide: MessageService, useClass: MessageServiceStub },
        { provide: NotificationService, useClass: NotificationServiceStub },
        { provide: SwPush, useClass: SwPushStub },
        { provide: DialogService, useClass: DialogServiceStub },
        { provide: BlobMigrationService, useClass: BlobMigrationServiceStub },
        { provide: GenerationLockService, useClass: GenerationLockServiceStub },
        { provide: AuthService, useValue: { isLoggedIn: () => false, credits$: credits } },
      ],
    }).overrideComponent(OptionsComponent, {
      set: { template: '<span class="cost">{{creditCost}}</span><span class="credits">{{userCredits}}</span><button [disabled]="!canGenerate">Generate</button><span class="reference">{{referenceImage?.UUID}}</span>' },
    }).compileComponents();
    fixture = TestBed.createComponent(OptionsComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    localStorage.clear();
    fixture.destroy();
    document.body.classList.remove('theme-navy', 'theme-606', 'theme-eggman', 'dark-input-fields');
  });

  it('updates and clears the reference while models are still loading, without enabling generation', async () => {
    const component = fixture.componentInstance;
    const shared = TestBed.inject(SharedService) as unknown as SharedServiceStub;
    const acquire = spyOn(TestBed.inject(GenerationLockService), 'tryAcquire');
    shared.referenceImage.next({ UUID: 'history-selection', aspectRatio: 'square', base64: 'image-data' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.reference').textContent).toBe('history-selection');
    expect(component.generationRequest.job_type).toBe('img2img');
    expect(component.modelsLoading).toBeTrue();
    expect(fixture.nativeElement.querySelector('button').disabled).toBeTrue();
    for (const mode of ['generate', 'upscale', 'hires'] as const) await component.submitJob(mode);
    expect(acquire).not.toHaveBeenCalled();

    shared.referenceImage.next(null);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.reference').textContent).toBe('');
    expect(component.generationRequest.job_type).toBe('txt2img');
    expect(component.generationRequest.image).toBeUndefined();
  });

  it('keeps the selected image through a timeout and retries successfully without refreshing', fakeAsync(() => {
    spyOn(console, 'error');
    fixture.destroy();
    fixture = TestBed.createComponent(OptionsComponent);
    fixture.autoDetectChanges();
    tick();
    const component = fixture.componentInstance;
    const shared = TestBed.inject(SharedService) as unknown as SharedServiceStub;
    shared.referenceImage.next({ UUID: 'history-selection', aspectRatio: 'square', base64: 'image-data' });
    tick(28499);
    expect(component.referenceImage?.UUID).toBe('history-selection');
    expect(component.modelsLoading).toBeTrue();
    expect(component.canGenerate).toBeFalse();
    tick(1);
    expect(component.modelsLoading).toBeFalse();
    expect(component.modelsLoadError).toBeTrue();
    expect(component.canGenerate).toBeFalse();
    // Cross-tab and job-completion updates must not bypass the catalog requirement.
    component.enableGenerationButton = true;
    expect(component.canGenerate).toBeFalse();

    component.loadGenerationModels();
    component.loadGenerationModels();
    expect(TestBed.inject(StableDiffusionService).getGenerationModels).toHaveBeenCalledTimes(3);
    expect(component.modelsLoading).toBeTrue();
    expect(component.modelsLoadError).toBeFalse();
    expect(component.canGenerate).toBeFalse();
    catalog.next({ default_model: 'novaMobianXL_v20', models: testModelSettings });
    tick();
    expect(component.modelsLoading).toBeFalse();
    expect(component.modelsLoadError).toBeFalse();
    expect(component.canGenerate).toBeTrue();
    expect(component.referenceImage?.UUID).toBe('history-selection');
    expect(component.generationRequest.image).toBe('image-data');
    expect(component.creditCost).toBe(15);
    expect(localStorage.getItem('model')).toBe('novaMobianXL_v20');
  }));

  it('does not enable generation for a pending job when the catalog arrives', async () => {
    const component = fixture.componentInstance;
    component.hasPendingJob = true;
    catalog.next({ default_model: 'novaMobianXL_v20', models: testModelSettings });
    await Promise.resolve();
    await fixture.whenStable();
    expect(component.modelsLoading).toBeFalse();
    expect(component.canGenerate).toBeFalse();
  });

  it('cancels catalog retries when the view is destroyed', fakeAsync(() => {
    spyOn(console, 'error');
    fixture.destroy();
    fixture = TestBed.createComponent(OptionsComponent);
    fixture.autoDetectChanges();
    tick();
    expect(catalog.observed).toBeTrue();
    const messages = spyOn(TestBed.inject(MessageService), 'add');
    fixture.destroy();
    tick(30000);
    expect(catalog.observed).toBeFalse();
    expect(messages).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  }));

  it('renders model prices and credit refreshes when responses arrive after the first render', async () => {
    expect(fixture.nativeElement.querySelector('.cost').textContent).toBe('0');
    catalog.next({ default_model: 'novaMobianXL_v20', models: testModelSettings });
    catalog.complete();
    await Promise.resolve(); // Let firstValueFrom resume before waiting for its scheduled render.
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.cost').textContent).toBe('15');

    credits.next({ credits: 120 });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.credits').textContent).toBe('120');
    expect(() => fixture.checkNoChanges()).not.toThrow();
  });

  it('renders the disabled generator if the model response cannot be used', async () => {
    spyOn(console, 'error');
    catalog.next({ default_model: '', models: [] });
    catalog.complete();
    await Promise.resolve();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button').disabled).toBeTrue();
    expect(() => fixture.checkNoChanges()).not.toThrow();
  });
});
