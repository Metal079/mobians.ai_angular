import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { CharacterSaveDialogComponent } from './character-save-dialog.component';
import { CharactersService, recipeFromImage } from './characters.service';
import { SharedService } from '../shared.service';
import { StableDiffusionService } from '../stable-diffusion.service';

describe('Saving a character', () => {
  let component: CharacterSaveDialogComponent;
  let fixture: ComponentFixture<CharacterSaveDialogComponent>;
  let service: any;
  let user: BehaviorSubject<any>;
  let sd: any;
  const image = { UUID: 'old-image', model: 'novaMobianXL_v10', prompt: 'Amy Rose', width: 512, height: 512, aspectRatio: 'square', blob: new Blob(['original pixels'], { type: 'image/png' }) };
  const summary = { id: 'existing', name: 'Amy Rose', image_count: 2, updated_at: '', thumbnail: '' };
  beforeEach(async () => {
    user = new BehaviorSubject({ token: 'account' });
    service = { owner: 'account', saveRequests: new Subject(), saved: new Subject(),
      list: jasmine.createSpy().and.resolveTo({ characters: [] }), save: jasmine.createSpy().and.resolveTo({ id: 'character', image_id: 'new-look' }),
      get: jasmine.createSpy(), useImage: jasmine.createSpy().and.resolveTo() };
    sd = { getGenerationModels: jasmine.createSpy().and.returnValue(of({ models: [{ model_id: 'novaMobianXL_v20', is_active: true }] })), getLoras: () => of([]) };
    await TestBed.configureTestingModule({ imports: [CharacterSaveDialogComponent], providers: [
      provideRouter([]), provideNoopAnimations(),
      { provide: CharactersService, useValue: service },
      { provide: SharedService, useValue: { getUserData: () => user } },
      { provide: StableDiffusionService, useValue: sd },
    ] }).compileComponents();
    fixture = TestBed.createComponent(CharacterSaveDialogComponent);
    component = fixture.componentInstance;
    await component.open(image); component.name = 'Amy Rose';
  });
  afterEach(() => { fixture.destroy(); });

  it('makes naming and saving sufficient without exposing prompt or model fields', async () => {
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#save-character-name')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#save-character-appearance')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-character-look-settings')).toBeNull();
    expect(component.recipe.model).toBe(''); expect(component.recipe.loras).toEqual([]);
    await component.save();
    const [name, recipe] = service.save.calls.mostRecent().args;
    expect(name).toBe('Amy Rose'); expect(recipe.appearance).toBe('Amy Rose');
    expect(recipe.model).toBe(''); expect(recipe.label).toBe('Original look');
  });

  it('reveals prompt editing only when requested and preserves those edits on save', async () => {
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[aria-controls="save-prompt-details"]') as HTMLButtonElement).click();
    fixture.detectChanges(); await fixture.whenStable();
    const prompt = fixture.nativeElement.querySelector('#save-character-appearance') as HTMLTextAreaElement;
    expect(fixture.nativeElement.querySelector('#save-character-scene')).toBeNull();
    prompt.value = 'Amy Rose, green eyes'; prompt.dispatchEvent(new Event('input'));
    await fixture.whenStable(); await component.save();
    expect(service.save.calls.mostRecent().args[1].appearance).toBe('Amy Rose, green eyes');
    expect(service.save.calls.mostRecent().args[1].scene).toBe('');
  });

  it('retains the prompt editor when collapsed and removes its controls from keyboard navigation', async () => {
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector('[aria-controls="save-prompt-details"]') as HTMLButtonElement;
    toggle.click(); fixture.detectChanges(); await fixture.whenStable();
    const prompt = fixture.nativeElement.querySelector('#save-character-appearance') as HTMLTextAreaElement;
    prompt.value = 'Amy Rose, bangs'; prompt.dispatchEvent(new Event('input')); await fixture.whenStable();
    toggle.click(); fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('#save-prompt-details') as HTMLElement;
    expect(panel.inert).toBeTrue(); expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click(); fixture.detectChanges();
    expect(panel.inert).toBeFalse(); expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('#save-character-appearance')).toBe(prompt);
    expect(prompt.value).toBe('Amy Rose, bangs');
    await component.save(); expect(service.save.calls.mostRecent().args[1].appearance).toBe('Amy Rose, bangs');
  });

  it('keeps LoRA search state when the model section is closed and reopened', async () => {
    sd.getLoras = jasmine.createSpy().and.returnValue(of([]));
    component.recipe.model = 'novaMobianXL_v20'; fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector('[aria-controls="save-model-details"]') as HTMLButtonElement;
    toggle.click(); fixture.detectChanges(); await fixture.whenStable();
    (fixture.nativeElement.querySelector('[aria-controls="save-look-loras"]') as HTMLButtonElement).click();
    fixture.detectChanges(); await fixture.whenStable();
    const search = fixture.nativeElement.querySelector('#save-look-lora-search') as HTMLInputElement;
    search.value = 'amy'; search.dispatchEvent(new Event('input')); await fixture.whenStable();
    toggle.click(); fixture.detectChanges(); toggle.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#save-look-lora-search')).toBe(search);
    expect(search.value).toBe('amy'); expect(sd.getLoras).toHaveBeenCalledTimes(1);
  });

  it('shows the prompt field immediately if the source has no prompt', async () => {
    await component.open({ ...image, prompt: '' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#save-character-appearance')).not.toBeNull();
    component.name = 'Amy'; await component.save(); expect(service.save).not.toHaveBeenCalled();
  });

  it('does not wait for the optional model catalog before permitting a prompt-only save', async () => {
    const catalog = new Subject<any>(); sd.getGenerationModels.and.returnValue(catalog);
    const opening = component.open(image); await Promise.resolve();
    component.name = 'Amy';
    expect(component.loading()).toBeFalse(); expect(component.loadingModels()).toBeTrue();
    await component.save(); expect(service.save).toHaveBeenCalled();
    catalog.next({ models: [] }); catalog.complete(); await opening;
  });

  it('adds to an existing character with an automatic look name', async () => {
    service.list.and.resolveTo({ characters: [summary] });
    await component.open(image, 'existing');
    expect(component.recipe.label).toBe('Look 3'); await component.save();
    const [, recipe, , id] = service.save.calls.mostRecent().args;
    expect(id).toBe('existing'); expect(recipe.label).toBe('Look 3'); expect(component.savedName).toBe('Amy Rose');
  });

  it('keeps a custom look name when changing which character receives it', async () => {
    component.characters = [summary]; component.recipe.label = 'Raincoat';
    component.changeTarget('existing'); expect(component.recipe.label).toBe('Raincoat');
    component.changeTarget(''); expect(component.recipe.label).toBe('Raincoat');
  });

  it('still blocks an explicitly attached obsolete model', async () => {
    component.recipe.model = 'novaMobianXL_v10';
    expect(component.setupReady).toBeFalse(); await component.save(); expect(service.save).not.toHaveBeenCalled();
  });

  it('offers original model and LoRAs only by explicit choice, when the model is available', async () => {
    const loras = [{ id: 7, version_id: 19, strength: .65, name: 'Amy' }];
    await component.open({ ...image, model: 'novaMobianXL_v20', loras }); component.name = 'Amy Rose';
    expect(component.recipe.loras).toEqual([]); expect(component.canUseImageSettings).toBeTrue();
    component.useImageSettings(); await component.save();
    const [name, recipe, encoded] = service.save.calls.mostRecent().args;
    expect(name).toBe('Amy Rose'); expect(recipe.model).toBe('novaMobianXL_v20');
    expect(recipe.loras[0].strength).toBe(.65); expect(atob(encoded.split(',')[1])).toBe('original pixels');
    recipe.loras[0].strength = 1.2; expect(loras[0].strength).toBe(.65);
  });

  it('rejects invalid LoRA strengths before sending a save', async () => {
    component.recipe.model = 'novaMobianXL_v20'; component.recipe.loras = [{ id: 7, strength: null }];
    await component.save(); expect(service.save).not.toHaveBeenCalled();
  });

  it('opens exactly the newly saved look from the success action', async () => {
    const oldLook = { id: 'old-look', recipe: recipeFromImage(image), thumbnail: '', created_at: '' };
    const newLook = { ...oldLook, id: 'new-look' };
    const character = { id: 'character', name: 'Amy', images: [oldLook, newLook] };
    service.get.and.resolveTo(character); await component.save(); await component.createFromSaved();
    expect(service.useImage).toHaveBeenCalledWith(character, newLook, 'create'); expect(component.visible()).toBeFalse();
  });

  it('keeps the saved result available if opening the generator fails', async () => {
    service.get.and.resolveTo({ id: 'character', name: 'Amy', images: [{ id: 'new-look', recipe: recipeFromImage(image) }] });
    service.useImage.and.rejectWith(new Error('Finish your current job first.'));
    await component.save(); await component.createFromSaved();
    expect(component.savedId()).toBe('character'); expect(component.visible()).toBeTrue();
    expect(component.error()).toBe('Finish your current job first.'); expect(component.openingGenerator()).toBeFalse();
  });

  it('ignores a save response after the signed-in account changes', async () => {
    let resolveSave!: (value: any) => void;
    const started = new Promise<void>(resolve => service.save.and.callFake(() => { resolve(); return new Promise(done => resolveSave = done); }));
    const saved = jasmine.createSpy(); service.saved.subscribe(saved);
    const saving = component.save(); await started;
    service.owner = 'other-account'; user.next({ token: 'other-account' }); resolveSave({ id: 'character', image_id: 'new-look' }); await saving;
    expect(component.visible()).toBeFalse(); expect(saved).not.toHaveBeenCalled();
  });

  it('does not reopen a stale generator action after the dialog is closed', async () => {
    let resolveGet!: (value: any) => void;
    service.get.and.returnValue(new Promise(resolve => resolveGet = resolve));
    await component.save(); const opening = component.createFromSaved(); component.close();
    resolveGet({ id: 'character', name: 'Amy', images: [{ id: 'new-look' }] }); await opening;
    expect(service.useImage).not.toHaveBeenCalled();
  });

  it('retries an ambiguous save with the same UUID and keeps entered content', async () => {
    service.save.and.rejectWith(new Error('Response timed out'));
    component.recipe.label = 'Spy outfit';
    await component.save();
    const first = service.save.calls.mostRecent().args[4];
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(component.name).toBe('Amy Rose'); expect(component.recipe.label).toBe('Spy outfit');
    expect(component.hasUnsavedChanges).toBeTrue();
    await component.save();
    expect(service.save.calls.mostRecent().args[4]).toBe(first);
    component.recipe.appearance += ', bangs'; await component.save();
    const changed = service.save.calls.mostRecent().args[4];
    expect(changed).not.toBe(first);
    component.characters = [summary]; component.changeTarget('existing'); await component.save();
    expect(service.save.calls.mostRecent().args[4]).not.toBe(changed);
  });

  it('starts a new request when pixels change even if the image UUID stays the same', async () => {
    service.save.and.rejectWith(new Error('Response timed out'));
    await component.save(); const first = service.save.calls.mostRecent().args[4];
    (component as any).image = { ...image, blob: new Blob(['different pixels'], { type: 'image/png' }) };
    await component.save(); expect(service.save.calls.mostRecent().args[4]).not.toBe(first);
  });

  it('preselects an attributed destination outside the first page and requires a choice if deleted', async () => {
    service.get.and.resolveTo({ id: 'original', name: 'Original Amy', images: [], image_count: 47 });
    await component.open({ ...image, characterId: 'original' });
    expect(service.get).toHaveBeenCalledWith('original'); expect(component.targetId).toBe('original');
    expect(component.recipe.label).toBe('Look 48');
    service.get.and.rejectWith({ status: 404 });
    await component.open({ ...image, characterId: 'deleted' }); component.name = 'Replacement';
    expect(component.destinationRequired).toBeTrue(); expect(component.canSave).toBeFalse();
    component.changeTarget(''); expect(component.canSave).toBeTrue();
  });

  it('protects a submitted save until its result is known', async () => {
    let complete!: (value: any) => void;
    const started = new Promise<void>(resolve => service.save.and.callFake(() => { resolve(); return new Promise(done => complete = done); }));
    const saving = component.save(); await started;
    expect(component.hasUnsavedChanges).toBeTrue();
    complete({ id: 'character', image_id: 'new-look' }); await saving;
    expect(component.hasUnsavedChanges).toBeFalse();
  });
  it('guards an unchanged prefilled look after an ambiguous save failure', async () => {
    service.list.and.resolveTo({ characters: [summary] });
    await component.open(image, 'existing');
    expect(component.hasUnsavedChanges).toBeFalse();
    service.save.and.rejectWith(new Error('Response timed out')); await component.save();
    expect(component.hasUnsavedChanges).toBeTrue();
  });
});
