import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { AdminComponent } from './admin.component';
import { AuthService } from '../auth/auth.service';
import { StableDiffusionService } from '../stable-diffusion.service';

class StableDiffusionServiceStub {
  uploadManualLora = jasmine.createSpy('uploadManualLora').and.returnValue(of({ lora: { name: 'Manual Sonic' } }));
}

class AuthServiceStub {
  isAdmin() {
    return true;
  }
}

class RouterStub {
  navigate = jasmine.createSpy('navigate');
}

describe('AdminComponent manual LoRA upload', () => {
  let component: AdminComponent;
  let fixture: ComponentFixture<AdminComponent>;
  let sdService: StableDiffusionServiceStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        { provide: StableDiffusionService, useClass: StableDiffusionServiceStub },
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: Router, useClass: RouterStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(AdminComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    sdService = TestBed.inject(StableDiffusionService) as unknown as StableDiffusionServiceStub;
  });

  it('accepts safetensors files and prefills name from the filename', () => {
    const file = new File(['12345678{}'], 'Manual Sonic.safetensors');
    const event = { target: { files: [file], value: '' } } as unknown as Event;

    component.onManualLoraFileSelected(event);

    expect(component.manualLoraModelFile).toBe(file);
    expect(component.manualLoraForm.name).toBe('Manual Sonic');
  });

  it('rejects non-safetensors model files', () => {
    const messageService = (component as any).messageService;
    spyOn(messageService, 'add');
    const event = { target: { files: [new File(['bad'], 'not-a-lora.txt')], value: 'not-a-lora.txt' } } as unknown as Event;

    component.onManualLoraFileSelected(event);

    expect(component.manualLoraModelFile).toBeNull();
    expect(messageService.add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'warn' }));
  });

  it('submits metadata and files through the service', () => {
    const modelFile = new File(['12345678{}'], 'manual.safetensors');
    const previewFile = new File(['preview'], 'preview.png', { type: 'image/png' });
    component.manualLoraDialogVisible = true;
    component.manualLoraModelFile = modelFile;
    component.manualLoraPreviewFile = previewFile;
    component.manualLoraForm = {
      name: 'Manual Sonic',
      version: 'v1.0',
      baseModel: 'Illustrious',
      triggerWords: 'sonic, manual',
      creator: 'Admin',
      description: 'Uploaded from admin UI',
      isNsfw: true,
    };
    spyOn(component, 'loadAllLoras');

    component.submitManualLora();

    expect(sdService.uploadManualLora).toHaveBeenCalledWith(jasmine.objectContaining({
      file: modelFile,
      previewImage: previewFile,
      name: 'Manual Sonic',
      version: 'v1.0',
      baseModel: 'Illustrious',
      isNsfw: true,
    }));
    expect(component.manualLoraDialogVisible).toBeFalse();
    expect(component.loadAllLoras).toHaveBeenCalled();
  });

  it('does not build CivitAI links for generated manual ids', () => {
    expect(component.getCivitAILink({ version_id: -1 })).toBeNull();
    expect(component.hasCivitAILink({ version_id: -1 })).toBeFalse();
  });
});
