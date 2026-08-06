import { TestBed } from '@angular/core/testing';

import { SharedService } from './shared.service';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

describe('SharedService', () => {
  let service: SharedService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SharedService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('owns a durable object URL for a Blob-backed reference image', () => {
    const createUrlSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:shared-reference');
    const source: MobiansImage = {
      UUID: 'reference-1',
      width: 1,
      height: 1,
      aspectRatio: 'square',
      blob: new Blob(['reference'], { type: 'image/png' }),
      url: 'blob:image-grid-temporary',
    };

    service.setReferenceImage(source);

    expect(createUrlSpy).toHaveBeenCalledOnceWith(source.blob!);
    expect(service.getReferenceImageValue()).not.toBe(source);
    expect(service.getReferenceImageValue()?.url).toBe('blob:shared-reference');
    expect(service.getReferenceImageValue()?.blob).toBe(source.blob);
  });

  it('keeps the reference URL alive across view teardown and revokes it only when replaced or cleared', () => {
    spyOn(URL, 'createObjectURL').and.returnValues('blob:reference-1', 'blob:reference-2');
    const revokeUrlSpy = spyOn(URL, 'revokeObjectURL');
    const first: MobiansImage = {
      UUID: 'reference-1', width: 1, height: 1, aspectRatio: 'square',
      blob: new Blob(['first'], { type: 'image/png' }),
    };
    const second: MobiansImage = {
      UUID: 'reference-2', width: 1, height: 1, aspectRatio: 'square',
      blob: new Blob(['second'], { type: 'image/png' }),
    };

    service.setReferenceImage(first);

    // Simulates ImageGrid being destroyed while navigating to Video. Shared
    // state still owns the reference preview, so nothing is revoked here.
    expect(revokeUrlSpy).not.toHaveBeenCalled();
    expect(service.getReferenceImageValue()?.url).toBe('blob:reference-1');

    service.setReferenceImage(second);
    expect(revokeUrlSpy).toHaveBeenCalledOnceWith('blob:reference-1');
    expect(service.getReferenceImageValue()?.url).toBe('blob:reference-2');

    service.setReferenceImage(null);
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:reference-2');
    expect(service.getReferenceImageValue()).toBeNull();
  });
});
