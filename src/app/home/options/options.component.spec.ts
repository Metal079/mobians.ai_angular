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
import { StableDiffusionService } from 'src/app/stable-diffusion.service';

import { OptionsComponent } from './options.component';

class StableDiffusionServiceStub {
  getLoras() {
    return of([]);
  }

  getLoraPreferences() {
    return of([]);
  }
}

class SharedServiceStub {
  setGenerationRequest() {}
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
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses the SDXL-sized defaults for Anima-preview3', () => {
    expect((component as any).usesSdxlResolutionDefaults('Anima-preview3')).toBeTrue();
    expect((component as any).supportsRegionalPrompting('Anima-preview3')).toBeTrue();
  });

  it('maps the legacy Anima-preview2 id to Anima-preview3', () => {
    expect((component as any).normalizeModelId('Anima-preview2')).toBe('Anima-preview3');
    expect((component as any).usesSdxlResolutionDefaults('Anima-preview2')).toBeTrue();
    expect((component as any).supportsRegionalPrompting('Anima-preview2')).toBeTrue();
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
});
