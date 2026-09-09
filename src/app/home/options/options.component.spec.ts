import { signal } from '@angular/core';
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { BehaviorSubject, NEVER, Subject, of } from 'rxjs';
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

import { OptionsComponent } from './options.component';

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
  subscribeToNotifications() {}
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
        { provide: CharactersService, useValue: { activeCharacter: signal(null), recordLoaded: () => {}, takeImageHandoff: () => null, imageHandoffReady: new Subject<void>(), clearActiveCharacter: jasmine.createSpy('clearActiveCharacter').and.callFake(function(this: any) { this.activeCharacter.set(null); }) } },
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

  for (const fallback of [false, true]) {
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
        shared.setImages = jasmine.createSpy();
        const ingest = jasmine.createSpy().and.resolveTo(undefined);
        (component as any).historyPanel = { ingestGeneratedImages: ingest };
        component.generationRequest.lossy_images = lossy;

        await (component as any)[fallback ? 'downloadJobImagesFallback' : 'downloadJobImages']('fixture');

        const images = shared.setImages.calls.mostRecent().args[0];
        expect(images.length).toBe(4);
        expect(ingest).toHaveBeenCalledWith(images);
        for (const image of images) {
          expect(image.blob).toBe(original);
          expect((await (await fetch(image.url)).blob()).type).toBe(original.type);
        }
        expect(migration.convertToWebP).not.toHaveBeenCalled();
      });
    }
  }

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
        { provide: CharactersService, useValue: { activeCharacter: signal(null), recordLoaded: () => {}, takeImageHandoff: () => null, imageHandoffReady: new Subject<void>(), clearActiveCharacter: () => {} } },
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
