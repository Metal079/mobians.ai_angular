import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { ImageSyncService } from './image-sync.service';

describe('ImageSyncService', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let http: jasmine.SpyObj<HttpClient>;
  let service: ImageSyncService;

  beforeEach(() => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['getToken', 'isLoggedIn']);
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['delete', 'get', 'patch', 'post']);

    authService.getToken.and.returnValue('test-token');
    authService.isLoggedIn.and.returnValue(true);

    try {
      localStorage.clear();
    } catch {}

    service = new ImageSyncService(http, authService);
    (service as any).CLOUD_BLOB_BATCH_SIZE = 2;
  });

  it('downloadImageBlobs should request unique UUIDs in chunks and decode returned blobs', async () => {
    http.post.and.callFake((_url: string, body: any) => {
      const items = body.image_uuids.map((uuid: string) => ({
        image_uuid: uuid,
        image_blob: btoa(`blob-${uuid}`)
      }));
      return of(items);
    });

    const blobs = await service.downloadImageBlobs(['img-1', 'img-2', 'img-1', ' ', 'img-3']);

    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.post.calls.argsFor(0)[1]).toEqual({ image_uuids: ['img-1', 'img-2'] });
    expect(http.post.calls.argsFor(1)[1]).toEqual({ image_uuids: ['img-3'] });
    expect(blobs.size).toBe(3);
    expect(await blobs.get('img-1')?.text()).toBe('blob-img-1');
  });

  it('downloadImageBlobs should not call the API when logged out', async () => {
    authService.isLoggedIn.and.returnValue(false);

    const blobs = await service.downloadImageBlobs(['img-1']);

    expect(blobs.size).toBe(0);
    expect(http.post).not.toHaveBeenCalled();
  });
});
