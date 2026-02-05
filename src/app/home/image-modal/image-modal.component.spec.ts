import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { GligenService } from 'src/app/gligen.service';
import { InpaintingMaskService } from 'src/app/inpainting-mask.service';
import { SharedService } from 'src/app/shared.service';

import { ImageModalComponent } from './image-modal.component';

describe('ImageModalComponent', () => {
  let component: ImageModalComponent;
  let fixture: ComponentFixture<ImageModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageModalComponent],
      providers: [
        { provide: GligenService, useValue: {} },
        {
          provide: SharedService,
          useValue: {
            getGenerationRequest: () => of(null),
            getReferenceImageValue: () => null,
            setReferenceImage: () => {},
            setGenerationRequest: () => {}
          }
        },
        {
          provide: InpaintingMaskService,
          useValue: {
            getCurrentCanvasData: () => null,
            setCanvasData: () => {}
          }
        }
      ]
    })
      .overrideComponent(ImageModalComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(ImageModalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
