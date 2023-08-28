import { TestBed } from '@angular/core/testing';

import { InpaintingMaskService } from './inpainting-mask.service';

describe('InpaintingMaskService', () => {
  let service: InpaintingMaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InpaintingMaskService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
