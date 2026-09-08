import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AprilFoolsService } from 'src/app/april-fools.service';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { GenerationOptionsPanelComponent } from './generation-options-panel.component';

describe('Regional precision controls', () => {
  let fixture: ComponentFixture<GenerationOptionsPanelComponent>;
  let component: GenerationOptionsPanelComponent;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenerationOptionsPanelComponent],
      providers: [provideNoopAnimations(),
        { provide: StableDiffusionService, useValue: {} },
        { provide: AprilFoolsService, useValue: { isAprilFools: () => false } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GenerationOptionsPanelComponent);
    component = fixture.componentInstance;
    component.modelSettings = [{model_id: 'test', display_name: 'Test', supports_regional_prompting: true}] as any;
    component.aspectRatio = {width:512, height:768, aspectRatio:'portrait', model:'test'};
    component.generationRequest = {model:'test', negative_prompt:'', guidance_scale:4, seed:-1,
      regional_prompting:{enabled:true, regions:[{id:'one', prompt:'Amy Rose', x:.49, y:.05, width:.45, height:.45, denoise_strength:1, feather:32, opacity:1, inherit_base_prompt:true}]}};
    component.workspaceExpanded = true;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  });
  function numberInput(key: string): HTMLInputElement { return fixture.nativeElement.querySelector('#region-value-' + key); }
  function commit(key: string, value: string): void {
    const input = numberInput(key); input.value = value;
    input.dispatchEvent(new Event('change')); fixture.detectChanges();
  }
  it('commits exactly 50 percent to the request and preview after typing the complete value', () => {
    const save = spyOn(component.saveSettings, 'emit');
    const input = numberInput('x'); input.value = '5'; input.dispatchEvent(new Event('input'));
    expect(component.selectedRegion!.x).toBe(.49); expect(save).not.toHaveBeenCalled();
    commit('x', '50');
    expect(component.generationRequest.regional_prompting.regions[0].x).toBe(.5);
    expect(fixture.nativeElement.querySelector('.regional-preview-box').style.left).toBe('50%');
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('restores an empty or invalid entry without moving the region', () => {
    const save = spyOn(component.saveSettings, 'emit');
    commit('x', ''); expect(numberInput('x').value).toBe('49');
    commit('x', 'invalid'); expect(numberInput('x').value).toBe('49');
    expect(component.selectedRegion!.x).toBe(.49); expect(save).not.toHaveBeenCalled();
  });
  it('keeps dimensions and position within the image boundaries', () => {
    commit('width', '150');
    expect(component.selectedRegion!.width).toBe(1); expect(component.selectedRegion!.x).toBe(0);
    expect(numberInput('width').value).toBe('100'); expect(numberInput('x').value).toBe('0');
    commit('height', '-10'); expect(component.selectedRegion!.height).toBe(.05);
    commit('y', '100'); expect(component.selectedRegion!.y).toBe(.95);
  });
  it('synchronizes slider changes with the exact-value field', async () => {
    const slider = fixture.nativeElement.querySelector('[aria-label="X slider"]') as HTMLInputElement;
    slider.value = '50'; slider.dispatchEvent(new Event('input'));
    await fixture.whenStable(); fixture.detectChanges();
    expect(component.selectedRegion!.x).toBe(.5); expect(numberInput('x').value).toBe('50');
  });
  it('uses the same steps for influence and edge softness as the sliders', () => {
    commit('denoise_strength', '0.76'); commit('feather', '35');
    expect(component.selectedRegion!.denoise_strength).toBe(.75);
    expect(component.selectedRegion!.feather).toBe(36);
  });
  it('does not apply precision edits when regional prompting is disabled', () => {
    component.generationRequest.regional_prompting.enabled = false; fixture.detectChanges();
    expect(numberInput('x').disabled).toBeTrue(); commit('x', '50');
    expect(component.selectedRegion!.x).toBe(.49);
  });
});
