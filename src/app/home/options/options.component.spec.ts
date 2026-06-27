import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
  getDynamicPromptLibrary() {
    return of(dynamicPromptLibraryResponse);
  }

  getLoras() {
    return of([]);
  }

  getLoraPreferences() {
    return of([]);
  }
}

class SharedServiceStub {
  setGenerationRequest() {}
  setPrompt() {}
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
}
class AuthServiceStub {
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
    TestBed.inject(DynamicPromptLibraryStateService).library.set(dynamicPromptLibraryResponse);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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

    component.changeModel({ target: { value: 'Anima-baseV1' } } as any);

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
