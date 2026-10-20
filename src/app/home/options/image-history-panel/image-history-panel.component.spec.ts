import { ImageEditorService } from 'src/app/image-editor/image-editor.service';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthService } from 'src/app/auth/auth.service';
import { BlobMigrationService } from 'src/app/blob-migration.service';
import { ImageSyncService } from 'src/app/image-sync.service';
import { SharedService } from 'src/app/shared.service';
import { ImageTag, MobiansImage } from 'src/_shared/mobians-image.interface';
import { LoraHistoryPromptService } from '../lora-history-prompt.service';

import { ImageHistoryPanelComponent } from './image-history-panel.component';

class MessageServiceStub {
  add() {}
}

class BlobMigrationServiceStub {
  convertToWebP(blob: Blob) {
    return Promise.resolve(blob);
  }

  convertWebPToPNG(blob: Blob) {
    return Promise.resolve(blob);
  }

  embedPngTextMetadata(blob: Blob) {
    return Promise.resolve(blob);
  }
}

class SharedServiceStub {
  setReferenceImage() {}
  setPrompt() {}
}

class AuthServiceStub {
  credits$ = new BehaviorSubject<any>(null);
  isLoggedIn = jasmine.createSpy('isLoggedIn').and.returnValue(false);
  getUserId = jasmine.createSpy('getUserId').and.returnValue('user-1');
}

class ImageSyncServiceStub {
  syncStatus$ = of({
    syncEnabled: false,
    imagesInCloud: 0,
    quota: { used: 0, limit: 1500 },
    lastSyncTime: null,
    isSyncing: false
  });
  downloadFromCloud = jasmine.createSpy('downloadFromCloud').and.resolveTo({ images: [], blobs: new Map() });
  downloadImageBlobs = jasmine.createSpy('downloadImageBlobs').and.resolveTo(new Map());
  isImageSynced = jasmine.createSpy('isImageSynced').and.returnValue(false);
  updateImageMetadata = jasmine.createSpy('updateImageMetadata').and.resolveTo(true);
  syncImage = jasmine.createSpy('syncImage').and.resolveTo(true);
  syncTags = jasmine.createSpy('syncTags').and.resolveTo(true);
  getCloudTags = jasmine.createSpy('getCloudTags').and.resolveTo([]);
  deleteCloudTag = jasmine.createSpy('deleteCloudTag').and.resolveTo(true);
  fetchSyncStatus = jasmine.createSpy('fetchSyncStatus').and.resolveTo({
    syncEnabled: false,
    imagesInCloud: 0,
    quota: { used: 0, limit: 1500 },
    lastSyncTime: null,
    isSyncing: false
  });
  unsyncImage = jasmine.createSpy('unsyncImage').and.resolveTo(true);
}

class LoraHistoryPromptServiceStub {
  requestLoad() {}
}

describe('ImageHistoryPanelComponent', () => {
  let component: ImageHistoryPanelComponent;
  let fixture: ComponentFixture<ImageHistoryPanelComponent>;
  let authService: AuthServiceStub;
  let imageSyncService: ImageSyncServiceStub;

  const createImage = (overrides: Partial<MobiansImage>): MobiansImage => ({
    UUID: overrides.UUID ?? `uuid-${Math.random()}`,
    width: overrides.width ?? 1024,
    height: overrides.height ?? 1024,
    aspectRatio: overrides.aspectRatio ?? '1:1',
    favorite: overrides.favorite ?? false,
    tags: overrides.tags ?? [],
    prompt: overrides.prompt,
    promptSummary: overrides.promptSummary,
    timestamp: overrides.timestamp,
    loras: overrides.loras,
    model: overrides.model,
    seed: overrides.seed,
    negativePrompt: overrides.negativePrompt,
    cfg: overrides.cfg,
    syncPriority: overrides.syncPriority,
    lastModified: overrides.lastModified
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageHistoryPanelComponent],
      providers: [
        { provide: ImageEditorService, useValue: { available: () => false, pending: () => false, open: jasmine.createSpy('openEditor') } },
        { provide: CharactersService, useValue: { requestSave: () => {} } },
        { provide: MessageService, useClass: MessageServiceStub },
        { provide: BlobMigrationService, useClass: BlobMigrationServiceStub },
        { provide: SharedService, useClass: SharedServiceStub },
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: ImageSyncService, useClass: ImageSyncServiceStub },
        { provide: LoraHistoryPromptService, useClass: LoraHistoryPromptServiceStub }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    })
      .overrideComponent(ImageHistoryPanelComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(ImageHistoryPanelComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService) as unknown as AuthServiceStub;
    imageSyncService = TestBed.inject(ImageSyncService) as unknown as ImageSyncServiceStub;

    spyOn((component as any).cdr, 'detectChanges').and.stub();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('history shared by the generator and editor picker', () => {
    let pickerFixture: ComponentFixture<ImageHistoryPanelComponent>;
    let picker: ImageHistoryPanelComponent;
    let db: IDBDatabase;
    let databaseName: string;
    const editedImage = (id: string, prompt = 'Make the jacket blue'): MobiansImage => ({
      ...createImage({ UUID:id, prompt, model:'FLUX.2-klein-4B', timestamp:new Date() }),
      blob:new Blob(['png pixels'], { type:'image/png' }),
      editProvenance:{ instruction:prompt, parent_image_uuid:'original', root_image_uuid:'original' },
    });

    beforeEach(async () => {
      databaseName = 'shared-history-test-' + Math.random();
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('ImageStore', { keyPath:'UUID' });
          request.result.createObjectStore('blobStore', { keyPath:'UUID' });
        };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      pickerFixture = TestBed.createComponent(ImageHistoryPanelComponent);
      picker = pickerFixture.componentInstance; picker.pickerMode = true;
      for (const panel of [component, picker]) {
        spyOn(panel, 'getDatabase').and.resolveTo(db);
        spyOn(panel, 'initializeHistory').and.resolveTo();
        spyOn<any>(panel, 'hydrateImageUrls').and.resolveTo();
        spyOn<any>(panel, 'updateFavoriteImages').and.resolveTo();
        panel.ngOnInit();
      }
    });
    afterEach(async () => {
      pickerFixture.destroy(); fixture.destroy(); db.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
      });
    });

    it('shows a committed edit in the already-mounted generator history without a reload', async () => {
      const refresh = spyOn(component, 'searchImages').and.callThrough();
      const image = editedImage('fresh-edit');
      expect(component.currentPageImages).toEqual([]);
      expect(await picker.ingestGeneratedImages([image])).toBeTrue();
      expect(refresh).toHaveBeenCalledOnceWith(true);
      await refresh.calls.mostRecent().returnValue;
      expect(component.currentPageImages.map(item => item.UUID)).toContain(image.UUID);
      expect(component.currentPageImages[0].editProvenance).toEqual(image.editProvenance);

      const pickerRefresh = spyOn(picker, 'searchImages').and.callThrough();
      expect(await component.ingestGeneratedImages([editedImage('generator-result')])).toBeTrue();
      expect(pickerRefresh).toHaveBeenCalledOnceWith(true);
      await pickerRefresh.calls.mostRecent().returnValue;
      expect(picker.currentPageImages.map(item => item.UUID)).toContain('generator-result');
      // The saving panel updates itself; the event must not cause a refresh loop.
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('keeps the generator search and current page when an edit is saved elsewhere', async () => {
      await component.ingestGeneratedImages([editedImage('existing')]);
      component.searchQuery = 'jacket';
      await component.searchImages();
      const refresh = spyOn(component, 'searchImages').and.callThrough();
      expect(await picker.ingestGeneratedImages([editedImage('nonmatching', 'Make it nighttime')])).toBeTrue();
      await refresh.calls.mostRecent().returnValue;
      expect(component.searchQuery).toBe('jacket'); expect(component.currentPageNumber).toBe(1);
      expect(component.currentPageImages.map(item => item.UUID)).toEqual(['existing']);
    });

    it('does not announce a failed save or refresh a destroyed history panel', async () => {
      const refresh = spyOn(component, 'searchImages').and.callThrough();
      const persist = spyOn<any>(picker, 'persistGeneratedImage').and.resolveTo(false);
      expect(await picker.ingestGeneratedImages([editedImage('failed')])).toBeFalse();
      expect(refresh).not.toHaveBeenCalled();
      persist.and.callThrough(); fixture.destroy();
      expect(await picker.ingestGeneratedImages([editedImage('after-navigation')])).toBeTrue();
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('image tag editing', () => {
    let db: IDBDatabase;
    let databaseName: string;
    const tag = { id: 'remove-me', name: 'Adventure', color: '#45B7D1' } as ImageTag;
    const otherTag = { id: 'keep-me', name: 'Portrait', color: '#FF6B6B' } as ImageTag;
    let messages: jasmine.Spy;

    const readImage = (uuid: string) => new Promise<MobiansImage>((resolve, reject) => {
      const request = db.transaction('ImageStore').objectStore('ImageStore').get(uuid);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    beforeEach(async () => {
      databaseName = `tag-edit-test-${Math.random()}`;
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('ImageStore', { keyPath: 'UUID' });
          request.result.createObjectStore('TagStore', { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const images = [
        createImage({ UUID: 'first', favorite: true, tags: [tag.id, otherTag.id] }),
        createImage({ UUID: 'second', favorite: true, tags: [tag.id] }),
        createImage({ UUID: 'untouched', favorite: true, tags: [tag.id] })
      ];
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['ImageStore', 'TagStore'], 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        images.forEach(image => transaction.objectStore('ImageStore').put(image));
        [tag, otherTag].forEach(item => transaction.objectStore('TagStore').put(item));
      });
      component.availableTags = [{ ...tag }, { ...otherTag }];
      component.imageHistoryMetadata = images.map(image => ({ ...image }));
      component.currentPageImages = images.map(image => ({ ...image }));
      spyOn(component as any, 'getDatabase').and.resolveTo(db);
      spyOn(component, 'paginateFavoriteImages').and.callFake(async images => images);
      spyOn(component as any, 'notifyTagsUpdated').and.stub();
      messages = spyOn(TestBed.inject(MessageService), 'add');
    });

    afterEach(async () => {
      db.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    it('removes only the selected image association and refreshes filtered favorites and counts', async () => {
      component.selectedTagFilter = tag.id;
      await component.openTagAssignDialog(['first'], 'edit');
      await component.changeTagFromDialog(tag, true);

      expect((await readImage('first')).tags).toEqual([otherTag.id]);
      expect((await readImage('first')).favorite).toBeTrue();
      expect((await readImage('untouched')).tags).toEqual([tag.id]);
      expect(component.currentPageImages[0].tags).toEqual([otherTag.id]);
      expect(component.favoritePageImages.map(image => image.UUID)).not.toContain('first');
      expect(component.availableTags.find(item => item.id === tag.id)?.imageCount).toBe(2);
      expect(component.tagDialogCounts[tag.id] || 0).toBe(0);
      const storedTag = await new Promise<any>(resolve => {
        const request = db.transaction('TagStore').objectStore('TagStore').get(tag.id);
        request.onsuccess = () => resolve(request.result);
      });
      expect(storedTag.name).toBe(tag.name);
      expect(imageSyncService.deleteCloudTag).not.toHaveBeenCalled();
    });

    it('bulk removes the last tag, sends an empty array to cloud, and ignores repeated and missing selections', async () => {
      authService.isLoggedIn.and.returnValue(true);
      imageSyncService.isImageSynced.and.returnValue(true);
      component.selectedImages = new Set(['first', 'second']);
      await component.openTagAssignDialog(undefined, 'remove');
      expect(component.tagDialogCounts[tag.id]).toBe(2);
      await component.removeTagFromImages(tag, ['first', 'second', 'second', 'missing']);

      expect((await readImage('second')).tags).toEqual([]);
      expect((await readImage('untouched')).tags).toEqual([tag.id]);
      expect(imageSyncService.updateImageMetadata).toHaveBeenCalledTimes(2);
      expect(imageSyncService.updateImageMetadata).toHaveBeenCalledWith('first', { tags: [otherTag.id] });
      expect(imageSyncService.updateImageMetadata).toHaveBeenCalledWith('second', { tags: [] });
      expect(imageSyncService.syncImage).not.toHaveBeenCalled();
    });

    it('allows adding a removed tag back without duplicate assignments', async () => {
      await component.openTagAssignDialog(['first'], 'edit');
      await component.changeTagFromDialog(tag, true);
      await component.assignTagToImages(tag);
      await component.assignTagToImages(tag);
      expect((await readImage('first')).tags).toEqual([otherTag.id, tag.id]);
      expect(component.tagDialogCounts[tag.id]).toBe(1);
    });

    it('reports cloud failure while retaining the committed local removal', async () => {
      authService.isLoggedIn.and.returnValue(true);
      imageSyncService.isImageSynced.and.returnValue(true);
      imageSyncService.updateImageMetadata.and.resolveTo(false);
      await component.openTagAssignDialog(['second'], 'edit');
      await component.changeTagFromDialog(tag, true);
      expect((await readImage('second')).tags).toEqual([]);
      expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'warn' }));
      expect(component.isUpdatingTags).toBeFalse();
    });

    it('reports storage failures without changing visible tags or calling the cloud', async () => {
      await component.openTagAssignDialog(['first'], 'edit');
      (component as any).getDatabase.and.rejectWith(new Error('Storage unavailable'));
      await component.changeTagFromDialog(tag, true);
      expect(component.currentPageImages[0].tags).toEqual([tag.id, otherTag.id]);
      expect(imageSyncService.updateImageMetadata).not.toHaveBeenCalled();
      expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error' }));
      expect(component.isUpdatingTags).toBeFalse();
    });
  });

  it('retains edit lineage and lossless PNGs after saving and reloading history', async () => {
    const databaseName = 'edit-lineage-test-' + Math.random();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('ImageStore', { keyPath: 'UUID' });
        request.result.createObjectStore('blobStore', { keyPath: 'UUID' });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    spyOn(component as any, 'getDatabase').and.resolveTo(db);
    spyOn(component as any, 'hydrateImageUrls').and.resolveTo();
    spyOn(component as any, 'updateFavoriteImages').and.resolveTo();
    const migration = TestBed.inject(BlobMigrationService);
    spyOn(migration, 'convertToWebP').and.callThrough();
    const provenance = { instruction: 'Blue jacket', root_image_uuid: 'original', parent_image_uuid: 'previous', model: 'FLUX.2-klein-4B' };
    const image = { ...createImage({ UUID: 'edited-fixture', prompt: 'Blue jacket' }),
      editProvenance: provenance, blob: new Blob(['lossless-pixels'], { type: 'image/png' }) };
    try {
      expect(await (component as any).persistGeneratedImage(image)).toBeTrue();
      await component.searchImages();
      expect(component.currentPageImages[0].editProvenance).toEqual(provenance);
      expect(migration.convertToWebP).not.toHaveBeenCalled();
      expect(JSON.parse((component as any).buildImageMetadataDict(component.currentPageImages[0]).edit_provenance)).toEqual(provenance);
    } finally {
      db.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
      });
    }
  });

  it('stores a compressed history copy without replacing the generated PNG shared with the viewer', async () => {
    const original = new Blob(['original'], { type: 'image/png' });
    const compressed = new Blob(['compressed'], { type: 'image/webp' });
    const image = { ...createImage({ UUID: 'format-fixture' }), blob: original, url: URL.createObjectURL(original) };
    const migration = TestBed.inject(BlobMigrationService);
    spyOn(migration, 'convertToWebP').and.resolveTo(compressed);
    const databaseName = 'image-format-test-' + Math.random();
    const storeName = (component as any).storeName;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(storeName, { keyPath: 'UUID' });
        request.result.createObjectStore('blobStore', { keyPath: 'UUID' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    spyOn(component as any, 'getDatabase').and.resolveTo(db);
    try {
      expect(await (component as any).persistGeneratedImage(image)).toBeTrue();
      const stored = await new Promise<any>((resolve, reject) => {
        const request = db.transaction('blobStore', 'readonly').objectStore('blobStore').get(image.UUID);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      expect(stored.blob.type).toBe('image/webp');
      expect(await stored.blob.text()).toBe('compressed');
      expect(image.blob).toBe(original);
      expect((await (await fetch(image.url)).blob()).type).toBe('image/png');
    } finally {
      URL.revokeObjectURL(image.url);
      db.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  });

  it('toggleFavorite should persist and refresh favorites and tag counts', async () => {
    const image = createImage({ UUID: 'img-1', favorite: false });
    const callOrder: string[] = [];

    spyOn(component as any, 'updateImageInDB').and.callFake(async () => {
      callOrder.push('update-db');
      return true;
    });
    spyOn(component, 'updateFavoriteImages').and.callFake(async () => {
      callOrder.push('update-favorites');
    });
    spyOn(component, 'updateTagCounts').and.callFake(async () => {
      callOrder.push('update-tags');
    });

    authService.isLoggedIn.and.returnValue(false);

    await component.toggleFavorite(image);

    expect(image.favorite).toBeTrue();
    expect(callOrder).toEqual(['update-db', 'update-favorites', 'update-tags']);
  });

  it('toggleFavorite should keep all-images metadata in sync when toggled from favorites collection', async () => {
    const metadataImage = createImage({ UUID: 'shared-uuid', favorite: true });
    const favoriteViewImage = createImage({ UUID: 'shared-uuid', favorite: true });
    component.imageHistoryMetadata = [metadataImage];
    component.favoritePageImages = [favoriteViewImage];

    spyOn(component as any, 'updateImageInDB').and.resolveTo(true);
    spyOn(component, 'updateFavoriteImages').and.resolveTo();
    spyOn(component, 'updateTagCounts').and.resolveTo();
    authService.isLoggedIn.and.returnValue(false);

    await component.toggleFavorite(favoriteViewImage);

    expect(component.imageHistoryMetadata[0].favorite).toBeFalse();
    expect(component.favoritePageImages[0].favorite).toBeFalse();
  });

  it('merges local and cloud history by UUID and keeps local changes', async () => {
    const localImage = createImage({ UUID: 'local-1', favorite: true });
    authService.isLoggedIn.and.returnValue(true);
    spyOn(component as any, 'getAllImagesFromDb').and.resolveTo([localImage]);
    const cloudOnly = createImage({ UUID: 'cloud-only', favorite: true });
    imageSyncService.downloadFromCloud.and.resolveTo({ images: [cloudOnly, { ...localImage, favorite: false }], blobs: new Map() });

    const images = await (component as any).getHistorySourceImages();

    expect(images).toEqual([cloudOnly, localImage]);
    expect(imageSyncService.downloadFromCloud).toHaveBeenCalledWith(false);
  });

  it('getHistorySourceImages should fall back to cloud data when local history is empty', async () => {
    const cloudImage = createImage({ UUID: 'cloud-1', favorite: true });
    authService.isLoggedIn.and.returnValue(true);
    spyOn(component as any, 'getAllImagesFromDb').and.resolveTo([]);
    imageSyncService.downloadFromCloud.and.resolveTo({
      images: [cloudImage],
      blobs: new Map()
    });

    const images = await (component as any).getHistorySourceImages();

    expect(images).toEqual([cloudImage]);
    expect(imageSyncService.downloadFromCloud).toHaveBeenCalledWith(false);
  });

  it('mergeCloudImages should fetch metadata first and blobs only for missing local images', async () => {
    const localImage = createImage({ UUID: 'local-1', favorite: false, tags: [] });
    const cloudLocalImage = createImage({ UUID: 'local-1', favorite: true, tags: ['tag-1'] });
    const cloudMissingImage = createImage({ UUID: 'missing-1', favorite: true, tags: [] });
    const missingBlob = new Blob(['missing'], { type: 'image/webp' });
    const fakeDb = {} as IDBDatabase;

    imageSyncService.downloadFromCloud.and.resolveTo({
      images: [cloudLocalImage, cloudMissingImage],
      blobs: new Map()
    });
    imageSyncService.downloadImageBlobs.and.resolveTo(new Map([
      ['missing-1', missingBlob]
    ]));

    spyOn(component as any, 'getDatabase').and.resolveTo(fakeDb);
    spyOn(component as any, 'getLocalImage').and.callFake((_db: IDBDatabase, uuid: string) => {
      return Promise.resolve(uuid === 'local-1' ? localImage : null);
    });
    spyOn(component as any, 'hasStoredImageBlob').and.resolveTo(true);
    spyOn(component as any, 'updateLocalCloudMetadata').and.callFake(async (
      _db: IDBDatabase,
      local: MobiansImage,
      cloud: MobiansImage
    ) => {
      local.favorite = cloud.favorite;
      local.tags = cloud.tags;
      return true;
    });
    spyOn(component as any, 'storeCloudImage').and.resolveTo(true);
    spyOn(component, 'searchImages').and.resolveTo();
    spyOn(component, 'paginateImages').and.resolveTo([]);
    spyOn(component, 'updateFavoriteImages').and.resolveTo();
    spyOn(component, 'updateTagCounts').and.resolveTo();

    const mergedCount = await component.mergeCloudImages();

    expect(imageSyncService.downloadFromCloud).toHaveBeenCalledWith(false);
    expect(imageSyncService.downloadImageBlobs).toHaveBeenCalledOnceWith(['missing-1']);
    expect((component as any).storeCloudImage).toHaveBeenCalledWith(fakeDb, cloudMissingImage, missingBlob);
    expect(localImage.favorite).toBeTrue();
    expect(localImage.tags).toEqual(['tag-1']);
    expect(mergedCount).toBe(2);
  });

  it('updateFavoriteImages should apply tag/search filters and reset page when preservePage is false', async () => {
    const sourceImages: MobiansImage[] = [
      createImage({ UUID: 'fav-1', favorite: true, tags: ['t1'], prompt: 'sunset beach', timestamp: new Date('2026-01-01') }),
      createImage({ UUID: 'fav-2', favorite: true, tags: ['t2'], prompt: 'forest path', timestamp: new Date('2026-01-02') }),
      createImage({ UUID: 'non-fav-1', favorite: false, tags: ['t2'], prompt: 'city lights', timestamp: new Date('2026-01-03') })
    ];

    component.favoriteCurrentPageNumber = 3;
    component.favoriteImagesPerPage = 9;
    component.selectedTagFilter = 't2';
    component.favoriteSearchQuery = 'forest';

    spyOn(component as any, 'getHistorySourceImages').and.resolveTo(sourceImages);
    spyOn(component, 'paginateFavoriteImages').and.callFake(async (images) => images as MobiansImage[]);

    await component.updateFavoriteImages(false);

    expect(component.favoriteCurrentPageNumber).toBe(1);
    expect(component.favoriteTotalPages).toBe(1);
    expect(component.favoriteImageHistoryMetadata.map((img) => img.UUID)).toEqual(['fav-2']);
    expect(component.favoritePageImages.map((img) => img.UUID)).toEqual(['fav-2']);
  });

  it('updateTagCounts should count only favorite images per tag', async () => {
    component.availableTags = [
      { id: 't1', name: 'Tag 1', color: '#f00', createdAt: new Date(), imageCount: 0 },
      { id: 't2', name: 'Tag 2', color: '#0f0', createdAt: new Date(), imageCount: 0 }
    ] as ImageTag[];

    const sourceImages: MobiansImage[] = [
      createImage({ UUID: 'a', favorite: true, tags: ['t1', 't2'] }),
      createImage({ UUID: 'b', favorite: true, tags: ['t1'] }),
      createImage({ UUID: 'c', favorite: false, tags: ['t2'] })
    ];

    spyOn(component as any, 'getHistorySourceImages').and.resolveTo(sourceImages);

    await component.updateTagCounts();

    const tag1 = component.availableTags.find((tag) => tag.id === 't1');
    const tag2 = component.availableTags.find((tag) => tag.id === 't2');
    expect(tag1?.imageCount).toBe(2);
    expect(tag2?.imageCount).toBe(1);
  });

  describe('cloud favorites survive generation and failed saves', () => {
    let db: IDBDatabase;
    let databaseName: string;
    const cloudFavorite = () => createImage({ UUID: 'cloud-favorite', favorite: true, timestamp: new Date('2026-10-01') });

    beforeEach(async () => {
      databaseName = 'favorites-regression-' + Math.random();
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('ImageStore', { keyPath: 'UUID' });
          request.result.createObjectStore('blobStore', { keyPath: 'UUID' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      spyOn(component as any, 'getDatabase').and.resolveTo(db);
      spyOn(component as any, 'hydrateImageUrls').and.resolveTo();
      authService.isLoggedIn.and.returnValue(true);
      imageSyncService.downloadFromCloud.and.resolveTo({ images: [cloudFavorite()], blobs: new Map() });
    });

    afterEach(async () => {
      db.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
      });
    });

    const newImage = (UUID: string, favorite = false) => ({ ...createImage({ UUID, favorite }), blob: new Blob(['pixels'], { type: 'image/webp' }) });
    const readImage = (uuid: string) => (component as any).getLocalImage(db, uuid) as Promise<MobiansImage>;

    it('unfavoriting deletes the backup, retains the local image, and permits favoriting it again', async () => {
      const image = newImage('unstarred', true);
      await (component as any).persistGeneratedImage(image);
      (component as any).cloudImages.set(image.UUID, { ...image });
      // Even stale membership must not skip the DELETE request.
      imageSyncService.isImageSynced.and.returnValue(false);
      await component.toggleFavorite(image);
      expect(imageSyncService.unsyncImage).toHaveBeenCalledOnceWith(image.UUID);
      expect(imageSyncService.updateImageMetadata).not.toHaveBeenCalled();
      expect(imageSyncService.syncImage).not.toHaveBeenCalled();
      expect((await readImage(image.UUID)).favorite).toBeFalse();
      expect((await readImage(image.UUID)).favoriteSyncPending).toBeFalse();
      expect(await (await component.getImageBlob(image.UUID))!.text()).toBe('pixels');
      expect((component as any).cloudImages.has(image.UUID)).toBeFalse();
      imageSyncService.downloadFromCloud.and.resolveTo({ images: [{ ...image, favorite: true }], blobs: new Map() });
      await component.mergeCloudImages();
      expect((await readImage(image.UUID)).favorite).toBeFalse();
      expect(component.favoritePageImages.some(i => i.UUID === image.UUID)).toBeFalse();

      await component.toggleFavorite(image);
      expect(imageSyncService.syncImage).toHaveBeenCalledWith(image, jasmine.any(Blob));
      expect((await readImage(image.UUID)).favorite).toBeTrue();
      expect((component as any).deletedCloudImages.has(image.UUID)).toBeFalse();
    });

    it('retains a failed removal across reload and retries DELETE without restoring the star', async () => {
      const image = newImage('pending-removal', true);
      await (component as any).persistGeneratedImage(image);
      imageSyncService.unsyncImage.and.resolveTo(false);
      const messages = spyOn(TestBed.inject(MessageService), 'add');
      await component.toggleFavorite(image);
      const pending = await readImage(image.UUID);
      expect(pending.favorite).toBeFalse();
      expect(pending.favoriteSyncPending).toBeTrue();
      expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Cloud removal pending' }));
      await (component as any).updateLocalCloudMetadata(db, pending, { ...pending, favorite: true });
      expect((await readImage(image.UUID)).favorite).toBeFalse();

      const reloaded = TestBed.createComponent(ImageHistoryPanelComponent);
      spyOn(reloaded.componentInstance as any, 'getDatabase').and.resolveTo(db);
      imageSyncService.unsyncImage.and.resolveTo(true);
      await (reloaded.componentInstance as any).retryFavoriteChanges();
      expect(imageSyncService.unsyncImage).toHaveBeenCalledTimes(2);
      expect((await readImage(image.UUID)).favoriteSyncPending).toBeFalse();
      expect((await readImage(image.UUID)).favorite).toBeFalse();
      expect((await component.getImageBlob(image.UUID))!.size).toBeGreaterThan(0);
      reloaded.destroy();
    });

    it('saves a cloud-only image locally before removing its backup', async () => {
      const image = createImage({ UUID: 'cloud-only', favorite: true });
      imageSyncService.downloadImageBlobs.and.resolveTo(new Map([[image.UUID, new Blob(['restored'])]]));
      imageSyncService.unsyncImage.and.callFake(async () => {
        expect(await (await component.getImageBlob(image.UUID))!.text()).toBe('restored');
        return true;
      });
      await component.toggleFavorite(image);
      expect(imageSyncService.unsyncImage).toHaveBeenCalledOnceWith(image.UUID);
      expect((await readImage(image.UUID)).favoriteSyncPending).toBeFalse();
    });

    it('keeps the backup when a cloud-only image cannot be saved locally', async () => {
      const image = createImage({ UUID: 'no-local-space', favorite: true });
      imageSyncService.downloadImageBlobs.and.resolveTo(new Map([[image.UUID, new Blob(['restored'])]]));
      spyOn(component as any, 'storeCloudImageBlob').and.resolveTo(false);
      await component.toggleFavorite(image);
      expect(imageSyncService.unsyncImage).not.toHaveBeenCalled();
      expect((await readImage(image.UUID)).favoriteSyncPending).toBeTrue();
      expect((await readImage(image.UUID)).favorite).toBeFalse();
    });

    it('does not delete through a different account after downloading a local copy', async () => {
      const image = createImage({ UUID: 'account-switch-removal', favorite: true });
      imageSyncService.downloadImageBlobs.and.callFake(async () => {
        authService.getUserId.and.returnValue('user-2');
        return new Map([[image.UUID, new Blob(['restored'])]]);
      });
      await component.toggleFavorite(image);
      expect(imageSyncService.unsyncImage).not.toHaveBeenCalled();
      expect((await readImage(image.UUID)).favoriteSyncPending).toBeTrue();
    });

    it('does not reupload an unfavorited local image when assigning a tag', async () => {
      const image = newImage('tagged-local', false);
      await (component as any).persistGeneratedImage(image);
      await (component as any).updateTagOnImages({ id: 'local-tag' }, [image.UUID], false);
      expect((await readImage(image.UUID)).tags).toContain('local-tag');
      expect(imageSyncService.syncImage).not.toHaveBeenCalled();
    });

    it('keeps cloud favorites before and after saving a new generation and an incomplete restore', async () => {
      await component.updateFavoriteImages();
      expect(component.favoritePageImages.map(i => i.UUID)).toEqual(['cloud-favorite']);
      await component.ingestGeneratedImages([newImage('new-generation')]);
      expect(component.favoritePageImages.map(i => i.UUID)).toEqual(['cloud-favorite']);
      await component.mergeCloudImages(); // No blob returned on the first attempt.
      expect(component.favoritePageImages.map(i => i.UUID)).toEqual(['cloud-favorite']);
      imageSyncService.downloadImageBlobs.and.resolveTo(new Map([['cloud-favorite', new Blob(['cloud'])]]));
      await component.mergeCloudImages();
      expect((await readImage('cloud-favorite')).favorite).toBeTrue();
      expect(component.favoritePageImages.map(i => i.UUID)).toEqual(['cloud-favorite']);
    });

    it('persists a failed favorite PATCH across reload and retries without letting stale cloud state undo it', async () => {
      const image = newImage('existing-cloud');
      await (component as any).persistGeneratedImage(image);
      imageSyncService.isImageSynced.and.returnValue(true);
      imageSyncService.updateImageMetadata.and.resolveTo(false);
      const messages = spyOn(TestBed.inject(MessageService), 'add');
      await component.toggleFavorite(image);
      const pending = await readImage(image.UUID);
      expect(pending.favorite).toBeTrue();
      expect(pending.favoriteSyncPending).toBeTrue();
      expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'warn', summary: 'Cloud backup pending' }));
      await (component as any).updateLocalCloudMetadata(db, pending, { ...pending, favorite: false });
      expect((await readImage(image.UUID)).favorite).toBeTrue();

      const reloaded = TestBed.createComponent(ImageHistoryPanelComponent);
      spyOn(reloaded.componentInstance as any, 'getDatabase').and.resolveTo(db);
      imageSyncService.updateImageMetadata.and.resolveTo(true);
      await (reloaded.componentInstance as any).retryFavoriteChanges();
      expect((await readImage(image.UUID)).favoriteSyncPending).toBeFalse();
      expect((await readImage(image.UUID)).favorite).toBeTrue();
      reloaded.destroy();
    });

    it('does not replay pending favorite writes into another account', async () => {
      const image = { ...newImage('other-account'), favoriteSyncPending: true, favoriteSyncUserId: 'other-user' };
      await (component as any).persistGeneratedImage(image);
      await (component as any).retryFavoriteChanges();
      expect(imageSyncService.syncImage).not.toHaveBeenCalled();
      expect(imageSyncService.updateImageMetadata).not.toHaveBeenCalled();
    });

    it('notifies when a new favorite reaches the cloud limit and retains it locally for retry', async () => {
      const image = newImage('cloud-full');
      await (component as any).persistGeneratedImage(image);
      component.syncStatus.quota = { used: 1500, limit: 1500 };
      imageSyncService.syncImage.and.resolveTo(false);
      const messages = spyOn(TestBed.inject(MessageService), 'add');
      await component.toggleFavorite(image);
      expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({
        severity: 'warn', summary: 'Cloud backup full',
        detail: jasmine.stringMatching(/1,500-image cloud limit.*Unfavorite an image to free space/)
      }));
      expect((await readImage(image.UUID)).favorite).toBeTrue();
      expect((await readImage(image.UUID)).favoriteSyncPending).toBeTrue();
      expect((await component.getImageBlob(image.UUID))!.size).toBeGreaterThan(0);
    });

    it('ignores a cloud snapshot taken in another picker before a successful star click', async () => {
      const image = newImage('existing-cloud');
      await (component as any).persistGeneratedImage(image);
      imageSyncService.isImageSynced.and.returnValue(true);
      let deliver!: (value: any) => void;
      imageSyncService.downloadFromCloud.and.returnValue(new Promise(resolve => { deliver = resolve; }));
      const picker = TestBed.createComponent(ImageHistoryPanelComponent);
      spyOn(picker.componentInstance as any, 'getDatabase').and.resolveTo(db);
      spyOn(picker.componentInstance as any, 'hydrateImageUrls').and.resolveTo();
      const merge = picker.componentInstance.mergeCloudImages();
      // Avoid making the star refresh await the intentionally delayed metadata request.
      (component as any).cloudMetadataLoaded = true;
      (component as any).cloudMetadataUserId = 'user-1';
      await component.toggleFavorite(image);
      deliver({ images: [{ ...image, favorite: false }], blobs: new Map() });
      await merge;
      expect((await readImage(image.UUID)).favorite).toBeTrue();
      picker.destroy();
    });

    it('keeps the previous favorite list when IndexedDB temporarily fails', async () => {
      const image = newImage('local-favorite', true);
      await (component as any).persistGeneratedImage(image);
      await component.updateFavoriteImages();
      spyOn(component as any, 'getAllImagesFromDb').and.rejectWith(new Error('Storage unavailable'));
      await component.updateFavoriteImages();
      expect(component.favoritePageImages.map(i => i.UUID)).toContain(image.UUID);
    });

    it('rolls back the star and reports a local save failure without uploading it', async () => {
      spyOn(component, 'updateImageInDB').and.resolveTo(false);
      const messages = spyOn(TestBed.inject(MessageService), 'add');
      const image = newImage('local-save-failure');
      await component.toggleFavorite(image);
      expect(image.favorite).toBeFalse();
      expect(messages).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Favorite not saved' }));
      expect(imageSyncService.syncImage).not.toHaveBeenCalled();
    });

    it('renders a cloud image even if local storage cannot retain its blob', async () => {
      const image = cloudFavorite();
      (component as any).cloudImages.set(image.UUID, image);
      const blob = new Blob(['webp'], { type: 'image/webp' });
      imageSyncService.downloadImageBlobs.and.resolveTo(new Map([[image.UUID, blob]]));
      spyOn(component as any, 'storeCloudImage').and.resolveTo(false);
      spyOn(component as any, 'preloadImageUrl').and.resolveTo();
      await component.loadImageData(image);
      expect(image.blob).toBe(blob);
      expect(image.url).toMatch(/^blob:/);
      URL.revokeObjectURL(image.url!);
    });
  });

  it('starts cloud restoration when login completes after history initialization', async () => {
    authService.getUserId.and.returnValue(null);
    spyOn(component, 'initializeHistory').and.callFake(async () => { (component as any).historyInitialized = true; });
    const sync = spyOn(component as any, 'syncFromCloud').and.resolveTo();
    fixture.detectChanges();
    authService.getUserId.and.returnValue('user-1');
    authService.isLoggedIn.and.returnValue(true);
    authService.credits$.next({ credits: 10 });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('getDownloadBlob should convert URL-backed WebP blobs to PNG when lossy downloads are disabled', async () => {
    const webpBlob = new Blob(['webp'], { type: 'image/webp' });
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    const blobMigrationService = TestBed.inject(BlobMigrationService) as unknown as BlobMigrationServiceStub;
    spyOn(blobMigrationService, 'convertWebPToPNG').and.resolveTo(pngBlob);
    spyOn(window, 'fetch').and.resolveTo(new Response(webpBlob));
    component.lossyImages = false;

    const result = await (component as any).getDownloadBlob({ UUID: 'download-1', url: 'blob:history-image' });

    expect(blobMigrationService.convertWebPToPNG).toHaveBeenCalledTimes(1);
    expect(result).toBe(pngBlob);
  });
});
import { CharactersService } from 'src/app/characters/characters.service';
