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

const dynamicPromptLibraryResponse: DynamicPromptLibraryResponse = {
  wildcard_set: 'mobians-v1',
  categories: [
    {
      id: 'mobian/characters',
      label: 'Characters',
      token: '__mobian/characters__',
      description: 'Character ideas',
      examples: ['Sonic'],
    },
    {
      id: 'mobian/poses',
      label: 'Poses',
      token: '__mobian/poses__',
      description: 'Pose ideas',
      examples: ['heroic pose'],
    },
    {
      id: 'sonicfan/mood-ideas',
      label: 'Mood Ideas',
      token: '__sonicfan/mood-ideas__',
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
    TestBed.inject(DynamicPromptLibraryStateService).library.set(dynamicPromptLibraryResponse);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses the SDXL-sized defaults for Anima-preview3', () => {
    expect((component as any).usesSdxlResolutionDefaults('Anima-preview3')).toBeTrue();
    expect((component as any).supportsRegionalPrompting('Anima-preview3')).toBeTrue();
  });

  it('calculates Anima-preview3 credit costs with LoRAs', () => {
    component.generationRequest.model = 'Anima-preview3';
    component.generationRequest.loras = [{}, {}];

    component.updateCreditCost();

    expect(component.creditCost).toBe(30);
    expect(component.upscaleCreditCost).toBe(90);
    expect(component.hiresCreditCost).toBe(120);
  });

  it('keeps regional prompting enabled for Anima-preview3 while keeping its default CFG', () => {
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

    component.changeModel({ target: { value: 'Anima-preview3' } } as any);

    expect(component.generationRequest.guidance_scale).toBe(6);
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
    component.generationRequest.prompt = 'A portrait of __mobian/characters__';
    component.generationRequest.dynamic_prompting = { enabled: false };

    component.onPromptInputChange();
    const config = (component as any).getDynamicPromptingForRequest();

    expect(component.isDynamicPromptActive()).toBeTrue();
    expect(component.generationRequest.dynamic_prompting?.enabled).toBeTrue();
    expect(config.enabled).toBeTrue();
    expect(config.template).toBe('A portrait of __mobian/characters__');
  });

  it('treats legacy custom category alias tokens as unknown wildcards', () => {
    component.generationRequest.prompt = 'A portrait with __custom/bffde430-c3d5-4f9f-9560-0b1049c9e143__';
    component.generationRequest.dynamic_prompting = { enabled: false };

    const config = (component as any).getDynamicPromptingForRequest();
    const highlighted = component.getDynamicPromptHighlightHtml();

    expect(component.isDynamicPromptActive()).toBeFalse();
    expect(config.enabled).toBeFalse();
    expect(highlighted).toContain('__custom/bffde430-c3d5-4f9f-9560-0b1049c9e143__');
    expect(highlighted).not.toContain('<span class="dynamic-prompt-token">__custom/bffde430-c3d5-4f9f-9560-0b1049c9e143__</span>');
  });

  it('keeps unknown wildcard tokens inactive when they are the only syntax', () => {
    component.generationRequest.prompt = 'A portrait of __mobian/not-real__';
    component.generationRequest.dynamic_prompting = { enabled: false };

    const config = (component as any).getDynamicPromptingForRequest();
    const highlighted = component.getDynamicPromptHighlightHtml();

    expect(component.isDynamicPromptActive()).toBeFalse();
    expect(config.enabled).toBeFalse();
    expect(highlighted).toContain('__mobian/not-real__');
    expect(highlighted).not.toContain('<span class="dynamic-prompt-token">__mobian/not-real__</span>');
  });

  it('highlights only dynamic prompt syntax tokens', () => {
    component.generationRequest.prompt = 'A <hero> {heroic|playful} with __mobian/characters__';

    const highlighted = component.getDynamicPromptHighlightHtml();

    expect(highlighted).toContain('A &lt;hero&gt; ');
    expect(highlighted).toContain('<span class="dynamic-prompt-token">{heroic|playful}</span>');
    expect(highlighted).toContain('<span class="dynamic-prompt-token">__mobian/characters__</span>');
    expect(highlighted).not.toContain('<span class="dynamic-prompt-token">A &lt;hero&gt;</span>');
  });

  it('highlights known wildcard tokens while leaving unknown tokens normal', () => {
    component.generationRequest.prompt = '__mobian/characters__ and __mobian/not-real__';

    const highlighted = component.getDynamicPromptHighlightHtml();

    expect(highlighted).toContain('<span class="dynamic-prompt-token">__mobian/characters__</span>');
    expect(highlighted).toContain(' and __mobian/not-real__');
    expect(highlighted).not.toContain('<span class="dynamic-prompt-token">__mobian/not-real__</span>');
  });
});
