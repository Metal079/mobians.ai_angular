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
    // The hand-off is recorded, once the video page has opened.
    const event = http.expectOne(req => req.url.endsWith('/characters/events'));
    expect(event.request.body).toEqual(jasmine.objectContaining({ event_type: 'animate_handoff', source: 'character_page', character_id: 'character', image_id: 'look' }));
    event.flush(null);
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
    http.expectOne(req => req.url.endsWith('/characters/events')).flush(null);
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

  describe('add to my prompt', () => {
    afterEach(() => localStorage.removeItem('mobians:character-load-mode'));

    it('adds by default, remembers a choice, and survives blocked storage', () => {
      expect(service.loadMode()).toBe('add');
      service.setLoadMode('replace'); expect(service.loadMode()).toBe('replace');
      service.setLoadMode('add'); expect(service.loadMode()).toBe('add');
      const read = spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
      const write = spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
      expect(() => service.setLoadMode('replace')).not.toThrow();
      expect(service.loadMode()).toBe('add');
      read.and.callThrough(); write.and.callThrough();
    });

    it('hands the chosen mode and where it came from to the generator', async () => {
      const pending = service.useImage(character, saved, 'create', { mode: 'add', source: 'generator_add' });
      http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe }); await pending;
      expect(service.takeImageHandoff()).toEqual(jasmine.objectContaining({ mode: 'add', source: 'generator_add' }));
    });

    it('replaces unless a caller asks to add, and a reference picture always replaces', async () => {
      const fromPage = service.useImage(character, saved, 'create');
      http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe }); await fromPage;
      expect(service.takeImageHandoff()).toEqual(jasmine.objectContaining({ mode: 'replace', source: 'character_page' }));
      const asReference = service.useImage(character, saved, 'edit', { mode: 'add' });
      http.expectOne(req => req.url.endsWith('/prepare')).flush({ recipe: saved.recipe });
      await Promise.resolve();
      http.expectOne(req => req.url.endsWith('/media')).flush(new Blob(['image'], { type: 'image/webp' }));
      await asReference;
      expect(service.takeImageHandoff()).toEqual(jasmine.objectContaining({ mode: 'replace', source: 'reference' }));
    });
  });

  describe('usage records', () => {
    it('says where a load came from, and stays as before when it is not told', () => {
      service.recordLoaded('character', 'look', 'generator_add');
      const request = http.expectOne(req => req.url.endsWith('/characters/character/images/look/used'));
      expect(request.request.body).toEqual({ event_id: jasmine.any(String), source: 'generator_add' });
      request.flush(null);
      service.recordLoaded('character', 'look');
      const plain = http.expectOne(req => req.url.endsWith('/used'));
      expect(Object.keys(plain.request.body)).toEqual(['event_id']);
      plain.flush(null);
    });

    it('sends where a save started as its own field, outside the saved setup', async () => {
      const pending = service.save('Ash', saved.recipe, 'data:image/webp;base64,AAAA', undefined, 'request-1', undefined, 'enlarged_result');
      const request = http.expectOne(req => req.url.endsWith('/characters'));
      expect(request.request.body).toEqual({ name: 'Ash', recipe: saved.recipe, image_base64: 'data:image/webp;base64,AAAA', request_id: 'request-1', source: 'enlarged_result' });
      expect((request.request.body.recipe as any).source).toBeUndefined();
      request.flush({ id: 'character', image_id: 'look' }); await pending;
    });

    it('passes the save source to the dialog that opens', () => {
      const received = jasmine.createSpy('saveRequest'); service.saveRequests.subscribe(received);
      service.requestSave(image as any, 'character', undefined, 'enlarged_result');
      expect(received).toHaveBeenCalledOnceWith({ image, characterId: 'character', recipe: undefined, source: 'enlarged_result' });
    });

    it('records a browser-only event with the look it concerns', () => {
      service.recordEvent('unlinked', 'undo', { characterId: 'character', imageId: 'look' });
      const request = http.expectOne(req => req.url.endsWith('/characters/events'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ event_id: jasmine.any(String), event_type: 'unlinked', source: 'undo', character_id: 'character', image_id: 'look' });
      request.flush(null);
      service.recordEvent('picker_opened', 'generator');
      const opened = http.expectOne(req => req.url.endsWith('/characters/events'));
      expect(opened.request.body).toEqual({ event_id: jasmine.any(String), event_type: 'picker_opened', source: 'generator' });
      opened.flush(null);
    });

    it('stops asking for the rest of the visit when the server has no events route', async () => {
      service.recordEvent('picker_opened', 'generator');
      http.expectOne(req => req.url.endsWith('/characters/events')).flush(null, { status: 405, statusText: 'Method Not Allowed' });
      await Promise.resolve(); await Promise.resolve();
      service.recordEvent('picker_opened', 'generator');
      http.expectNone(req => req.url.endsWith('/characters/events'));
    });

    it('keeps trying after a passing failure, and records nothing for a signed-out visitor', async () => {
      service.recordEvent('picker_opened', 'generator');
      http.expectOne(req => req.url.endsWith('/characters/events')).flush(null, { status: 503, statusText: 'Unavailable' });
      await Promise.resolve(); await Promise.resolve();
      service.recordEvent('picker_opened', 'generator');
      http.expectOne(req => req.url.endsWith('/characters/events')).flush(null);
      user.next(null);
      service.recordEvent('picker_opened', 'generator');
      http.expectNone(req => req.url.endsWith('/characters/events'));
    });

    it('notes why the linked character is dropped, and nothing when none is linked', () => {
      service.recordUnlinked('reference');
      http.expectNone(req => req.url.endsWith('/characters/events'));
      service.activeCharacter.set({ id: 'character', name: 'Ash', imageId: 'look' });
      service.recordUnlinked('reference');
      const request = http.expectOne(req => req.url.endsWith('/characters/events'));
      expect(request.request.body).toEqual(jasmine.objectContaining({ event_type: 'unlinked', source: 'reference', character_id: 'character', image_id: 'look' }));
      request.flush(null);
    });
  });
});
