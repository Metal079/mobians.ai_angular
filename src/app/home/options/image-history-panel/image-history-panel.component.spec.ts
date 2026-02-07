import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
}

class SharedServiceStub {
  setReferenceImage() {}
  setPrompt() {}
}

class AuthServiceStub {
  credits$ = of(null);
  isLoggedIn = jasmine.createSpy('isLoggedIn').and.returnValue(false);
}

class ImageSyncServiceStub {
  syncStatus$ = of({
    syncEnabled: false,
    imagesInCloud: 0,
    quota: { used: 0, limit: 1000 },
    lastSyncTime: null,
    isSyncing: false
  });
  downloadFromCloud = jasmine.createSpy('downloadFromCloud').and.resolveTo({ images: [], blobs: new Map() });
  isImageSynced = jasmine.createSpy('isImageSynced').and.returnValue(false);
  updateImageMetadata = jasmine.createSpy('updateImageMetadata').and.resolveTo(true);
  syncImage = jasmine.createSpy('syncImage').and.resolveTo(true);
  syncTags = jasmine.createSpy('syncTags').and.resolveTo(true);
  getCloudTags = jasmine.createSpy('getCloudTags').and.resolveTo([]);
  deleteCloudTag = jasmine.createSpy('deleteCloudTag').and.resolveTo(true);
  fetchSyncStatus = jasmine.createSpy('fetchSyncStatus').and.resolveTo({
    syncEnabled: false,
    imagesInCloud: 0,
    quota: { used: 0, limit: 1000 },
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

  it('toggleFavorite should persist and refresh favorites and tag counts', async () => {
    const image = createImage({ UUID: 'img-1', favorite: false });
    const callOrder: string[] = [];

    spyOn(component as any, 'updateImageInDB').and.callFake(async () => {
      callOrder.push('update-db');
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

    spyOn(component as any, 'updateImageInDB').and.resolveTo();
    spyOn(component, 'updateFavoriteImages').and.resolveTo();
    spyOn(component, 'updateTagCounts').and.resolveTo();
    authService.isLoggedIn.and.returnValue(false);

    await component.toggleFavorite(favoriteViewImage);

    expect(component.imageHistoryMetadata[0].favorite).toBeFalse();
    expect(component.favoritePageImages[0].favorite).toBeFalse();
  });

  it('getHistorySourceImages should use local IndexedDB data before cloud data', async () => {
    const localImage = createImage({ UUID: 'local-1', favorite: true });
    authService.isLoggedIn.and.returnValue(true);
    spyOn(component as any, 'getAllImagesFromDb').and.resolveTo([localImage]);

    const images = await (component as any).getHistorySourceImages();

    expect(images).toEqual([localImage]);
    expect(imageSyncService.downloadFromCloud).not.toHaveBeenCalled();
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
});
