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

  const image = (id: string): MobiansImage => ({
    UUID: id, width: 1, height: 1, aspectRatio: 'square',
    blob: new Blob([id], { type: 'image/png' }),
  });

  it('keeps all generated previews readable after their source URLs are revoked', async () => {
    const sources = ['one', 'two', 'three', 'four'].map(id => {
      const source = image(id);
      return { ...source, url: URL.createObjectURL(source.blob!) };
    });
    service.setImages(sources);
    sources.forEach(source => URL.revokeObjectURL(source.url));

    // A newly mounted image view subscribes to the retained results.
    let restored: MobiansImage[] = [];
    const subscription = service.getImages().subscribe(images => restored = images);
    subscription.unsubscribe();
    expect(restored.length).toBe(4);
    for (let i = 0; i < restored.length; i++) {
      expect(restored[i]).not.toBe(sources[i]);
      expect(restored[i].url).not.toBe(sources[i].url);
      expect(restored[i].blob).toBe(sources[i].blob);
      expect(await (await fetch(restored[i].url!)).text()).toBe(sources[i].UUID);
    }
  });

  it('releases replaced or cleared previews without revoking caller-owned URLs', () => {
    spyOn(URL, 'createObjectURL').and.returnValues('blob:shared-one', 'blob:shared-two');
    const revoke = spyOn(URL, 'revokeObjectURL');
    service.setImages([{ ...image('one'), url: 'blob:caller-one' }]);
    expect(revoke).not.toHaveBeenCalled();

    service.setImages([image('two')]);
    expect(revoke).toHaveBeenCalledOnceWith('blob:shared-one');
    service.setImages([]);
    expect(revoke.calls.allArgs()).toEqual([['blob:shared-one'], ['blob:shared-two']]);
    expect(service.getImagesValue()).toEqual([]);
  });

  it('keeps unchanged previews alive when updating a single image', () => {
    const create = spyOn(URL, 'createObjectURL').and.returnValues('blob:one', 'blob:two', 'blob:three');
    const revoke = spyOn(URL, 'revokeObjectURL');
    service.setImages([image('one'), image('two')]);
    const previousImages = service.getImagesValue();

    service.updateImage(0, image('three'));
    expect(previousImages[0].UUID).toBe('one');
    expect(service.getImage(0)?.url).toBe('blob:three');
    expect(service.getImage(1)?.url).toBe('blob:two');
    expect(create).toHaveBeenCalledTimes(3);
    expect(revoke).toHaveBeenCalledOnceWith('blob:one');

    service.updateImage(1, { ...service.getImage(1)!, rating: true });
    expect(service.getImage(1)?.rating).toBeTrue();
    expect(create).toHaveBeenCalledTimes(3);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('preserves URL-only images without taking ownership of their URLs', () => {
    const create = spyOn(URL, 'createObjectURL');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const source = { ...image('remote'), blob: undefined, url: 'https://example.com/image.png' };
    service.setImages([source]);
    expect(service.getImage(0)?.url).toBe(source.url);
    service.setImages([]);
    expect(create).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('releases shared image and reference previews when the service is destroyed', () => {
    spyOn(URL, 'createObjectURL').and.returnValues('blob:result', 'blob:reference');
    const revoke = spyOn(URL, 'revokeObjectURL');
    service.setImages([image('result')]);
    service.setReferenceImage(image('reference'));

    service.ngOnDestroy();
    service.ngOnDestroy();
    expect(revoke.calls.allArgs()).toEqual([['blob:result'], ['blob:reference']]);
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
