import { ImageEditorService } from 'src/app/image-editor/image-editor.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { BlobMigrationService } from 'src/app/blob-migration.service';
import { InpaintingMaskService } from 'src/app/inpainting-mask.service';
import { SharedService } from 'src/app/shared.service';

import { ImageGridComponent } from './image-grid.component';
import { ResultImageActionsService } from './result-image-actions.service';
import { VideoHandoffService } from 'src/app/video/video-handoff.service';

describe('ImageGridComponent', () => {
  let component: ImageGridComponent;
  let fixture: ComponentFixture<ImageGridComponent>;
  let sharedServiceStub: any;
  let blobMigrationServiceStub: any;

  beforeEach(async () => {
    sharedServiceStub = {
      getImages: () => of([]),
      getDownloadSlots: () => of(null),
      getImagesValue: () => [],
      getReferenceImage: () => of(null),
      getGenerationRequestValue: jasmine.createSpy('getGenerationRequestValue').and.returnValue({ lossy_images: true }),
      getInstructionValue: () => false,
      getReferenceImageValue: () => null,
      disableInstructions: () => {},
      enableInstructions: () => {},
      setReferenceImage: () => {},
      getImage: () => null
    };

    blobMigrationServiceStub = {
      convertWebPToPNG: async (blob: Blob) => blob,
      embedPngTextMetadata: async (blob: Blob) => blob
    };
    // The visitor's button choice is kept in this browser; every test starts from the defaults.
    localStorage.removeItem('mobians:result-image-buttons:v1');

    await TestBed.configureTestingModule({
      imports: [ImageGridComponent],
      providers: [
        { provide: ImageEditorService, useValue: { available: () => false, pending: () => false, open: jasmine.createSpy('openEditor') } },
        { provide: CharactersService, useValue: { requestSave: jasmine.createSpy('requestSave') } },
        { provide: VideoHandoffService, useValue: { animate: jasmine.createSpy('animate').and.resolveTo('opened') } },
        {
          provide: SharedService,
          useValue: sharedServiceStub
        },
        {
          provide: InpaintingMaskService,
          useValue: { canvasData$: of(null), clearCanvasData: () => {} }
        },
        {
          provide: BlobMigrationService,
          useValue: blobMigrationServiceStub
        }
      ]
    })
      .overrideComponent(ImageGridComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(ImageGridComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reserves original grid positions separately from completed image data', () => {
    const image = { UUID: 'second', width: 512, height: 512, aspectRatio: 'square', url: 'blob:second' };
    const slots = new BehaviorSubject<any>([null, image, null, null]);
    sharedServiceStub.getDownloadSlots = () => slots.asObservable();
    sharedServiceStub.getImages = () => of([image]);
    component.ngOnInit();
    expect(component.displaySlots).toEqual([null, image, null, null]);
    expect(component.images).toEqual([image]);
    slots.next(null);
    expect(component.displaySlots).toEqual([null, image, null, null]);
  });

  it('refreshes individual previews and clears the grid when shared results change', () => {
    const images = Array.from({ length: 4 }, (_, index) => ({
      UUID: String(index), width: 512, height: 512, aspectRatio: 'square', url: `blob:preview-${index}`
    }));
    const results = new BehaviorSubject<MobiansImage[]>(images);
    sharedServiceStub.getImages = () => results.asObservable();
    component.ngOnInit();
    const updated = [{ ...images[0], url: 'blob:replacement' }, ...images.slice(1)];

    results.next(updated);
    expect(component.images).toBe(updated);
    results.next([]);
    expect(component.images).toEqual([]);
  });

  it('stops observing shared images, references and masks after leaving the tab', () => {
    const results = new BehaviorSubject<MobiansImage[]>([]);
    const reference = new BehaviorSubject<MobiansImage | null>(null);
    const mask = new BehaviorSubject<string | null>(null);
    sharedServiceStub.getImages = () => results.asObservable();
    sharedServiceStub.getReferenceImage = () => reference.asObservable();
    (TestBed.inject(InpaintingMaskService) as any).canvasData$ = mask.asObservable();
    component.ngOnInit();
    expect(results.observed).toBeTrue();
    expect(reference.observed).toBeTrue();
    expect(mask.observed).toBeTrue();

    fixture.destroy();
    expect(results.observed).toBeFalse();
    expect(reference.observed).toBeFalse();
    expect(mask.observed).toBeFalse();
  });

  for (const scenario of [
    { source: 'image/png', lossy: false, expected: 'image/png' },
    { source: 'image/webp', lossy: false, expected: 'image/png' },
    { source: 'image/webp', lossy: true, expected: 'image/webp' },
  ]) {
    it('expands ' + scenario.source + ' for native saving as ' + scenario.expected + ' with WebP ' + scenario.lossy, async () => {
      const original = new Blob(['image'], { type: scenario.source });
      const png = new Blob(['png'], { type: 'image/png' });
      const image = { UUID: 'expanded', width: 512, height: 768, blob: original };
      spyOn(sharedServiceStub, 'getImage').and.returnValue(image);
      const setReference = spyOn(sharedServiceStub, 'setReferenceImage');
      sharedServiceStub.getGenerationRequestValue.and.returnValue({ lossy_images: scenario.lossy });
      spyOn(blobMigrationServiceStub, 'convertWebPToPNG').and.resolveTo(png);

      await component.expandImage(0, new Event('click'));

      const expanded = setReference.calls.mostRecent().args[0] as MobiansImage;
      expect(expanded.blob!.type).toBe(scenario.expected);
      expect(expanded.width).toBe(512);
      expect(expanded.height).toBe(768);
      expect(image.blob).toBe(original);
    });
  }

  it('does not replace a newer generation with an image whose conversion finished late', async () => {
    const image = { UUID: 'old', width: 512, height: 512, blob: new Blob(['webp'], { type: 'image/webp' }) };
    const getImage = spyOn(sharedServiceStub, 'getImage').and.returnValue(image);
    const setReference = spyOn(sharedServiceStub, 'setReferenceImage');
    sharedServiceStub.getGenerationRequestValue.and.returnValue({ lossy_images: false });
    let finish!: (blob: Blob) => void;
    spyOn(blobMigrationServiceStub, 'convertWebPToPNG').and.returnValue(new Promise<Blob>(resolve => { finish = resolve; }));
    const expansion = component.expandImage(0, new Event('click'));
    getImage.and.returnValue({ ...image, UUID: 'new' });
    finish(new Blob(['png'], { type: 'image/png' }));
    await expansion;
    expect(setReference).not.toHaveBeenCalled();
  });

  it('hands an image to the video page without also expanding or downloading it', async () => {
    const animate = TestBed.inject(VideoHandoffService).animate as jasmine.Spy;
    const image = { UUID: 'grid-1', width: 512, height: 512, url: 'blob:grid-image' } as MobiansImage;
    const click = new Event('click', { cancelable: true });
    const stop = spyOn(click, 'stopPropagation');
    await component.animateImage(image, click);
    expect(stop).toHaveBeenCalled();
    expect(animate).toHaveBeenCalledOnceWith(image, jasmine.any(Function), 'image_grid');
    // The loader it passes is the same one downloads use.
    const blob = new Blob(['webp'], { type: 'image/webp' });
    spyOn(window, 'fetch').and.resolveTo(new Response(blob));
    expect((await animate.calls.mostRecent().args[1]()).type).toBe('image/webp');
  });

  describe('saving the enlarged image as a character', () => {
    const resultBlob = new Blob(['result'], { type: 'image/webp' });
    const enlargedBlob = new Blob(['a much larger png copy'], { type: 'image/png' });
    const result = { UUID: 'job-1-0', prompt: 'blue fox, red scarf', model: 'novaMobianXL_v20', characterId: 'ash', blob: resultBlob, width: 512, height: 768 } as any;
    const enlarge = (reference: any, results: any[] = [result]) => {
      sharedServiceStub.getReferenceImageValue = () => reference;
      sharedServiceStub.getImagesValue = () => results;
    };

    it('offers a fresh result with its own prompt, settings and file', () => {
      // The enlarged copy has no prompt and may be a larger PNG conversion.
      enlarge({ UUID: 'job-1-0', blob: enlargedBlob, width: 512, height: 768 });
      const savable = component.savableReference!;
      expect(savable.source).toBe('enlarged_result');
      expect(savable.image.prompt).toBe('blue fox, red scarf');
      expect(savable.image.characterId).toBe('ash');
      expect(savable.image.blob).toBe(resultBlob);
    });

    it('offers an image opened from history, which carries its own prompt', () => {
      enlarge({ UUID: 'history-7', prompt: 'green cat', blob: resultBlob });
      expect(component.savableReference).toEqual({ image: jasmine.objectContaining({ UUID: 'history-7', prompt: 'green cat' }), source: 'enlarged_history' });
    });

    it('offers nothing for an uploaded file, a character’s own picture, an earlier batch or an empty grid', () => {
      enlarge({ UUID: 'upload-1', blob: resultBlob });
      expect(component.savableReference).toBeNull();
      enlarge({ UUID: 'character-look-9', prompt: 'blue fox', blob: resultBlob });
      expect(component.savableReference).toBeNull();
      enlarge({ UUID: 'job-0-2', blob: enlargedBlob });
      expect(component.savableReference).toBeNull();
      enlarge(null);
      expect(component.savableReference).toBeNull();
    });

    it('offers nothing when the image has a prompt but no file to save', () => {
      enlarge({ UUID: 'job-1-0' }, [{ ...result, blob: undefined }]);
      expect(component.savableReference).toBeNull();
    });

    it('opens the save dialog for that image without collapsing the enlarged view', () => {
      const requestSave = (TestBed.inject(CharactersService) as any).requestSave as jasmine.Spy;
      const click = new Event('click', { cancelable: true });
      const stop = spyOn(click, 'stopPropagation');
      component.saveCharacter({ image: result, source: 'enlarged_result' }, click);
      expect(stop).toHaveBeenCalled();
      expect(requestSave).toHaveBeenCalledOnceWith(result, 'ash', undefined, 'enlarged_result');
    });
  });

  describe('the buttons on a result tile', () => {
    const tile = { UUID: 'job-1-0', prompt: 'blue fox, red scarf', model: 'novaMobianXL_v20', seed: 7, characterId: 'ash',
      blob: new Blob(['result'], { type: 'image/webp' }), width: 512, height: 768 } as any;
    const actions = () => TestBed.inject(ResultImageActionsService);

    it('shows Download and Make a video by default', () => {
      expect(component.showDownload).toBeTrue();
      expect(component.showVideo).toBeTrue();
      expect(component.showFavorite).toBeFalse();
      expect(component.showEdit).toBeFalse();
      expect(component.showSaveCharacter(tile)).toBeFalse();
      expect(component.tileActionCount(tile)).toBe(2);
    });

    it('shows only the buttons the visitor switched on', () => {
      actions().set('video', false);
      actions().set('download', false);
      expect(component.tileActionCount(tile)).toBe(0);

      actions().set('favorite', true);
      actions().set('character', true);
      actions().set('edit', true);
      expect(component.showFavorite).toBeTrue();
      expect(component.showSaveCharacter(tile)).toBeTrue();
      // The editor is not available in this test, so its button stays away.
      expect(component.showEdit).toBeFalse();
      expect(component.tileActionCount(tile)).toBe(2);
    });

    it('keeps Download while history cannot keep the images, and offers no favorite for them', () => {
      actions().set('download', false);
      actions().set('favorite', true);
      expect(component.showDownload).toBeFalse();
      component.rescueDownload = true;
      expect(component.showDownload).toBeTrue();
      expect(component.showFavorite).toBeFalse();
    });

    it('offers Save as a character only for an image with a prompt and a file', () => {
      actions().set('character', true);
      expect(component.showSaveCharacter({ ...tile, prompt: '  ' })).toBeFalse();
      expect(component.showSaveCharacter({ ...tile, blob: undefined })).toBeFalse();
      const requestSave = (TestBed.inject(CharactersService) as any).requestSave as jasmine.Spy;
      component.saveTileAsCharacter(tile, new Event('click'));
      expect(requestSave).toHaveBeenCalledOnceWith(tile, 'ash', undefined, 'result_tile');
    });

    it('asks history to change a favorite without enlarging the image', () => {
      const asked = spyOn(component.favoriteToggle, 'emit');
      const click = new Event('click', { cancelable: true });
      const stop = spyOn(click, 'stopPropagation');
      component.toggleFavorite(tile, click);
      expect(stop).toHaveBeenCalled();
      expect(asked).toHaveBeenCalledOnceWith(tile);
    });

    it('reads the favorite star from the shared result, not from an older copy on the tile', () => {
      expect(component.isFavorite(tile)).toBeFalse();
      sharedServiceStub.getImagesValue = () => [{ ...tile, favorite: true }];
      expect(component.isFavorite(tile)).toBeTrue();
    });

    it('opens the editor with the file a download would give', async () => {
      const open = (TestBed.inject(ImageEditorService) as any).open as jasmine.Spy;
      const png = new Blob(['png'], { type: 'image/png' });
      sharedServiceStub.getGenerationRequestValue.and.returnValue({ lossy_images: false });
      spyOn(blobMigrationServiceStub, 'convertWebPToPNG').and.resolveTo(png);
      await component.editTileWithAI(tile, new Event('click'));
      expect(open).toHaveBeenCalledOnceWith({ image: jasmine.objectContaining({ UUID: 'job-1-0', blob: png }) });
    });

    it('writes the prompt and settings into a downloaded PNG', async () => {
      const png = new Blob(['png'], { type: 'image/png' });
      sharedServiceStub.getGenerationRequestValue.and.returnValue({ lossy_images: false });
      spyOn(blobMigrationServiceStub, 'convertWebPToPNG').and.resolveTo(png);
      const embed = spyOn(blobMigrationServiceStub, 'embedPngTextMetadata').and.callThrough();
      spyOn(HTMLAnchorElement.prototype, 'click');

      await component.downloadImage(tile, new Event('click'));

      expect(embed).toHaveBeenCalledOnceWith(png, jasmine.objectContaining({
        prompt: 'blue fox, red scarf', seed: '7', model: 'Mobians.ai / novaMobianXL_v20',
      }));
    });
  });

  it('shows the results again when the enlarged image is removed from outside the grid', () => {
    const reference = new BehaviorSubject<MobiansImage | null>(null);
    sharedServiceStub.getReferenceImage = () => reference.asObservable();
    const expanded = spyOn(component.imageExpandedChange, 'emit');
    component.ngOnInit();
    expect(expanded).not.toHaveBeenCalled();
    reference.next({ UUID: 'job-1-0', width: 512, height: 512, aspectRatio: 'square' } as MobiansImage);
    expect(component.showReferenceImage).toBeTrue();
    reference.next(null);
    expect(component.showReferenceImage).toBeFalse();
    expect(expanded).toHaveBeenCalledOnceWith(false);
  });

  it('getDownloadBlob should convert URL-backed WebP blobs to PNG when lossy downloads are disabled', async () => {
    const webpBlob = new Blob(['webp'], { type: 'image/webp' });
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    sharedServiceStub.getGenerationRequestValue.and.returnValue({ lossy_images: false });
    spyOn(blobMigrationServiceStub, 'convertWebPToPNG').and.resolveTo(pngBlob);
    spyOn(window, 'fetch').and.resolveTo(new Response(webpBlob));

    const result = await (component as any).getDownloadBlob({ UUID: 'download-1', url: 'blob:grid-image' });

    expect(blobMigrationServiceStub.convertWebPToPNG).toHaveBeenCalledTimes(1);
    expect(result).toBe(pngBlob);
  });
});
import { CharactersService } from 'src/app/characters/characters.service';
