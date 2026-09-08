import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { BlobMigrationService } from 'src/app/blob-migration.service';
import { InpaintingMaskService } from 'src/app/inpainting-mask.service';
import { SharedService } from 'src/app/shared.service';

import { ImageGridComponent } from './image-grid.component';

describe('ImageGridComponent', () => {
  let component: ImageGridComponent;
  let fixture: ComponentFixture<ImageGridComponent>;
  let sharedServiceStub: any;
  let blobMigrationServiceStub: any;

  beforeEach(async () => {
    sharedServiceStub = {
      getImages: () => of([]),
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
      convertWebPToPNG: async (blob: Blob) => blob
    };

    await TestBed.configureTestingModule({
      imports: [ImageGridComponent],
      providers: [
        { provide: CharactersService, useValue: { requestSave: () => {} } },
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
