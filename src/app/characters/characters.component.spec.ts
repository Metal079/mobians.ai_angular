import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, RouterLink, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { AccountCtaService } from '../auth/account-cta.service';
import { GenerationModeSwitchComponent } from '../generation-mode-switch/generation-mode-switch.component';
import { ImageHistoryPanelComponent } from '../home/options/image-history-panel/image-history-panel.component';
import { SharedService } from '../shared.service';
import { StableDiffusionService } from '../stable-diffusion.service';
import { CharacterLookSettingsComponent } from './character-look-settings.component';
import { CharactersComponent } from './characters.component';
import { CharacterDetail, CharacterRecipe, CharactersService } from './characters.service';

function savedCharacter(): CharacterDetail {
  const recipe: CharacterRecipe = {
    label: 'Original look', appearance: 'blue fox, green eyes', scene: '',
    model: '', loras: [], negative_prompt: 'blurry', guidance_scale: 4, width: 512, height: 512,
  };
  return {
    id: 'ash', name: 'Ash', default_image_id: 'forest',
    images: [
      { id: 'forest', recipe, thumbnail: '', created_at: '' },
      { id: 'jacket', recipe: { ...recipe, label: 'Red jacket' }, thumbnail: '', created_at: '' },
    ],
  };
}

describe('CharactersComponent', () => {
  let fixture: ComponentFixture<CharactersComponent>;
  let component: CharactersComponent;
  let service: any;
  let user: BehaviorSubject<any>;
  let params: BehaviorSubject<any>;

  beforeEach(async () => {
    user = new BehaviorSubject({ token: 'alice' });
    params = new BehaviorSubject(convertToParamMap({ id: 'ash' }));
    service = {
      owner: 'alice', saved: new Subject<string>(),
      list: jasmine.createSpy('list').and.resolveTo({ characters: [{ id: 'ash', name: 'Ash', image_count: 2, thumbnail: null, updated_at: '' }] }),
      get: jasmine.createSpy('get').and.callFake(async () => savedCharacter()),
      media: jasmine.createSpy('media').and.resolveTo(new Blob(['image'], { type: 'image/webp' })),
      useImage: jasmine.createSpy('useImage').and.resolveTo(),
      setDefault: jasmine.createSpy('setDefault').and.callFake(async (_id: string, imageId: string) => ({ id: 'ash', default_image_id: imageId })),
      updateRecipe: jasmine.createSpy('updateRecipe').and.callFake(async (_id: string, _imageId: string, recipe: CharacterRecipe) => ({ recipe: structuredClone(recipe) })),
      requestSave: jasmine.createSpy('requestSave'),
    };
    await TestBed.configureTestingModule({
      imports: [CharactersComponent],
      providers: [
        provideNoopAnimations(),
        { provide: CharactersService, useValue: service },
        { provide: SharedService, useValue: { getUserData: () => user.asObservable() } },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable(), snapshot: { get paramMap() { return params.value; } } } },
        { provide: Router, useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true) } },
        { provide: AccountCtaService, useValue: { requestLogin: jasmine.createSpy('requestLogin') } },
        { provide: StableDiffusionService, useValue: { getGenerationModels: () => of({ models: [] }) } },
      ],
    }).overrideComponent(CharactersComponent, {
      remove: { imports: [RouterLink, GenerationModeSwitchComponent, ImageHistoryPanelComponent, CharacterLookSettingsComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    }).compileComponents();
    fixture = TestBed.createComponent(CharactersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  async function enter(selector: string, value: string): Promise<void> {
    // Newly opened dialog forms register their controls in a microtask.
    await fixture.whenStable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    expect(input).withContext(`Expected ${selector} to be rendered`).not.toBeNull();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('uses a one-off scene from the form without dirtying or persisting the saved look', async () => {
    const saved = structuredClone(component.selected()!.recipe);
    await enter('#next-scene', 'wearing a yellow raincoat at the beach');

    expect(component.dirty()).toBeFalse();
    expect(component.recipe).toEqual(saved);
    expect(component.selected()!.recipe).toEqual(saved);
    await component.use('create');

    expect(service.useImage).toHaveBeenCalledOnceWith(component.character(), component.selected(), 'create', { scene: 'wearing a yellow raincoat at the beach' });
    expect(service.updateRecipe).not.toHaveBeenCalled();
    expect(component.selected()!.recipe.scene).toBe('');
  });

  it('allows creating with just the saved look prompt', async () => {
    await enter('#next-scene', '');
    await component.use('edit');
    expect(service.useImage).toHaveBeenCalledWith(component.character(), component.selected(), 'edit', { scene: '' });
    expect(component.dirty()).toBeFalse();
  });

  it('starts with an empty scene when selecting another look', async () => {
    await enter('#next-scene', 'a temporary beach scene');
    await component.chooseLook({ characterId: 'ash', imageId: 'jacket', name: 'Ash' });
    fixture.detectChanges();
    expect(component.selected()!.id).toBe('jacket');
    expect(component.nextScene).toBe('');
    expect(component.dirty()).toBeFalse();
    expect(service.updateRecipe).not.toHaveBeenCalled();
  });

  it('persists the selected default before reordering the character’s looks', async () => {
    component.selectLook('jacket');
    let resolve!: (result: any) => void;
    service.setDefault.and.returnValue(new Promise(done => resolve = done));
    const changing = component.makeDefault();
    expect(service.setDefault).toHaveBeenCalledOnceWith('ash', 'jacket');
    expect(component.character()!.images[0].id).toBe('forest');
    expect(component.character()!.default_image_id).toBe('forest');
    resolve({ id: 'ash', default_image_id: 'jacket' });
    await changing;
    expect(component.character()!.default_image_id).toBe('jacket');
    expect(component.character()!.images.map(image => image.id)).toEqual(['jacket', 'forest']);
    expect(component.isDefault(component.selected()!)).toBeTrue();
    expect(component.notice()).toContain('Default look updated');
    await component.makeDefault();
    expect(service.setDefault).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous default and selected look when the default API fails', async () => {
    component.selectLook('jacket');
    service.setDefault.and.rejectWith({ error: { detail: 'Could not update this default. Try again.' } });
    await component.makeDefault();
    expect(component.character()!.default_image_id).toBe('forest');
    expect(component.character()!.images.map(image => image.id)).toEqual(['forest', 'jacket']);
    expect(component.selected()!.id).toBe('jacket');
    expect(component.error()).toContain('Could not update this default');
    expect(component.busy()).toBeFalse();
  });

  it('opens the default look directly from a collection card', async () => {
    await component.quickCreate(component.characters()[0]);
    expect(service.useImage).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'ash' }), jasmine.objectContaining({ id: 'forest' }), 'create');
    expect(service.updateRecipe).not.toHaveBeenCalled();
  });

  it('cancels a collection handoff if the account changes while its detail is loading', async () => {
    let resolve!: (result: CharacterDetail) => void;
    service.get.and.returnValue(new Promise(done => resolve = done));
    const opening = component.quickCreate(component.characters()[0]);
    service.owner = '';
    user.next(null);
    resolve(savedCharacter());
    await opening;
    expect(service.useImage).not.toHaveBeenCalled();
    expect(component.character()).toBeNull();
    expect(component.characters()).toEqual([]);
    expect(component.selected()).toBeNull();
    expect(component.signedIn()).toBeFalse();
    expect(component.busy()).toBeFalse();
  });

  it('discards edits through the editor action without changing the saved look or one-off scene', async () => {
    await enter('#next-scene', 'a temporary beach scene');
    const saved = structuredClone(component.selected()!.recipe);
    component.editingOpen.set(true);
    fixture.detectChanges();
    await enter('#character-appearance', 'red fox, blue eyes');
    expect(component.dirty()).toBeTrue();
    const discard = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.trim() === 'Discard changes');
    expect(discard).toBeTruthy();
    discard!.click();
    fixture.detectChanges();
    expect(component.recipe).toEqual(saved);
    expect(component.selected()!.recipe).toEqual(saved);
    expect(component.nextScene).toBe('a temporary beach scene');
    expect(component.dirty()).toBeFalse();
    expect(component.editingOpen()).toBeFalse();
    expect(service.updateRecipe).not.toHaveBeenCalled();
  });

  it('retains unsaved edits in the open editor when saving fails', async () => {
    component.editingOpen.set(true);
    fixture.detectChanges();
    await enter('#character-appearance', 'blue fox, silver jacket');
    service.updateRecipe.and.rejectWith({ error: { detail: 'Connection interrupted. Please retry.' } });
    await component.saveRecipe();
    expect(component.recipe!.appearance).toBe('blue fox, silver jacket');
    expect(component.selected()!.recipe.appearance).toBe('blue fox, green eyes');
    expect(component.dirty()).toBeTrue();
    expect(component.editingOpen()).toBeTrue();
    expect(component.busy()).toBeFalse();
    expect(component.error()).toContain('Connection interrupted');
  });

  it('saves look edits without persisting a one-off scene', async () => {
    await enter('#next-scene', 'a temporary beach scene');
    component.editingOpen.set(true);
    fixture.detectChanges();
    await enter('#character-appearance', 'blue fox, silver jacket');
    await component.saveRecipe();
    expect(service.updateRecipe).toHaveBeenCalledWith('ash', 'forest', jasmine.objectContaining({ appearance: 'blue fox, silver jacket', scene: '' }));
    expect(component.selected()!.recipe.appearance).toBe('blue fox, silver jacket');
    expect(component.nextScene).toBe('a temporary beach scene');
    expect(component.editingOpen()).toBeFalse();
    expect(component.dirty()).toBeFalse();
  });

  it('retains the entered scene after a failed generator handoff so it can be retried', async () => {
    await enter('#next-scene', 'a temporary beach scene');
    service.useImage.and.rejectWith(new Error('Finish your current image job first.'));
    await component.use('create');
    expect(component.nextScene).toBe('a temporary beach scene');
    expect(component.selected()!.id).toBe('forest');
    expect(component.dirty()).toBeFalse();
    expect(component.busy()).toBeFalse();
    expect(component.error()).toContain('Finish your current image job');
  });

  it('offers one saved prompt with no scene editor and an empty temporary scene', async () => {
    component.editingOpen.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#character-scene')).toBeNull();
    expect(fixture.nativeElement.querySelector('#character-appearance')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('label[for="next-scene"]').textContent).toContain('Scene for this image');
    expect(component.nextScene).toBe('');
  });
});
