import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CharactersService, CharacterDetail, CharacterImage, characterPrompt, recipeFromImage } from './characters.service';
import { SharedService } from '../shared.service';
import { AccountCtaService } from '../auth/account-cta.service';

describe('Character workflows', () => {
  let service: CharactersService;
  let http: HttpTestingController;
  let user: BehaviorSubject<any>;
  let router: jasmine.SpyObj<Router>;
  let login: jasmine.Spy;
  const image = { UUID: 'original', model: 'illustrious', prompt: 'blue fox', negativePrompt: 'blurry', width: 512, height: 768, aspectRatio: 'portrait', cfg: 5, loras: [{ id: 7, version_id: 19, name: 'Fox', strength: .7 }] };
  const saved: CharacterImage = { id: 'look', thumbnail: '', created_at: '', recipe: recipeFromImage(image) };
  const character: CharacterDetail = { id: 'character', name: 'Ash', images: [saved] };

  beforeEach(() => {
    localStorage.removeItem('mobians:pending-job');
    user = new BehaviorSubject({ token: 'account-a' });
    router = jasmine.createSpyObj('Router', ['navigateByUrl']); router.navigateByUrl.and.resolveTo(true);
    login = jasmine.createSpy('requestLogin');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: Router, useValue: router },
      { provide: SharedService, useValue: { getUserData: () => user.asObservable(), getUserDataValue: () => user.value, getGenerationRequestValue: () => ({ model: 'anima', loras: [{ id: 8, strength: .6 }] }) } },
      { provide: AccountCtaService, useValue: { requestLogin: login } },
    ] });
    service = TestBed.inject(CharactersService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.removeItem('mobians:pending-job'); });

  it('deletes the selected character through the existing endpoint and preserves API failures for retry', async () => {
    const deleting = service.remove('character');
    const request = http.expectOne(req => req.url.endsWith('/characters/character'));
    expect(request.request.method).toBe('DELETE'); request.flush(null); await deleting;
    const retry = service.remove('other');
    const failed = expectAsync(retry).toBeRejected();
    http.expectOne(req => req.url.endsWith('/characters/other')).flush({detail:'Unavailable'}, {status:503, statusText:'Unavailable'});
    await failed;
  });

  it('keeps model-specific setup and LoRA weights without unrelated runtime settings', () => {
    const recipe = recipeFromImage(image);
    expect(recipe.model).toBe('illustrious'); expect(recipe.loras[0].strength).toBe(.7);
    expect(recipe.negative_prompt).toBe('blurry'); expect(recipe.guidance_scale).toBe(5);
    expect(recipe.width).toBe(512); expect(recipe.height).toBe(768);
    expect((recipe as any).queue_type).toBeUndefined(); expect((recipe as any).seed).toBeUndefined();
    recipe.loras[0].strength = 1.2; expect(image.loras[0].strength).toBe(.7);
  });

  it('combines stable appearance with an optional scene without extra separators', () => {
    expect(characterPrompt({ ...saved.recipe, appearance: ' fox ', scene: ' forest ' })).toBe('fox, forest');
    expect(characterPrompt({ ...saved.recipe, appearance: ' fox ', scene: ' ' })).toBe('fox');
  });

  it('requires login before opening private saving', () => {
    const received = jasmine.createSpy('saveRequest'); service.saveRequests.subscribe(received);
    user.next(null); service.requestSave(image);
    expect(login).toHaveBeenCalled(); expect(received).not.toHaveBeenCalled();
  });

  it('prepares the exact setup and hands it off once without automatically generating', async () => {
    const pending = service.useImage(character, saved, 'create');
    http.expectOne(req => req.url.endsWith('/characters/character/images/look/prepare')).flush({ recipe: saved.recipe });
    await pending;
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    const handoff = service.takeImageHandoff();
    expect(handoff?.recipe.model).toBe('illustrious'); expect(handoff?.image).toBeUndefined();
    expect(service.takeImageHandoff()).toBeNull();
    http.expectNone(req => req.url.includes('submit_job'));
  });

  it('uses private media for editing while keeping the saved prompt and model', async () => {
    const pending = service.useImage(character, saved, 'edit');
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe });
    await Promise.resolve();
    const blob = new Blob(['image'], { type: 'image/webp' });
    http.expectOne(req => req.url.endsWith('/media')).flush(blob);
    await pending;
    expect(service.takeImageHandoff()?.image?.blob).toBe(blob);
  });

  it('can animate an image without requiring its old image-generation model', async () => {
    const pending = service.useImage(character, saved, 'animate');
    http.expectNone(req => req.url.endsWith('/prepare'));
    const blob = new Blob(['image'], { type: 'image/webp' });
    http.expectOne(req => req.url.endsWith('/media')).flush(blob);
    await pending;
    expect(router.navigateByUrl).toHaveBeenCalledWith('/video');
    expect(service.takeVideoHandoff()?.blob).toBe(blob); expect(service.takeVideoHandoff()).toBeNull();
  });

  it('does not replace a pending image job', async () => {
    localStorage.setItem('mobians:pending-job', '{}');
    await expectAsync(service.useImage(character, saved, 'create')).toBeRejectedWithError(/Finish or cancel/);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
  it('carries the current LoRAs across route recreation for a prompt-only look', async () => {
    const recipe = { ...saved.recipe, model: '', loras: [] };
    const pending = service.useImage(character, { ...saved, recipe }, 'create');
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe });
    await pending;
    const handoff = service.takeImageHandoff();
    expect(handoff?.recipe.model).toBe(''); expect(handoff?.currentModel).toBe('anima');
    expect(handoff?.currentLoras).toEqual([{ id: 8, strength: .6 }]);
  });

  it('does not silently substitute an unavailable model or LoRA', async () => {
    const pending = service.useImage(character, saved, 'create');
    const expectation = expectAsync(pending).toBeRejected();
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ detail: 'Model unavailable' }, { status: 409, statusText: 'Conflict' });
    await expectation;
    expect(router.navigateByUrl).not.toHaveBeenCalled(); expect(service.takeImageHandoff()).toBeNull();
  });

  it('discards an in-flight handoff when the account changes', async () => {
    const pending = service.useImage(character, saved, 'create');
    const expectation = expectAsync(pending).toBeRejectedWithError(/account changed/);
    user.next({ token: 'account-b' });
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe });
    await expectation;
    expect(router.navigateByUrl).not.toHaveBeenCalled(); expect(service.takeImageHandoff()).toBeNull();
  });

  it('delivers a character to the already-open image generator without navigating or submitting a job', async () => {
    Object.defineProperty(router, 'url', { value: '/?source=history#images', configurable: true });
    const received: any[] = [];
    service.imageHandoffReady.subscribe(() => received.push(service.takeImageHandoff()));
    const pending = service.useImage(character, saved, 'create', { scene: '  reading in a library  ' });
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe });
    await pending;
    expect(router.navigateByUrl).not.toHaveBeenCalled(); expect(received.length).toBe(1);
    expect(received[0].recipe.scene).toBe('reading in a library');
    expect(received[0].characterId).toBe('character'); expect(received[0].imageId).toBe('look');
    expect(service.takeImageHandoff()).toBeNull();
    expect(service.activeCharacter()).toEqual({ id: 'character', name: 'Ash', imageId: 'look' });
    http.expectNone(req => req.method === 'POST');
  });

  it('changes the scene for this creation without changing either saved or prepared recipes', async () => {
    const recipe = { ...saved.recipe, scene: 'sunny beach' };
    const selected = { ...saved, recipe };
    const prepared = structuredClone(recipe);
    const pending = service.useImage({ ...character, images: [selected] }, selected, 'create', { scene: '  rainy city  ' });
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: prepared });
    await pending;
    const handoff = service.takeImageHandoff()!;
    expect(characterPrompt(handoff.recipe)).toBe('blue fox, sunny beach, rainy city');
    expect(recipe.scene).toBe('sunny beach'); expect(prepared.scene).toBe('sunny beach');
    handoff.recipe.loras[0].strength = .2;
    expect(recipe.loras[0].strength).toBe(.7); expect(prepared.loras[0].strength).toBe(.7);
  });

  it('preserves legacy scene text in the look prompt even with no temporary scene', async () => {
    const recipe = { ...saved.recipe, scene: 'sunny beach' };
    const pending = service.useImage(character, { ...saved, recipe }, 'create', { scene: '' });
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe });
    await pending;
    const handoff = service.takeImageHandoff()!;
    expect(handoff.recipe.scene).toBe('');
    expect(handoff.recipe.appearance).toBe('blue fox, sunny beach');
    expect(recipe.scene).toBe('sunny beach');
  });

  it('loads all legacy prompt text into the editable prompt and does not duplicate it on another read', async () => {
    const legacy = { ...saved.recipe, appearance: 'a'.repeat(6000), scene: 's'.repeat(2000) };
    const pending = service.get(character.id);
    http.expectOne(req => req.url.endsWith('/characters/character')).flush({ ...character, images: [{ ...saved, recipe: legacy }] });
    const loaded = (await pending).images[0].recipe;
    expect(loaded.appearance).toBe(legacy.appearance + ', ' + legacy.scene);
    expect(loaded.appearance.length).toBe(8002); expect(loaded.scene).toBe('');
    const again = service.get(character.id);
    http.expectOne(req => req.url.endsWith('/characters/character')).flush({ ...character, images: [{ ...saved, recipe: loaded }] });
    expect((await again).images[0].recipe).toEqual(loaded);
  });

  it('does not apply an image scene override when handing off a frame for animation', async () => {
    const recipe = { ...saved.recipe, scene: 'sunny beach' };
    const pending = service.useImage(character, { ...saved, recipe }, 'animate', { scene: 'rainy city' });
    http.expectOne(req => req.url.endsWith('/media')).flush(new Blob(['frame'], { type: 'image/webp' }));
    await pending;
    expect(service.takeVideoHandoff()?.prompt).toBe('blue fox, sunny beach');
    expect(recipe.scene).toBe('sunny beach');
  });

  it('does not signal a handoff until navigation has finished', async () => {
    let finishNavigation!: (navigated: boolean) => void;
    router.navigateByUrl.and.returnValue(new Promise(resolve => finishNavigation = resolve));
    const ready = jasmine.createSpy(); service.imageHandoffReady.subscribe(ready);
    const pending = service.useImage(character, saved, 'create');
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe });
    await Promise.resolve();
    expect(router.navigateByUrl).toHaveBeenCalled(); expect(ready).not.toHaveBeenCalled();
    finishNavigation(true); await pending;
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('discards image data if the owner changes while navigation is pending', async () => {
    let finishNavigation!: (navigated: boolean) => void;
    router.navigateByUrl.and.returnValue(new Promise(resolve => finishNavigation = resolve));
    const ready = jasmine.createSpy(); service.imageHandoffReady.subscribe(ready);
    const pending = service.useImage(character, saved, 'create');
    const rejected = expectAsync(pending).toBeRejectedWithError(/account changed/);
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe });
    await Promise.resolve(); user.next({ token: 'account-b' }); finishNavigation(true); await rejected;
    expect(ready).not.toHaveBeenCalled(); expect(service.takeImageHandoff()).toBeNull();
    expect(service.activeCharacter()).toBeNull();
  });

  it('discards private animation media if the owner changes while navigation is pending', async () => {
    let finishNavigation!: (navigated: boolean) => void;
    router.navigateByUrl.and.returnValue(new Promise(resolve => finishNavigation = resolve));
    const pending = service.useImage(character, saved, 'animate');
    const rejected = expectAsync(pending).toBeRejectedWithError(/account changed/);
    http.expectOne(req => req.url.endsWith('/media')).flush(new Blob(['private frame'], { type: 'image/webp' }));
    await Promise.resolve(); await Promise.resolve();
    expect(router.navigateByUrl).toHaveBeenCalled();
    user.next(null); finishNavigation(true); await rejected;
    expect(service.takeVideoHandoff()).toBeNull(); expect(service.activeCharacter()).toBeNull();
  });

  it('clears the pending look when navigation is cancelled', async () => {
    router.navigateByUrl.and.resolveTo(false);
    const ready = jasmine.createSpy(); service.imageHandoffReady.subscribe(ready);
    const pending = service.useImage(character, saved, 'create');
    const rejected = expectAsync(pending).toBeRejectedWithError(/Could not open/);
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe }); await rejected;
    expect(service.takeImageHandoff()).toBeNull(); expect(ready).not.toHaveBeenCalled();
  });

  it('clears the pending look if navigation throws instead of leaving it to load later', async () => {
    router.navigateByUrl.and.rejectWith(new Error('Navigation failed'));
    const ready = jasmine.createSpy(); service.imageHandoffReady.subscribe(ready);
    const pending = service.useImage(character, saved, 'create');
    const rejected = expectAsync(pending).toBeRejected();
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe }); await rejected;
    expect(service.takeImageHandoff()).toBeNull(); expect(ready).not.toHaveBeenCalled();
  });

  it('forgets the active character on account change', async () => {
    const pending = service.useImage(character, saved, 'create');
    http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe }); await pending;
    service.takeImageHandoff(); expect(service.activeCharacter()?.id).toBe('character');
    user.next({ token: 'account-b' }); expect(service.activeCharacter()).toBeNull();
  });

  it('sets a character default using the dedicated API with the selected look ID', async () => {
    const pending = service.setDefault('character', 'chosen-look');
    const request = http.expectOne(req => req.url.endsWith('/characters/character/default-look'));
    expect(request.request.method).toBe('PATCH'); expect(request.request.body).toEqual({ image_id: 'chosen-look' });
    request.flush({ id: 'character', default_image_id: 'chosen-look' });
    expect(await pending).toEqual({ id: 'character', default_image_id: 'chosen-look' });
  });

  it('reports a failed default change so the UI can keep its current default', async () => {
    const pending = service.setDefault('character', 'foreign-look');
    const rejected = expectAsync(pending).toBeRejected();
    http.expectOne(req => req.url.endsWith('/default-look')).flush({ detail: 'Look not found' }, { status: 404, statusText: 'Not Found' });
    await rejected;
  });

  it('returns the exact new image ID when adding a look to an existing character', async () => {
    const pending = service.save('ignored name', saved.recipe, 'data:image/webp;base64,AAAA', 'character');
    const request = http.expectOne(req => req.url.endsWith('/characters/character/images'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ recipe: saved.recipe, image_base64: 'data:image/webp;base64,AAAA' });
    request.flush({ id: 'character', image_id: 'new-look' });
    expect((await pending).image_id).toBe('new-look');
  });
});
