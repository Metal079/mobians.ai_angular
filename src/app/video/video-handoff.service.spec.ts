import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { AccountCtaService } from '../auth/account-cta.service';
import { AuthService } from '../auth/auth.service';
import { VideoHandoffService } from './video-handoff.service';

describe('VideoHandoffService', () => {
  let service: VideoHandoffService;
  let router: jasmine.SpyObj<Router>;
  let auth: jasmine.SpyObj<AuthService>;
  let accountCta: jasmine.SpyObj<AccountCtaService>;
  let tag: jasmine.Spy;
  let originalTag: any;
  const pngBlob = new Blob(['png'], { type: 'image/png' });
  const image = { UUID: 'grid-1', width: 512, height: 768, url: 'blob:grid-image' } as MobiansImage;

  beforeEach(() => {
    localStorage.removeItem('video:open-first-frame-picker');
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn']);
    accountCta = jasmine.createSpyObj<AccountCtaService>('AccountCtaService', ['requestLogin']);
    originalTag = (window as any).gtag;
    tag = (window as any).gtag = jasmine.createSpy('gtag');
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: auth },
        { provide: AccountCtaService, useValue: accountCta }
      ]
    });
    service = TestBed.inject(VideoHandoffService);
  });

  afterEach(() => {
    localStorage.removeItem('video:open-first-frame-picker');
    if (originalTag === undefined) delete (window as any).gtag;
    else (window as any).gtag = originalTag;
  });

  it('takes a signed-in user to the video page with the image ready to be the first frame', async () => {
    auth.isLoggedIn.and.returnValue(true);
    const load = jasmine.createSpy('load').and.resolveTo(pngBlob);
    expect(await service.animate(image, load, 'image_grid')).toBe('opened');
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/video');
    expect(service.take()).toEqual({ ...image, blob: pngBlob });
    expect(service.take()).toBeNull();                       // handed over once
    expect(accountCta.requestLogin).not.toHaveBeenCalled();
    expect(tag.calls.allArgs()).toEqual([['event', 'animate_click',
      { placement: 'image_grid', signed_in: true, send_to: 'G-NQ1MYQTHLM' }]]);
  });

  it('uses data the image already holds instead of loading it again', async () => {
    auth.isLoggedIn.and.returnValue(true);
    const load = jasmine.createSpy('load');
    await service.animate({ ...image, blob: pngBlob }, load, 'image_grid');
    expect(load).not.toHaveBeenCalled();
    expect(service.take()!.blob).toBe(pngBlob);
  });

  it('asks a visitor with no account to sign in, to land on the video page with their images offered', async () => {
    auth.isLoggedIn.and.returnValue(false);
    const load = jasmine.createSpy('load');
    expect(await service.animate(image, load, 'image_grid')).toBe('sign-in');
    expect(accountCta.requestLogin).toHaveBeenCalledOnceWith({ reason: 'animate', returnPath: '/video' });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(service.take()).toBeNull();
    expect(service.takePickerRequest()).toBeTrue();
    expect(service.takePickerRequest()).toBeFalse();         // asked once
    expect(tag.calls.mostRecent().args[2]).toEqual(jasmine.objectContaining({ signed_in: false }));
  });

  it('leaves nothing behind when the image cannot be read or the page does not open', async () => {
    auth.isLoggedIn.and.returnValue(true);
    expect(await service.animate(image, async () => null, 'image_grid')).toBe('failed');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    router.navigateByUrl.and.resolveTo(false);
    expect(await service.animate(image, async () => pngBlob, 'image_grid')).toBe('failed');
    expect(service.take()).toBeNull();
  });

  it('forgets a sign-in wish after fifteen minutes', () => {
    expect(service.takePickerRequest()).toBeFalse();
    service.requestPickerAfterSignIn();
    localStorage.setItem('video:open-first-frame-picker', String(Date.now() - 16 * 60 * 1000));
    expect(service.takePickerRequest()).toBeFalse();
  });

  it('works when storage is unavailable', () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    expect(() => service.requestPickerAfterSignIn()).not.toThrow();
    expect(service.takePickerRequest()).toBeFalse();
  });
});
