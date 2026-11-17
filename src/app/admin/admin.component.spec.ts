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

  it('recognizes downloaded history entries as successful', () => {
    expect(component.getHistoryStatusIcon('downloaded')).toContain('text-success');
  });

  describe('LoRAs without a preview image', () => {
    beforeEach(() => {
      component.allLoras = [
        { id: 1, name: 'Has preview', image_url: '/lora-image/1?v=1' },
        { id: 2, name: 'My Melody', image_url: null },
        { id: 3, name: 'Clam', image_url: '' },
      ];
      component.updateNeedsPreviewCount();
      component.filterAllLoras();
    });

    it('counts them and filters the list down to them', () => {
      expect(component.needsPreviewCount).toBe(2);
      expect(component.filteredAllLoras.length).toBe(3);

      component.toggleNeedsPreviewFilter();
      expect(component.filteredAllLoras.map(r => r.id)).toEqual([2, 3]);

      component.toggleNeedsPreviewFilter();
      expect(component.filteredAllLoras.length).toBe(3);
    });

    it('opens the All LoRAs tab filtered to them from the header card', () => {
      component.adminTab = 2;

      component.showLorasNeedingPreview();

      expect(component.adminTab).toBe(0);
      expect(component.needsPreviewOnly).toBeTrue();
      expect(component.filteredAllLoras.map(r => r.id)).toEqual([2, 3]);
    });

    it('turns the filter off once the last one gets a preview', () => {
      component.showLorasNeedingPreview();
      component.allLoras[1].image_url = '/lora-image/2?v=2';
      component.allLoras[2].image_url = '/lora-image/3?v=3';

      component.updateNeedsPreviewCount();

      expect(component.needsPreviewCount).toBe(0);
      expect(component.needsPreviewOnly).toBeFalse();
    });
  });

  it('shows the missing-preview note on downloaded history entries', () => {
    const item = {
      lora_name: 'My Melody',
      version: 'Anima',
      status: 'downloaded',
      error_message: 'Needs a preview image: CivitAI provided none for this version',
      version_id: 2986306,
      downloaded_at: '2026-11-16T12:00:00Z',
    };

    expect(component.getDownloadFailureReason(item)).toBe(item.error_message);
    expect(component.isDownloadedWithNote(item)).toBeTrue();
    expect(component.getDownloadFailureReason({ ...item, error_message: null })).toBe('Completed successfully');
    expect(component.isDownloadedWithNote({ ...item, error_message: null })).toBeFalse();
  });

  it('explains legacy download failures that lack upstream details', () => {
    const reason = component.getDownloadFailureReason({
      lora_name: 'Legacy LoRA',
      version: 'v1',
      status: 'failed',
      error_message: 'Download failed after retries',
      version_id: 123,
      downloaded_at: '2026-08-16T12:00:00Z',
    });

    expect(reason).toContain('legacy entry');
    expect(reason).toContain('upstream error details');
  });
});
