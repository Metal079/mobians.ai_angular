import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { BlobMigrationService } from 'src/app/blob-migration.service';
import { InpaintingMaskService } from 'src/app/inpainting-mask.service';
import { SharedService } from 'src/app/shared.service';

import { ImageGridComponent } from './image-grid.component';

describe('ImageGridComponent', () => {
  let component: ImageGridComponent;
  let fixture: ComponentFixture<ImageGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageGridComponent],
      providers: [
        {
          provide: SharedService,
          useValue: {
            getImages: () => of([]),
            getReferenceImage: () => of(null),
            getGenerationRequestValue: () => ({ lossy_images: true }),
            getInstructionValue: () => false,
            getReferenceImageValue: () => null,
            disableInstructions: () => {},
            enableInstructions: () => {},
            setReferenceImage: () => {},
            getImage: () => null
          }
        },
        {
          provide: InpaintingMaskService,
          useValue: { canvasData$: of(null), clearCanvasData: () => {} }
        },
        {
          provide: BlobMigrationService,
          useValue: { convertWebPToPNG: async (blob: Blob) => blob }
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
});
