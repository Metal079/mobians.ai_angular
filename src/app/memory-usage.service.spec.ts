import { TestBed } from '@angular/core/testing';

import { MemoryUsageService } from './memory-usage.service';

describe('MemoryUsageService', () => {
  let service: MemoryUsageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MemoryUsageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
