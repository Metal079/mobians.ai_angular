import { TestBed } from '@angular/core/testing';

import { StableDiffusionService } from './stable-diffusion.service';

describe('StableDiffusionService', () => {
  let service: StableDiffusionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StableDiffusionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
