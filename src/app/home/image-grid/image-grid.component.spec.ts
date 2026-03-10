import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
