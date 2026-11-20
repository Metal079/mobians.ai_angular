import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AprilFoolsService } from 'src/app/april-fools.service';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { SharedService } from 'src/app/shared.service';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { GenerationOptionsPanelComponent } from './generation-options-panel.component';

describe('GenerationOptionsPanelComponent', () => {
  let fixture: ComponentFixture<GenerationOptionsPanelComponent>;
  let component: GenerationOptionsPanelComponent;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenerationOptionsPanelComponent],
      providers: [provideNoopAnimations(),
        { provide: StableDiffusionService, useValue: { getRegionalPromptPresets: () => of([]), syncRegionalPromptPresets: () => of({}) } },
        { provide: SharedService, useValue: { getImages: () => of([]) } },
        { provide: MessageService, useValue: { add: () => {} } },
        { provide: AprilFoolsService, useValue: { isAprilFools: () => false } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GenerationOptionsPanelComponent);
    component = fixture.componentInstance;
    component.modelSettings = [{model_id: 'test', display_name: 'Test', supports_regional_prompting: true}] as any;
    component.aspectRatio = {width:512, height:768, aspectRatio:'portrait', model:'test'};
    component.generationRequest = {model:'test', negative_prompt:'', guidance_scale:4, seed:-1,
      regional_prompting:{enabled:true, regions:[{id:'one', prompt:'Amy Rose', x:.49, y:.05, width:.45, height:.45, denoise_strength:1, feather:32, opacity:1, inherit_base_prompt:true}]}};
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  });
  it('shows a disabled loading selector and an actionable retry after failure', async () => {
    fixture.autoDetectChanges();
    fixture.componentRef.setInput('modelSettings', []);
    fixture.componentRef.setInput('modelsLoading', true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Loading available models');
    expect(fixture.nativeElement.querySelector('.model-select.p-disabled')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.model-load-status button')).toBeNull();

    fixture.componentRef.setInput('modelsLoading', false);
    fixture.componentRef.setInput('modelsLoadError', true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Models could not be loaded');
    const retry = spyOn(component.retryModels, 'emit');
    fixture.nativeElement.querySelector('.model-load-status button').click();
    expect(retry).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('modelsLoadError', false);
    fixture.componentRef.setInput('modelSettings', [{ model_id: 'test', display_name: 'Test', supports_regional_prompting: true }]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.model-load-status')).toBeNull();
    expect(fixture.nativeElement.querySelector('.model-select.p-disabled')).toBeNull();
  });

  it('saves intentional seed edits and clearing immediately', async () => {
    const saved: Array<number | null> = [];
    component.saveSettings.subscribe(() => saved.push(component.generationRequest.seed));
    const input = fixture.nativeElement.querySelector('#seedInput1') as HTMLInputElement;
    input.value = '0'; input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(saved).toEqual([0]);
    input.value = ''; input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(saved).toEqual([0, null]);
  });

  it('lets the visitor choose the buttons on their images', async () => {
    const key = 'mobians:result-image-buttons:v1';
    try {
      const box = (id: string) => fixture.nativeElement.querySelector('#resultButton-' + id) as HTMLInputElement;
      await fixture.whenStable();
      expect(['favorite', 'character', 'edit', 'video', 'download'].map(id => box(id).checked))
        .toEqual([false, false, false, true, true]);

      box('favorite').click();
      box('video').click();
      fixture.detectChanges(); await fixture.whenStable();

      expect(component.resultImageActions.enabled()).toEqual({ favorite: true, character: false, edit: false, video: false, download: true });
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ favorite: true, video: false });
    } finally {
      component.resultImageActions.reset();
    }
  });

  // Regional prompting lives only in the full-screen dialog (appended to body), opened by the Regions button beside
  // the prompt; the Options panel has no inline copy (owner request 2026-11-18).
  const openRegions = async () => {
    component.regionalEditor.openDialog();
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  };
  const closeRegions = async () => {
    component.closeRegionalDialog();
    fixture.detectChanges(); await fixture.whenStable();
  };

  it('has no regional editor in the panel; the dialog hosts it', async () => {
    expect(fixture.nativeElement.querySelector('app-regional-editor')).toBeNull();
    await openRegions();
    expect(document.querySelector('.regional-editor-dialog app-regional-editor')).not.toBeNull();
    await closeRegions();
    expect(document.querySelector('.regional-editor-dialog app-regional-editor')).toBeNull();
  });

  it('upgrades a version 1 regional config once', () => {
    const config = component.regionalConfig;
    expect(config.version).toBe(2);
    expect(config.regions[0]).toEqual(jasmine.objectContaining({ id: 'one', prompt: 'Amy Rose', strength: 1, inherit_base_prompt: true }));
    expect(component.generationRequest.regional_prompting).toBe(config);
    expect(component.regionalConfig).toBe(config);
  });

  it('keeps regions (paused) when the model does not support them', async () => {
    fixture.componentRef.setInput('modelSettings', [{ model_id: 'test', display_name: 'Test', supports_regional_prompting: false }]);
    await openRegions();
    expect(component.generationRequest.regional_prompting.enabled).toBeTrue();
    expect(document.querySelector('.regional-editor-dialog .rp-banner-paused')).not.toBeNull();
    await closeRegions();
  });
});
