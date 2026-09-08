import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';
import { CharacterLookSettingsComponent, characterModelName } from './character-look-settings.component';
import { StableDiffusionService } from '../stable-diffusion.service';
import { recipeFromImage } from './characters.service';

describe('Character look settings', () => {
  const models: any[] = [
    { model_id: 'novaMobianXL_v20', display_name: 'novaMobianXL_v20', base_model: 'Illustrious', is_active: true },
    { model_id: 'anima', display_name: 'Anima', base_model: 'Anima', is_active: true },
    { model_id: 'retired', display_name: 'Retired', base_model: 'Illustrious', is_active: false },
  ];
  const loras = [
    { id: 7, version_id: 19, name: 'Fox', base_model: 'Illustrious', trigger_words: ['fox character'] },
    { id: 8, version_id: 20, name: 'Fox Anima', base_model: 'Anima' },
    { id: 9, version_id: 21, name: 'Private style', base_model: 'Illustrious', is_nsfw: true },
  ];
  let component: CharacterLookSettingsComponent;
  let getLoras: jasmine.Spy;
  beforeEach(async () => {
    getLoras = jasmine.createSpy('getLoras').and.returnValue(of(loras));
    TestBed.configureTestingModule({ providers: [{ provide: StableDiffusionService, useValue: { getLoras } }, { provide: ChangeDetectorRef, useValue: { markForCheck: () => {} } }] });
    component = TestBed.runInInjectionContext(() => new CharacterLookSettingsComponent());
    component.models = models;
    component.recipe = recipeFromImage({ UUID: 'test', model: 'novaMobianXL_v10', prompt: 'blue fox', width: 512, height: 512, aspectRatio: 'square' });
    await component.loadLoras();
  });
  it('requires explicit selection for a legacy model and uses a friendly name', () => {
    expect(component.model).toBeUndefined();
    expect(component.recipe.model).toBe('novaMobianXL_v10');
    component.changeModel('novaMobianXL_v20');
    expect(component.recipe.model).toBe('novaMobianXL_v20');
    expect(characterModelName(models[0])).toBe('Nova Mobian XL v2');
    expect(component.activeModels.length).toBe(2);
  });
  it('does not describe a saved model as retired while the catalog is unavailable', () => {
    const fixture = TestBed.createComponent(CharacterLookSettingsComponent);
    fixture.componentRef.setInput('recipe', component.recipe);
    fixture.componentRef.setInput('catalogReady', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('This saved model is unavailable');
    expect(fixture.nativeElement.textContent).toContain('waiting for catalog');
    fixture.componentRef.setInput('catalogReady', true); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This saved model is unavailable');
    fixture.destroy();
  });
  it('filters by model and excludes NSFW by default', () => {
    component.changeModel('novaMobianXL_v20');
    expect(component.results.map(l => l.id)).toEqual([7]);
    component.showNsfw = true;
    expect(component.results.map(l => l.id)).toEqual([7, 9]);
    component.query = 'Private'; expect(component.results.map(l => l.id)).toEqual([9]);
  });
  it('falls back when a preview fails without affecting LoRA selection', () => {
    component.changeModel('novaMobianXL_v20');
    const lora = { ...loras[0], image_url: '/assets/Sanic.webp' };
    expect(component.previewUrl(lora)).toBe('/assets/Sanic.webp');
    component.previewFailed(lora);
    expect(component.previewUrl(lora)).toBe('');
    expect(component.previewUrl(loras[1])).toBe('');
    component.add(lora);
    expect(component.recipe.loras[0].version_id).toBe(19);
    expect(component.recipe.loras[0].image_url).toBeUndefined();
  });
  it('adds a LoRA once and keeps editable strength without copying paths', () => {
    component.changeModel('novaMobianXL_v20');
    component.add(loras[0]); component.add(loras[0]); component.add(loras[1]);
    expect(component.recipe.loras).toEqual([{ id: 7, version_id: 19, name: 'Fox', strength: 1 }]);
    component.recipe.loras[0].strength = .65;
    component.addTriggers(component.recipe.loras[0]); component.addTriggers(component.recipe.loras[0]);
    expect(component.recipe.appearance).toBe('blue fox, fox character');
    expect(component.recipe.loras[0].strength).toBe(.65);
    component.remove(0); expect(component.recipe.loras).toEqual([]);
  });
  it('retains known compatible LoRAs when replacing an unknown older model', () => {
    component.recipe.loras = [{ id: 7, version_id: 19, strength: .7 }];
    component.changeModel('novaMobianXL_v20');
    expect(component.recipe.loras[0].strength).toBe(.7);
  });
  it('clears incompatible selections on an explicit model-family change and explains it', () => {
    component.changeModel('novaMobianXL_v20'); component.add(loras[0]);
    component.changeModel('anima');
    expect(component.recipe.loras).toEqual([]);
    expect(component.modelNotice).toContain('1 LoRA selection(s) were cleared');
  });
  it('keeps saved LoRAs if the catalog fails and supports retry', async () => {
    component.recipe.loras = [{ id: 7, strength: .4 }];
    getLoras.and.returnValue(throwError(() => new Error('offline')));
    await component.loadLoras(); expect(component.loadError).toContain('saved selections are kept');
    expect(component.recipe.loras[0].strength).toBe(.4);
    getLoras.and.returnValue(of(loras)); await component.loadLoras(); expect(component.loadError).toBe('');
  });
  it('does not mutate settings while saving', () => {
    component.disabled = true;
    component.changeModel('novaMobianXL_v20'); component.add(loras[0]);
    expect(component.recipe.model).toBe('novaMobianXL_v10'); expect(component.recipe.loras).toEqual([]);
  });
  it('can detach model and LoRAs without changing the prompts', () => {
    component.changeModel('novaMobianXL_v20'); component.add(loras[0]);
    component.changeModel('');
    expect(component.recipe.model).toBe(''); expect(component.recipe.loras).toEqual([]);
    expect(component.recipe.appearance).toBe('blue fox');
  });
});
