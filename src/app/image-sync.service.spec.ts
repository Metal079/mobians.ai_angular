import { HttpClient } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { ImageSyncService } from './image-sync.service';

describe('ImageSyncService', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let http: jasmine.SpyObj<HttpClient>;
  let service: ImageSyncService;

  beforeEach(() => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['getToken', 'isLoggedIn', 'getUserId']);
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['delete', 'get', 'patch', 'post']);

    authService.getToken.and.returnValue('test-token');
    authService.isLoggedIn.and.returnValue(true);
    authService.getUserId.and.returnValue('user-1');

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

  it('PATCHes an empty tag array when removing the last tag without deleting the image or tag', async () => {
    spyOn(service, 'isImageSynced').and.returnValue(true);
    http.patch.and.returnValue(of({ success: true }));

    expect(await service.updateImageMetadata('image-1', { tags: [] })).toBeTrue();
    expect(http.patch).toHaveBeenCalledWith(
      jasmine.stringMatching(/\/history\/sync\/image\/image-1$/),
      { tags: [] }, jasmine.any(Object)
    );
    expect(http.delete).not.toHaveBeenCalled();
  });

  it('uses the quota reported by the API and permits the 1,500th upload', async () => {
    http.get.and.returnValue(of({ images_in_cloud: 1499, quota_limit: 1500, synced_uuids: [] }));
    const status = await service.fetchSyncStatus();
    expect(status.quota).toEqual({ used: 1499, limit: 1500 });
    http.post.and.returnValue(of({ success: true }));
    const image: any = { UUID: 'last-slot', width: 1, height: 1, aspectRatio: '1:1', favorite: true };
    expect(await service.syncImage(image, new Blob(['pixels']))).toBeTrue();
    expect(await service.syncImage({ ...image, UUID: 'over-limit' }, new Blob(['pixels']))).toBeFalse();
    expect(http.post).toHaveBeenCalledTimes(1);
    // Updating an existing image remains allowed at the limit.
    expect(await service.syncImage(image, new Blob(['pixels']))).toBeTrue();
  });

  it('reports batch upload failures instead of returning a successful backup', async () => {
    spyOn(service, 'syncImage').and.resolveTo(false);
    const result = await service.syncBatchImages([{ UUID: 'failed' } as any], async () => new Blob(['pixels']));
    expect(result.success).toBeFalse();
    expect(result.uploadedCount).toBe(0);
    expect(result.errors.length).toBe(1);
  });

  it('reports images left on the device when a batch reaches the cloud limit', async () => {
    const subject = (service as any).syncStatusSubject;
    subject.next({ ...subject.value, quota: { used: 1499, limit: 1500 } });
    spyOn(service, 'syncImage').and.callFake(async () => {
      subject.next({ ...subject.value, quota: { used: 1500, limit: 1500 } });
      return true;
    });
    const result = await service.syncBatchImages(['a', 'b', 'c'].map(UUID => ({ UUID } as any)), async () => new Blob(['pixels']));
    expect(result.uploadedCount).toBe(1);
    expect(result.success).toBeFalse();
    expect(result.errors[0]).toContain('2 image(s) remain on this device');
  });

  it('does not turn a failed cloud read into an empty library', async () => {
    http.get.and.returnValue(throwError(() => new Error('Offline')));
    await expectAsync(service.downloadFromCloud(false)).toBeRejected();
  });

  it('clears stale sync membership after a missing-image PATCH so it can be uploaded again', async () => {
    (service as any).syncedImageUUIDs.add('missing');
    http.patch.and.returnValue(throwError(() => ({ status: 404 })));
    expect(await service.updateImageMetadata('missing', { is_favorite: true })).toBeFalse();
    expect(service.isImageSynced('missing')).toBeFalse();
  });

  it('does not reuse another account\'s synced UUID cache', async () => {
    (service as any).syncedImageUUIDs.add('first-user-image');
    expect(service.isImageSynced('first-user-image')).toBeTrue();
    authService.getUserId.and.returnValue('user-2');
    expect(service.isImageSynced('first-user-image')).toBeFalse();
  });

  it('deletes the cloud backup and immediately frees its quota slot', async () => {
    http.get.and.returnValue(of({ images_in_cloud: 30, quota_limit: 1500, synced_uuids: ['unstarred'] }));
    await service.fetchSyncStatus();
    http.delete.and.returnValue(of({ success: true }));
    expect(await service.unsyncImage('unstarred')).toBeTrue();
    expect(http.delete).toHaveBeenCalledWith(
      jasmine.stringMatching(/\/history\/sync\/image\/unstarred$/), jasmine.any(Object));
    expect(service.isImageSynced('unstarred')).toBeFalse();
    expect((service as any).syncStatusSubject.value.quota.used).toBe(29);
    expect((service as any).syncStatusSubject.value.imagesInCloud).toBe(29);
  });

  it('treats an already removed backup as success without decrementing quota twice', async () => {
    http.get.and.returnValue(of({ images_in_cloud: 30, quota_limit: 1500, synced_uuids: ['missing'] }));
    await service.fetchSyncStatus();
    http.delete.and.returnValue(throwError(() => ({ status: 404 })));
    expect(await service.unsyncImage('missing')).toBeTrue();
    expect(await service.unsyncImage('missing')).toBeTrue();
    expect((service as any).syncStatusSubject.value.quota.used).toBe(29);
    expect(service.isImageSynced('missing')).toBeFalse();
  });

  it('keeps membership and quota when cloud removal fails', async () => {
    http.get.and.returnValue(of({ images_in_cloud: 30, quota_limit: 1500, synced_uuids: ['retained'] }));
    await service.fetchSyncStatus();
    http.delete.and.returnValue(throwError(() => ({ status: 503 })));
    expect(await service.unsyncImage('retained')).toBeFalse();
    expect(service.isImageSynced('retained')).toBeTrue();
    expect((service as any).syncStatusSubject.value.quota.used).toBe(30);
  });

  it('does not apply a cloud deletion response to another account', async () => {
    const response = new Subject<any>();
    http.delete.and.returnValue(response);
    const deletion = service.unsyncImage('first-user-image');
    authService.getUserId.and.returnValue('user-2');
    service.isImageSynced('second-user-image'); // Initialize the second account's cache.
    (service as any).syncedImageUUIDs.add('second-user-image');
    response.next({ success: true });
    expect(await deletion).toBeFalse();
    expect(service.isImageSynced('second-user-image')).toBeTrue();
  });

  it('discards a cloud response if the signed-in account changed during the request', async () => {
    const response = new Subject<any[]>();
    http.get.and.returnValue(response);
    const download = service.downloadFromCloud(false);
    authService.getUserId.and.returnValue('user-2');
    response.next([{ image_uuid: 'first-user-image' }]);
    expect((await download).images).toEqual([]);
    expect(service.isImageSynced('first-user-image')).toBeFalse();
  });

  it('keeps an upload committed while an older sync-status response was in flight', async () => {
    const statusResponse = new Subject<any>();
    http.get.and.returnValue(statusResponse);
    const status = service.fetchSyncStatus();
    http.post.and.returnValue(of({ success: true }));
    expect(await service.syncImage({ UUID: 'new-favorite' } as any, new Blob(['pixels']))).toBeTrue();

    statusResponse.next({ images_in_cloud: 0, quota_limit: 1500, synced_uuids: [] });
    await status;

    expect(service.isImageSynced('new-favorite')).toBeTrue();
    expect((service as any).syncStatusSubject.value.quota.used).toBe(1);
  });

  it('does not restore removed membership from an older sync-status response', async () => {
    http.get.and.returnValue(of({ images_in_cloud: 1, quota_limit: 1500, synced_uuids: ['removed'] }));
    await service.fetchSyncStatus();
    const statusResponse = new Subject<any>();
    http.get.and.returnValue(statusResponse);
    const status = service.fetchSyncStatus();
    http.delete.and.returnValue(of({ success: true }));
    await service.unsyncImage('removed');

    statusResponse.next({ images_in_cloud: 1, quota_limit: 1500, synced_uuids: ['removed'] });
    await status;

    expect(service.isImageSynced('removed')).toBeFalse();
    expect((service as any).syncStatusSubject.value.quota.used).toBe(0);
  });

  it('ignores an older status response that arrives after a newer request', async () => {
    const olderResponse = new Subject<any>();
    const newerResponse = new Subject<any>();
    http.get.and.returnValues(olderResponse, newerResponse);
    const older = service.fetchSyncStatus();
    const newer = service.fetchSyncStatus();
    newerResponse.next({ images_in_cloud: 2, quota_limit: 1500, synced_uuids: ['a', 'b'] });
    await newer;
    olderResponse.next({ images_in_cloud: 1, quota_limit: 1500, synced_uuids: ['a'] });
    await older;

    expect(service.isImageSynced('b')).toBeTrue();
    expect((service as any).syncStatusSubject.value.quota.used).toBe(2);
  });

  it('counts concurrent successful uploads of the same UUID only once', async () => {
    spyOn<any>(service, 'blobToBase64').and.resolveTo('cGl4ZWxz');
    http.post.and.returnValue(of({ success: true }));
    const image = { UUID: 'same-image' } as any;
    const results = await Promise.all([
      service.syncImage(image, new Blob(['pixels'])),
      service.syncImage(image, new Blob(['pixels']))
    ]);

    expect(results).toEqual([true, true]);
    expect((service as any).syncStatusSubject.value.quota.used).toBe(1);
  });

  it('stops a backup if the account changes while a local blob is loading', async () => {
    const upload = spyOn(service, 'syncImage').and.resolveTo(true);
    const result = await service.syncBatchImages([{ UUID: 'old-account-image' } as any], async () => {
      authService.getUserId.and.returnValue('user-2');
      service.isImageSynced('new-account-image');
      const subject = (service as any).syncStatusSubject;
      subject.next({ ...subject.value, isSyncing: true, lastSyncTime: 'new-account-sync' });
      return new Blob(['pixels']);
    });

    expect(upload).not.toHaveBeenCalled();
    expect(result.success).toBeFalse();
    expect(result.errors[0]).toContain('account changed');
    expect((service as any).syncStatusSubject.value.isSyncing).toBeTrue();
    expect((service as any).syncStatusSubject.value.lastSyncTime).toBe('new-account-sync');
  });

  it('does not continue a backup into a different account after an upload finishes', async () => {
    const upload = spyOn(service, 'syncImage').and.callFake(async () => {
      authService.getUserId.and.returnValue('user-2');
      return false;
    });
    const getBlob = jasmine.createSpy('getBlob').and.resolveTo(new Blob(['pixels']));
    const result = await service.syncBatchImages(['first', 'second'].map(UUID => ({ UUID } as any)), getBlob);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(getBlob).toHaveBeenCalledTimes(1);
    expect(result.success).toBeFalse();
    expect(result.errors[0]).toContain('account changed');
  });

  it('does not remove new-account membership after an old-account metadata request returns 404', async () => {
    (service as any).syncedImageUUIDs.add('shared-uuid');
    const response = new Subject<any>();
    http.patch.and.returnValue(response);
    const update = service.updateImageMetadata('shared-uuid', { is_favorite: true });
    authService.getUserId.and.returnValue('user-2');
    service.isImageSynced('shared-uuid');
    (service as any).syncedImageUUIDs.add('shared-uuid');
    response.error({ status: 404 });

    expect(await update).toBeFalse();
    expect(service.isImageSynced('shared-uuid')).toBeTrue();
  });

  it('does not report an old-account metadata response as success in a new account', async () => {
    (service as any).syncedImageUUIDs.add('shared-uuid');
    const response = new Subject<any>();
    http.patch.and.returnValue(response);
    const update = service.updateImageMetadata('shared-uuid', { is_favorite: true });
    authService.getUserId.and.returnValue('user-2');
    response.next({ success: true });

    expect(await update).toBeFalse();
  });

  it('reports a failed cloud metadata request with bounded sync context', async () => {
    const diagnostics = { report: jasmine.createSpy('report') };
    service = new ImageSyncService(http, authService, diagnostics as any);
    const failure = { name: 'HttpErrorResponse', status: 503 };
    http.get.and.returnValue(throwError(() => failure));

    await expectAsync(service.downloadFromCloud(false)).toBeRejectedWith(failure);

    expect(diagnostics.report).toHaveBeenCalledOnceWith('history.sync.metadata', failure, {
      cloudCount: 0, syncEnabled: false, requestedCount: undefined, httpStatus: 503
    });
  });
});
