import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ImageEditorComponent } from './image-editor.component';
import { ImageEditorService, IMAGE_EDIT_MODEL } from './image-editor.service';
import { StableDiffusionService } from '../stable-diffusion.service';
import { GenerationLockService } from '../generation-lock.service';
import { CharactersService, recipeFromImage } from '../characters/characters.service';
import { SharedService } from '../shared.service';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

describe('Image editing workflows', () => {
  let fixture: ComponentFixture<ImageEditorComponent>;
  let component: ImageEditorComponent;
  let editor: any;
  let api: any;
  let characters: any;
  let user: BehaviorSubject<any>;
  let lock: any;
  let source: MobiansImage;
  let auth: any;
  let credits: BehaviorSubject<any>;

  beforeEach(async () => {
    user = new BehaviorSubject(null);
    editor = { owner: '', available: signal(true), context: signal(null), pending: signal(false), presentation: signal('dialog'), priorityCreditCost: signal(20), activeModel: signal(IMAGE_EDIT_MODEL), defaultSteps: signal(4), refresh: jasmine.createSpy().and.resolveTo() };
    credits = new BehaviorSubject({ credits: 100 });
    auth = { credits$: credits, getCredits: () => credits.value.credits,
      updateCredits: jasmine.createSpy().and.callFake((value: number) => credits.next({ credits: value })),
      refreshCredits: jasmine.createSpy().and.resolveTo({ credits: 100 }) };
    api = { submitJob: jasmine.createSpy().and.returnValue(of({ job_id: 'edit-job' })),
      getJobStatus: jasmine.createSpy().and.returnValue(of({ status: 'pending' })),
      cancelJob: jasmine.createSpy().and.returnValue(of({ status: 'success' })) };
    characters = { requestSave: jasmine.createSpy(), get: jasmine.createSpy(), media: jasmine.createSpy() };
    lock = { tryAcquire: jasmine.createSpy().and.returnValue(true), release: jasmine.createSpy() };
    await TestBed.configureTestingModule({ imports: [ImageEditorComponent], providers: [
      { provide: ImageEditorService, useValue: editor }, { provide: StableDiffusionService, useValue: api },
      { provide: CharactersService, useValue: characters }, { provide: GenerationLockService, useValue: lock },
      { provide: SharedService, useValue: { getUserData: () => user } },
      { provide: AuthService, useValue: auth },
    ] }).overrideComponent(ImageEditorComponent, { set: { template: '', imports: [] } }).compileComponents();
    fixture = TestBed.createComponent(ImageEditorComponent); component = fixture.componentInstance;
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 96;
    const blob = await (await fetch(canvas.toDataURL('image/png'))).blob();
    source = { UUID: 'source', blob, prompt: 'Pink hedgehog, green eyes', width: 64, height: 96, aspectRatio: 'portrait' };
    editor.owner = 'owner';
    spyOn<any>(component, 'saveDraft').and.resolveTo();
    localStorage.removeItem('mobians:pending-job');
  });
  afterEach(() => fixture.destroy());

  it('keeps the original appearance and setup separate from editing instructions when saving a look', async () => {
    const recipe = { ...recipeFromImage(source), model: 'retired-model' };
    await component.open({ image: source, characterId: 'character', lookId: 'look', recipe });
    const result = { ...source, UUID: 'edited', model: IMAGE_EDIT_MODEL, prompt: 'Make the shirt red.',
      editProvenance: { instruction: 'Make the shirt red.', parent_image_uuid: 'source' } };
    component.result.set(result); component.saveLook();
    const [saved, characterId, setup] = characters.requestSave.calls.mostRecent().args;
    expect(saved.prompt).toBe(source.prompt); expect(saved.editProvenance).toEqual(result.editProvenance);
    expect(characterId).toBe('character'); expect(setup.model).toBe('retired-model');
  });

  it('loads saved pixels independently of an unavailable source model', async () => {
    await component.open({});
    characters.get.and.resolveTo({ id: 'character', default_image_id: 'look', images: [{ id: 'look', recipe: { model: 'retired' } }] });
    characters.media.and.resolveTo(source.blob);
    component.pickTarget = 'base';
    await component.chooseCharacter({ characterId: 'character', imageId: 'look', name: 'Amy' });
    expect(characters.media).toHaveBeenCalledWith('character', 'look');
    expect(component.base()?.image.width).toBe(64); expect(component.base()?.image.height).toBe(96);
  });

  it('submits one result with references in order and cancels without losing the main image', async () => {
    await component.open({ image: source, characterId: 'character', lookId: 'look' });
    await component.choose({ ...source, UUID: 'reference-a' }, 'reference');
    await component.choose({ ...source, UUID: 'reference-b' }, 'reference');
    await component.choose({ ...source, UUID: 'excess' }, 'reference');
    component.prompt = 'Use the outfit in image 2.';
    await component.generate();
    const request = api.submitJob.calls.mostRecent().args[0];
    expect(request.model).toBe(IMAGE_EDIT_MODEL); expect(request.batch_size).toBe(1);
    expect(request.is_dev_job).toBeFalse();
    expect(request.job_type).toBe('instruction_edit'); expect(request.steps).toBe(4);
    expect(request.reference_images).toEqual(component.refs().map(ref => ref.data));
    expect(request.reference_images.length).toBe(2); expect(request.character_look_id).toBe('look');
    await component.cancel();
    expect(api.cancelJob).toHaveBeenCalledWith('edit-job'); expect(editor.pending()).toBeFalse();
    expect(component.base()?.image.UUID).toBe('source'); expect(lock.release).toHaveBeenCalled();
  });

  it('uses the previous result as the parent for Edit again', async () => {
    await component.open({ image: source });
    component.result.set({ ...source, UUID: 'edited', editProvenance: { instruction: 'Red shirt', root_image_uuid: 'root' } });
    await component.editAgain(); component.prompt = 'Blue shirt'; await component.generate();
    const request = api.submitJob.calls.mostRecent().args[0];
    expect(request.parent_image_uuid).toBe('edited'); expect(request.root_image_uuid).toBe('root');
    expect(component.result()).toBeNull();
  });

  it('uses Klein 4B at the same priority price without changing the source', async () => {
    await component.open({ image: source });
    component.prompt = 'Make the shirt red.'; component.queueType = 'priority';
    await component.generate();
    const request = api.submitJob.calls.mostRecent().args[0];
    expect(request.model).toBe(IMAGE_EDIT_MODEL);
    expect(request.expected_credit_cost).toBe(20);
    expect(request.steps).toBe(4); expect(request.batch_size).toBe(1);
    expect(component.base()?.image.UUID).toBe('source');
  });

  it('clears images and pending state when the account changes', async () => {
    await component.open({ image: source }); editor.pending.set(true);
    editor.owner = ''; user.next(null);
    expect(component.base()).toBeNull(); expect(component.refs()).toEqual([]);
    expect(editor.context()).toBeNull(); expect(editor.pending()).toBeFalse();
    expect(lock.release).toHaveBeenCalled();
  });

  it('rejects invalid seeds before acquiring the generation lock', async () => {
    await component.open({ image: source }); component.prompt = 'Red shirt'; component.seed = 1.5;
    await component.generate(); expect(api.submitJob).not.toHaveBeenCalled(); expect(lock.tryAcquire).not.toHaveBeenCalled();
  });

  it('requires a base image and never falls back to text generation', async () => {
    await component.open({}); component.prompt = 'Make the jacket red';
    await component.generate();
    expect(component.canGenerate).toBeFalse(); expect(api.submitJob).not.toHaveBeenCalled();
    await component.choose(source, 'base'); await component.generate();
    expect(api.submitJob.calls.mostRecent().args[0].job_type).toBe('instruction_edit');
    expect(api.submitJob.calls.mostRecent().args[0].model).toBe(IMAGE_EDIT_MODEL);
  });

  it('shows and submits the server price for exactly one priority image', async () => {
    await component.open({ image: source }); component.prompt = 'Red shirt'; component.queueType = 'priority';
    editor.priorityCreditCost.set(23);
    api.submitJob.and.returnValue(of({ job_id: 'edit-job', credits_used: 23, credits_remaining: 77 }));
    await component.generate();
    expect(api.submitJob.calls.mostRecent().args[0].expected_credit_cost).toBe(23);
    expect(api.submitJob.calls.mostRecent().args[0].queue_type).toBe('priority');
    expect(auth.updateCredits).toHaveBeenCalledWith(77); expect(component.credits()).toBe(77);
  });

  it('keeps the free queue usable with insufficient priority credits', async () => {
    await component.open({ image: source }); component.prompt = 'Red shirt'; credits.next({ credits: 0 });
    component.queueType = 'priority'; await component.generate();
    expect(component.insufficientCredits).toBeTrue(); expect(api.submitJob).not.toHaveBeenCalled();
    component.queueType = 'free'; await component.generate();
    expect(api.submitJob.calls.mostRecent().args[0].queue_type).toBe('free');
  });

  it('refreshes changed prices without retrying a charge automatically', async () => {
    await component.open({ image: source }); component.prompt = 'Red shirt'; component.queueType = 'priority';
    api.submitJob.and.returnValue(throwError(() => ({ status: 409, error: { detail: 'Review the updated price.' } })));
    await component.generate();
    expect(editor.refresh).toHaveBeenCalled(); expect(api.submitJob).toHaveBeenCalledTimes(1);
    expect(component.error()).toBe('Review the updated price.'); expect(editor.pending()).toBeFalse();
  });

  it('refreshes the balance after cancelling a paid pending job', async () => {
    await component.open({ image: source }); component.prompt = 'Red shirt'; component.queueType = 'priority';
    await component.generate(); api.cancelJob.and.returnValue(of({ credits_refunded: 20 }));
    await component.cancel();
    expect(component.status()).toContain('20 credits refunded'); expect(auth.refreshCredits).toHaveBeenCalled();
  });

  it('restores a painted selection without turning the black mask background into paint', async () => {
    await component.open({ image: source });
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 96;
    component.mask = { nativeElement: canvas };
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'white'; context.fillRect(16, 16, 16, 16); component.hasMask = true;
    const encoded = (component as any).exportedMask(); component.clearMask();
    await (component as any).restoreSelection(encoded);
    expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(0);
    expect(context.getImageData(20, 20, 1, 1).data[3]).toBe(255);
    expect((component as any).exportedMask()).toBe(encoded);
  });
});
