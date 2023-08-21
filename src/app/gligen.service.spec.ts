import { TestBed } from '@angular/core/testing';

import { GligenService } from './gligen.service';

describe('GligenService', () => {
  let service: GligenService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GligenService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
