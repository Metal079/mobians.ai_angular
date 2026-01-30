import { Component, DestroyRef, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { MessageService } from 'primeng/api';
import { AuthService } from 'src/app/auth/auth.service';
import { BlobMigrationService } from 'src/app/blob-migration.service';
import { ImageSyncService, SyncStatus } from 'src/app/image-sync.service';
import { SharedService } from 'src/app/shared.service';
import { ImageTag, MobiansImage, MobiansImageMetadata } from 'src/_shared/mobians-image.interface';
import { LoraHistoryPromptService } from '../lora-history-prompt.service';

@Component({
  selector: 'app-image-history-panel',
  templateUrl: './image-history-panel.component.html',
  styleUrls: ['./image-history-panel.component.css'],
})
export class ImageHistoryPanelComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);

  @Input() lossyImages = true;

  private dbName = 'ImageDatabase';
  private storeName = 'ImageStore';
  private blobStoreName = 'blobStore';
  private db: IDBDatabase | null = null;

  currentPageImages: MobiansImage[] = [];
  nextPageImages: MobiansImage[] = [];
  prevPageImages: MobiansImage[] = [];
  currentPageNumber = 1;
  imagesPerPage = 4;
  totalPages = 1;
  isLoading = false;
  imageHistoryMetadata: MobiansImageMetadata[] = [];
  editPageNumber = 1;
  blobUrls: string[] = [];

  favoritePageImages: MobiansImage[] = [];
  favoriteCurrentPageNumber = 1;
  favoriteTotalPages = 1;
  favoriteImagesPerPage = 4;
  favoriteSearchQuery = '';
  debouncedFavoriteSearch: () => void;
  editFavoritePageNumber = 1;
  favoriteImageHistoryMetadata: MobiansImageMetadata[] = [];

  imagesPerPageOptions: number[] = [4, 9, 16];
  gridColumns = 2;
  private openInfoImages: Set<string> = new Set();
  private imagesPerPageUserSet = false;
  private readonly mobileBreakpointPx = 768;
  private readonly imagesPerPageKey = 'mobians:history-images-per-page';
  private readonly onViewportResize = () => {
    if (this.imagesPerPageUserSet) return;
    const size = this.getDefaultImagesPerPage();
    if (size === this.imagesPerPage) return;
    void this.applyImagesPerPage(size, false);
  };

  bulkSelectMode = false;
  selectedImages: Set<string> = new Set();

  availableTags: ImageTag[] = [];
  selectedTagFilter: string | null = null;
  showTagManager = false;
  newTagName = '';
  tagColors: string[] = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  showTagAssignDialog = false;
  tagAssignImageUUIDs: string[] = [];

  syncStatus: SyncStatus = {
    syncEnabled: false,
    imagesInCloud: 0,
    quota: { used: 0, limit: 1000 },
    lastSyncTime: null,
    isSyncing: false
  };
  syncProgress: { current: number; total: number } | null = null;

  searchQuery = '';
  debouncedSearch: () => void;
  isSearching = false;

  isLoggedIn = false;

  private cloudSyncInterval?: number;
  private readonly cloudSyncIntervalMs = 60000;
  private readonly tagsUpdateKey = 'mobians:tags-updated';
  private readonly tagTombstonesKey = 'mobians:tag-tombstones';
  private readonly tagsLastSyncKey = 'mobians:tags-last-sync';
  private tagsSyncInProgress = false;

  private readonly onStorage = (e: StorageEvent) => {
    if (e.key === this.tagsUpdateKey) {
      let payload: { action?: string; tagId?: string } | undefined;
      try {
        payload = e.newValue ? JSON.parse(e.newValue) : undefined;
      } catch {
        payload = undefined;
      }
      void this.handleTagsUpdated(payload);
    }
    if (e.key === this.tagTombstonesKey) {
      void this.handleTagsUpdated();
    }
  };

  constructor(
    private readonly messageService: MessageService,
    private readonly blobMigrationService: BlobMigrationService,
    private readonly sharedService: SharedService,
    private readonly authService: AuthService,
    private readonly imageSyncService: ImageSyncService,
    private readonly loraHistoryPromptService: LoraHistoryPromptService
  ) {
    this.debouncedSearch = this.debounce(() => {
      this.searchImages();
    }, 300);

    this.debouncedFavoriteSearch = this.debounce(() => {
      this.favoriteSearchImages();
    }, 300);
  }

  ngOnInit() {
    this.setImagesPerPageDefaults();

    this.imageSyncService.syncStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        this.syncStatus = status;
      });

    this.authService.credits$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((creditsData) => {
        this.isLoggedIn = !!creditsData || this.authService.isLoggedIn();
      });

    window.addEventListener('storage', this.onStorage);
    window.addEventListener('resize', this.onViewportResize);
    this.initializeHistory().catch((error) => {
      console.error('Failed to initialize image history:', error);
    });
  }

  ngOnDestroy() {
    window.removeEventListener('storage', this.onStorage);
    window.removeEventListener('resize', this.onViewportResize);
    if (this.cloudSyncInterval) {
      clearInterval(this.cloudSyncInterval);
    }
    this.blobUrls.forEach((url) => URL.revokeObjectURL(url));
    this.prevPageImages = [];
    this.currentPageImages = [];
    this.nextPageImages = [];
  }

  async initializeHistory() {
    await this.getDatabase();
    await this.migrateBase64ToBlobStore();
    await this.loadTags();
    await this.searchImages();
    this.currentPageImages = await this.paginateImages(1);
    await this.updateTagCounts();

    if (this.authService.isLoggedIn()) {
      await this.syncFromCloud();
    }

    this.startCloudTagSync();
  }

  async ingestGeneratedImages(generatedImages: MobiansImage[]) {
    if (!generatedImages || generatedImages.length === 0) return;

    generatedImages.forEach((img: MobiansImage) => {
      if (img.url) this.blobUrls.push(img.url);
    });

    this.imageHistoryMetadata.unshift(...generatedImages.map((image: MobiansImage) => {
      return {
        UUID: image.UUID,
        prompt: image.prompt!,
        promptSummary: image.promptSummary,
        loras: image.loras,
        timestamp: image.timestamp!,
        aspectRatio: image.aspectRatio,
        width: image.width,
        height: image.height,
        favorite: false,
        model: image.model,
        seed: image.seed,
        negativePrompt: image.negativePrompt,
        cfg: image.cfg,
        tags: [],
        syncPriority: 0,
        lastModified: image.lastModified
      } as MobiansImageMetadata;
    }));

    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName, 'blobStore'], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const blobStore = transaction.objectStore('blobStore');

      for (const image of generatedImages) {
        if (image.blob && image.blob.type === 'image/png') {
          image.blob = await this.blobMigrationService.convertToWebP(image.blob);
        }
        const imageMetadata: any = { ...image };
        delete imageMetadata.blob;
        delete imageMetadata.url;
        store.put(imageMetadata);
        blobStore.put({ UUID: image.UUID, blob: image.blob });
      }
    } catch (error) {
      console.error('Failed to store image data', error);
    }

    this.totalPages = Math.max(1, Math.ceil(this.imageHistoryMetadata.length / this.imagesPerPage));
    if (this.currentPageNumber > this.totalPages) {
      this.currentPageNumber = this.totalPages;
    }
    this.editPageNumber = this.currentPageNumber;
    this.currentPageImages = await this.paginateImages(this.currentPageNumber);
    await this.updateFavoriteImages();
  }

  async deleteAllImages() {
    if (!confirm('Are you sure you want to delete all images? This cannot be undone.')) {
      return;
    }

    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName, 'blobStore'], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const blobStore = transaction.objectStore('blobStore');
      store.clear();
      blobStore.clear();
      this.currentPageImages = [];
      this.favoritePageImages = [];
      this.imageHistoryMetadata = [];
      this.favoriteImageHistoryMetadata = [];
      this.selectedImages.clear();
      this.currentPageNumber = 1;
      this.totalPages = 1;
      this.favoriteCurrentPageNumber = 1;
      this.favoriteTotalPages = 1;
      this.availableTags = [];
      this.selectedTagFilter = null;
      this.showTagManager = false;
      this.showTagAssignDialog = false;
      this.tagAssignImageUUIDs = [];
      this.newTagName = '';
      this.messageService.add({
        severity: 'success',
        summary: 'Images Deleted',
        detail: 'All images have been deleted.'
      });
    } catch (error) {
      console.error('Failed to delete images:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete images.'
      });
    }
  }

  async openImageDetails(image: MobiansImage) {
    this.closeImageInfo(image);

    const blob = await this.getDownloadBlob(image);
    if (!blob) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Image Load Failed',
        detail: 'Could not load the image data. Please try another image.',
        life: 4000
      });
      return;
    }

    this.safeRevoke(image.url);
    const newUrl = URL.createObjectURL(blob);
    image.url = newUrl;
    this.blobUrls.push(newUrl);

    image.blob = blob;
    this.sharedService.setReferenceImage(image);

    if (image.prompt) {
      this.sharedService.setPrompt(image.prompt!);
    }

    const historyLoras = Array.isArray(image.loras) ? image.loras : [];
    if (historyLoras.length > 0) {
      this.loraHistoryPromptService.requestLoad(image);
    }
  }

  async downloadImage(image: MobiansImage, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const blob = await this.getDownloadBlob(image);
    if (!blob) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Download unavailable',
        detail: 'Could not load this image for download.',
        life: 4000
      });
      return;
    }

    const filename = this.buildDownloadFilename(image, blob.type);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => this.safeRevoke(url), 0);
  }

  private async getBlobFromStore(uuid: string): Promise<Blob | undefined> {
    try {
      const db = await this.getDatabase();
      return await new Promise<Blob | undefined>((resolve) => {
        const transaction = db.transaction(this.blobStoreName, 'readonly');
        const store = transaction.objectStore(this.blobStoreName);
        const request = store.get(uuid);
        request.onsuccess = () => resolve(request.result?.blob ?? undefined);
        request.onerror = () => resolve(undefined);
      });
    } catch (error) {
      console.error('Failed to load image blob from IndexedDB', error);
      return undefined;
    }
  }

  private async getDownloadBlob(image: MobiansImage): Promise<Blob | null> {
    let blob = image.blob;

    if (!blob && image.url) {
      try {
        const response = await fetch(image.url);
        blob = await response.blob();
      } catch (error) {
        console.error('Failed to fetch image blob for download', error);
      }
    }

    if (!blob && image.UUID) {
      blob = await this.getBlobFromStore(image.UUID);
    }

    if (!blob) return null;

    if (!this.lossyImages && blob.type === 'image/webp') {
      blob = await this.blobMigrationService.convertWebPToPNG(blob);
    }

    return blob;
  }

  private buildDownloadFilename(image: MobiansImage, mimeType?: string): string {
    const ext = mimeType === 'image/webp' ? 'webp' : 'png';
    const id = image.UUID || `${Date.now()}`;
    return `mobians-${id}.${ext}`;
  }

  toggleShowTagManager() {
    this.showTagManager = !this.showTagManager;
  }

  isImageSelected(image: MobiansImage): boolean {
    return this.selectedImages.has(image.UUID);
  }

  onFavoriteImageClick(image: MobiansImage, event: Event) {
    if (this.bulkSelectMode) {
      this.toggleImageSelection(image, event);
      return;
    }
    this.openImageDetails(image);
  }

  isImageSynced(imageUUID: string): boolean {
    return this.imageSyncService.isImageSynced(imageUUID);
  }

  onTagAssignDialogVisibleChange(visible: boolean) {
    this.showTagAssignDialog = visible;
  }

  onSearchQueryChange(nextValue: string) {
    this.searchQuery = nextValue;
    this.debouncedSearch();
  }

  onFavoriteSearchQueryChange(nextValue: string) {
    this.favoriteSearchQuery = nextValue;
    this.debouncedFavoriteSearch();
  }

  async onImagesPerPageChange(nextValue: number) {
    const size = Number(nextValue);
    if (!Number.isFinite(size) || size <= 0) return;
    await this.applyImagesPerPage(size, true);
  }

  toggleImageInfo(image: MobiansImage, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const key = this.getImageInfoKey(image);
    if (!key) return;
    if (this.openInfoImages.has(key)) {
      this.openInfoImages.delete(key);
      return;
    }
    this.openInfoImages.add(key);
  }

  isImageInfoOpen(image: MobiansImage): boolean {
    const key = this.getImageInfoKey(image);
    return key ? this.openInfoImages.has(key) : false;
  }

  private closeImageInfo(image: MobiansImage) {
    const key = this.getImageInfoKey(image);
    if (key) {
      this.openInfoImages.delete(key);
    }
  }

  private getImageInfoKey(image: MobiansImage): string | null {
    return image.UUID || image.url || null;
  }

  private updateGridColumns(pageSize: number) {
    if (pageSize <= 4) {
      this.gridColumns = 2;
    } else if (pageSize <= 9) {
      this.gridColumns = 3;
    } else {
      this.gridColumns = 4;
    }
  }

  private getDefaultImagesPerPage(): number {
    if (typeof window === 'undefined') return 9;
    return window.matchMedia(`(max-width: ${this.mobileBreakpointPx}px)`).matches ? 4 : 9;
  }

  private setImagesPerPageDefaults() {
    const saved = this.getSavedImagesPerPage();
    const size = saved ?? this.getDefaultImagesPerPage();
    this.imagesPerPageUserSet = saved !== null;
    this.imagesPerPage = size;
    this.favoriteImagesPerPage = size;
    this.updateGridColumns(size);
  }

  private async applyImagesPerPage(size: number, markUserChoice: boolean) {
    if (markUserChoice) {
      this.imagesPerPageUserSet = true;
      this.saveImagesPerPagePreference(size);
    }
    if (size === this.imagesPerPage && size === this.favoriteImagesPerPage) return;

    this.imagesPerPage = size;
    this.favoriteImagesPerPage = size;
    this.updateGridColumns(size);

    this.totalPages = Math.max(1, Math.ceil(this.imageHistoryMetadata.length / this.imagesPerPage));
    if (this.currentPageNumber > this.totalPages) {
      this.currentPageNumber = this.totalPages;
    }
    this.editPageNumber = this.currentPageNumber;
    this.currentPageImages = await this.paginateImages(this.currentPageNumber);
    await this.updateFavoriteImages();
  }

  private getSavedImagesPerPage(): number | null {
    try {
      const raw = localStorage.getItem(this.imagesPerPageKey);
      if (!raw) return null;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return null;
      if (parsed === 12) {
        localStorage.setItem(this.imagesPerPageKey, '9');
        return 9;
      }
      if (parsed === 8) {
        localStorage.setItem(this.imagesPerPageKey, '9');
        return 9;
      }
      return this.imagesPerPageOptions.includes(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private saveImagesPerPagePreference(size: number) {
    try {
      localStorage.setItem(this.imagesPerPageKey, String(size));
    } catch {}
  }

  formatLoras(image: MobiansImage): string {
    const loras = Array.isArray(image?.loras) ? image.loras : [];
    if (loras.length === 0) return 'None';
    const names = loras
      .map((lora: any) => {
        if (!lora) return '';
        if (typeof lora === 'string') return lora;
        if (typeof lora === 'object') {
          return lora.name || lora.displayName || lora.id || lora.model || lora.filename || '';
        }
        return String(lora);
      })
      .map((name) => String(name).trim())
      .filter(Boolean);
    if (names.length === 0) {
      return `${loras.length} LoRA${loras.length === 1 ? '' : 's'}`;
    }
    const display = names.slice(0, 3).join(', ');
    return names.length > 3 ? `${display} +${names.length - 3} more` : display;
  }

  toggleBulkSelectMode() {
    this.bulkSelectMode = !this.bulkSelectMode;
    if (!this.bulkSelectMode) {
      this.selectedImages.clear();
    }
  }

  toggleImageSelection(image: MobiansImage, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.selectedImages.has(image.UUID)) {
      this.selectedImages.delete(image.UUID);
    } else {
      this.selectedImages.add(image.UUID);
    }
  }

  async bulkDownload() {
    if (this.selectedImages.size === 0) return;
    const zip = new JSZip();
    const promises: Promise<void>[] = [];

    this.selectedImages.forEach((uuid) => {
      const image = this.favoritePageImages.find(img => img.UUID === uuid);
      if (!image) return;
      promises.push(
        this.getDownloadBlob(image).then((blob) => {
          if (!blob) return;
          const filename = this.buildDownloadFilename(image, blob.type);
          zip.file(filename, blob);
        })
      );
    });

    await Promise.all(promises);
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mobians-bulk-${Date.now()}.zip`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => this.safeRevoke(url), 0);
  }

  async bulkDelete() {
    if (this.selectedImages.size === 0) return;
    const confirmed = confirm(`Delete ${this.selectedImages.size} images?`);
    if (!confirmed) return;

    const uuids = Array.from(this.selectedImages);
    for (const uuid of uuids) {
      const image = this.favoritePageImages.find(img => img.UUID === uuid);
      if (image) {
        await this.deleteImage(image);
      }
    }
    this.selectedImages.clear();
  }

  async toggleFavorite(image: MobiansImage) {
    image.favorite = !image.favorite;
    await this.updateImageInDB(image);
    this.updateFavoriteImages();

    if (this.authService.isLoggedIn()) {
      if (this.isImageSynced(image.UUID)) {
        this.imageSyncService.updateImageMetadata(image.UUID, { is_favorite: image.favorite });
      } else if (image.favorite) {
        const blob = await this.getImageBlob(image.UUID);
        if (blob) {
          this.imageSyncService.syncImage(image, blob).then(success => {
            if (success) {
              console.log('Image synced to cloud:', image.UUID);
            }
          });
        }
      }
    }
  }

  async deleteImage(image: MobiansImage) {
    if (this.isImageSynced(image.UUID)) {
      const confirmed = confirm(
        'This image is synced to the cloud. Deleting it will remove it from ALL your devices. Are you sure?'
      );
      if (!confirmed) {
        return;
      }
      await this.imageSyncService.unsyncImage(image.UUID);
    }

    this.currentPageImages = this.currentPageImages.filter(img => img.UUID !== image.UUID);
    this.imageHistoryMetadata = this.imageHistoryMetadata.filter(img => img.UUID !== image.UUID);

    this.totalPages = Math.ceil(this.imageHistoryMetadata.length / this.imagesPerPage);
    if (this.currentPageNumber > this.totalPages && this.totalPages > 0) {
      this.currentPageNumber = this.totalPages;
    }

    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName, 'blobStore'], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const blobStore = transaction.objectStore('blobStore');

      store.delete(image.UUID);
      blobStore.delete(image.UUID);
    } catch (error) {
      console.error('Failed to delete image from IndexedDB', error);
    }

    this.updateFavoriteImages();
  }

  async updateImageInDB(image: MobiansImage) {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const imageMetadata: any = { ...image };
      delete imageMetadata.blob;
      delete imageMetadata.url;
      store.put(imageMetadata);
    } catch (error) {
      console.error('Failed to update image in IndexedDB', error);
    }
  }

  openTagAssignDialog(imageUUIDs?: string[]) {
    this.tagAssignImageUUIDs = imageUUIDs || Array.from(this.selectedImages);
    if (this.tagAssignImageUUIDs.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No Images Selected',
        detail: 'Please select images to assign tags.'
      });
      return;
    }
    this.showTagAssignDialog = true;
  }

  async assignTagToImages(tag: ImageTag) {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const updatedImages: { uuid: string; tags: string[]; image?: MobiansImage }[] = [];

      for (const uuid of this.tagAssignImageUUIDs) {
        const request = store.get(uuid);
        await new Promise<void>((resolve) => {
          request.onsuccess = () => {
            const image = request.result as MobiansImage;
            if (image) {
              if (!image.tags) image.tags = [];
              if (!image.tags.includes(tag.id)) {
                image.tags.push(tag.id);
                store.put(image);
                updatedImages.push({ uuid: image.UUID, tags: [...image.tags], image });

                const localImg = this.imageHistoryMetadata.find(i => i.UUID === uuid);
                if (localImg) {
                  if (!localImg.tags) localImg.tags = [];
                  if (!localImg.tags.includes(tag.id)) {
                    localImg.tags.push(tag.id);
                  }
                }
              }
            }
            resolve();
          };
        });
      }

      if (this.authService.isLoggedIn() && updatedImages.length > 0) {
        for (const { uuid, tags, image } of updatedImages) {
          if (this.isImageSynced(uuid)) {
            await this.imageSyncService.updateImageMetadata(uuid, { tags });
          } else if (image) {
            const blob = await this.getImageBlob(uuid);
            if (blob) {
              await this.imageSyncService.syncImage(image, blob);
            }
          }
        }
      }

      await this.updateTagCounts();
      await this.updateFavoriteImages();
      this.notifyTagsUpdated('assign', tag.id);

      this.showTagAssignDialog = false;
      this.messageService.add({
        severity: 'success',
        summary: 'Tags Assigned',
        detail: `Tag "${tag.name}" assigned to ${this.tagAssignImageUUIDs.length} images.`
      });
    } catch (error) {
      console.error('Failed to assign tag:', error);
    }
  }

  async removeTagFromImages(tag: ImageTag, imageUUIDs: string[]) {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const updatedImages: { uuid: string; tags: string[] }[] = [];

      for (const uuid of imageUUIDs) {
        const request = store.get(uuid);
        await new Promise<void>((resolve) => {
          request.onsuccess = () => {
            const image = request.result as MobiansImage;
            if (image && image.tags) {
              image.tags = image.tags.filter(t => t !== tag.id);
              store.put(image);
              updatedImages.push({ uuid: image.UUID, tags: [...image.tags] });

              const localImg = this.imageHistoryMetadata.find(i => i.UUID === uuid);
              if (localImg && localImg.tags) {
                localImg.tags = localImg.tags.filter(t => t !== tag.id);
              }
            }
            resolve();
          };
        });
      }

      if (this.authService.isLoggedIn() && updatedImages.length > 0) {
        for (const { uuid, tags } of updatedImages) {
          await this.imageSyncService.updateImageMetadata(uuid, { tags });
        }
      }

      await this.updateTagCounts();
      await this.updateFavoriteImages();
      this.notifyTagsUpdated('unassign', tag.id);
    } catch (error) {
      console.error('Failed to remove tag:', error);
    }
  }

  async updateTagCounts() {
    const tagCounts: { [id: string]: number } = {};
    this.availableTags.forEach(t => tagCounts[t.id] = 0);
    let sourceImages: MobiansImage[] = [];
    if (this.authService.isLoggedIn()) {
      try {
        const { images } = await this.imageSyncService.downloadFromCloud(false);
        sourceImages = images;
      } catch {
        sourceImages = [];
      }
    } else {
      try {
        sourceImages = await this.getAllImagesFromDb();
      } catch {
        sourceImages = [];
      }
    }

    sourceImages
      .filter(img => img.favorite)
      .forEach(img => {
        img.tags?.forEach(tagId => {
          if (tagCounts[tagId] !== undefined) {
            tagCounts[tagId]++;
          }
        });
      });

    this.availableTags.forEach(tag => {
      tag.imageCount = tagCounts[tag.id] || 0;
    });
  }

  filterByTag(tagId: string | null) {
    this.selectedTagFilter = tagId;
    this.updateFavoriteImages(false);
  }

  getTagById(tagId: string): ImageTag | undefined {
    return this.availableTags.find(t => t.id === tagId);
  }

  getImageTags(image: MobiansImage | MobiansImageMetadata): ImageTag[] {
    if (!image.tags) return [];
    return image.tags
      .map(tagId => this.availableTags.find(t => t.id === tagId))
      .filter((t): t is ImageTag => t !== undefined);
  }

  async syncOldImages() {
    if (!this.authService.isLoggedIn()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Login Required',
        detail: 'Please log in to sync images to the cloud.'
      });
      return;
    }

    const allImages: MobiansImage[] = [];
    const allMetadata = await this.getAllImagesFromDb();
    for (const meta of allMetadata) {
      if (!this.isImageSynced(meta.UUID)) {
        await this.loadImageData(meta);
        allImages.push(meta);
      }
    }

    if (allImages.length === 0) {
      this.messageService.add({
        severity: 'info',
        summary: 'All Synced',
        detail: 'All your images are already synced to the cloud.'
      });
      return;
    }

    this.syncProgress = { current: 0, total: allImages.length };

    const result = await this.imageSyncService.syncBatchImages(
      allImages,
      (uuid) => this.getImageBlob(uuid),
      (current, total) => {
        this.syncProgress = { current, total };
      }
    );

    this.syncProgress = null;

    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Sync Complete',
        detail: `Synced ${result.uploadedCount} images to the cloud.`
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Sync Failed',
        detail: result.errors.join(', ')
      });
    }
  }

  async refreshSyncStatus() {
    await this.imageSyncService.fetchSyncStatus();
  }

  async syncSingleImage(image: MobiansImage) {
    if (!this.authService.isLoggedIn()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Login Required',
        detail: 'Please log in to sync images to the cloud.'
      });
      return;
    }

    const blob = await this.getImageBlob(image.UUID);
    if (!blob) {
      this.messageService.add({
        severity: 'error',
        summary: 'Sync Failed',
        detail: 'Could not find image data.'
      });
      return;
    }

    const success = await this.imageSyncService.syncImage(image, blob);
    if (success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Synced',
        detail: 'Image synced to cloud!'
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Sync Failed',
        detail: 'Could not sync image. Check quota.'
      });
    }
  }

  async unsyncSingleImage(image: MobiansImage) {
    const confirmed = confirm(
      'Remove this image from cloud backup? It will no longer sync across devices, but will remain on this device.'
    );
    if (!confirmed) {
      return;
    }

    const success = await this.imageSyncService.unsyncImage(image.UUID);
    if (success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Unsynced',
        detail: 'Image removed from cloud backup.'
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Unsync Failed',
        detail: 'Could not remove image from cloud.'
      });
    }
  }

  async getImageBlob(uuid: string): Promise<Blob | undefined> {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction(this.blobStoreName, 'readonly');
      const store = transaction.objectStore(this.blobStoreName);

      return new Promise((resolve, reject) => {
        const request = store.get(uuid);
        request.onsuccess = () => resolve(request.result?.blob);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to get image blob:', error);
      return undefined;
    }
  }

  async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.error('IndexedDB is not supported in this browser.');
        reject(new Error('IndexedDB is not supported'));
        return;
      }

      const request = indexedDB.open(this.dbName, 38);

      request.onerror = (event) => {
        console.error('Failed to open database:', event);
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = (event) => {
        const db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;

        const upgradeTransaction = request.transaction;

        upgradeTransaction!.oncomplete = () => {
          console.log('Upgrade transaction completed.');
        };

        upgradeTransaction!.onerror = (event) => {
          console.error('Upgrade transaction failed:', event);
          reject(new Error('Upgrade transaction failed'));
        };

        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'UUID' });
          console.log('Object store created:', this.storeName);
        }

        if (!db.objectStoreNames.contains('blobStore')) {
          db.createObjectStore('blobStore', { keyPath: 'UUID' });
          console.log('blobStore store created');
        }

        if (!db.objectStoreNames.contains('TagStore')) {
          const tagStore = db.createObjectStore('TagStore', { keyPath: 'id' });
          tagStore.createIndex('name', 'name', { unique: true });
          console.log('TagStore created');
        }

        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const store = transaction.objectStore(this.storeName);

          if (!store.indexNames.contains('timestamp')) {
            store.createIndex('timestamp', 'timestamp', { unique: false });
            console.log('Timestamp index created');
          }

          if (!store.indexNames.contains('prompt')) {
            store.createIndex('prompt', 'prompt', { unique: false });
            console.log('Prompt index created');
          }

          try {
            if (!store.indexNames.contains('promptFullText')) {
              (store as any).createIndex('promptFullText', 'prompt', { type: 'text' });
              console.log('Full-text prompt index created');
            }

            if (!store.indexNames.contains('favorite')) {
              store.createIndex('favorite', 'favorite', { unique: false });
              console.log('Favorite index created');
            }

            if (!store.indexNames.contains('syncPriority')) {
              store.createIndex('syncPriority', 'syncPriority', { unique: false });
              console.log('SyncPriority index created');
            }

            if (!store.indexNames.contains('model')) {
              store.createIndex('model', 'model', { unique: false });
              console.log('Model index created');
            }
          } catch (error) {
            console.warn('Some indexes not supported in this browser:', error);
          }

          try {
            const allRequest = store.getAll();
            allRequest.onsuccess = () => {
              const allRecords = allRequest.result as MobiansImage[];
              allRecords.forEach(record => {
                let needsUpdate = false;
                if (typeof record.favorite !== 'boolean') {
                  record.favorite = false;
                  needsUpdate = true;
                }
                if (!Array.isArray(record.tags)) {
                  record.tags = [];
                  needsUpdate = true;
                }
                if (typeof record.syncPriority !== 'number') {
                  record.syncPriority = record.favorite ? 100 : 0;
                  needsUpdate = true;
                }
                if (needsUpdate) {
                  store.put(record);
                }
              });
              console.log('All existing records have been initialized with new properties.');
            };
            allRequest.onerror = (event) => {
              console.error('Error initializing properties for existing records:', event);
            };
          } catch (error) {
            console.error('Error during records initialization:', error);
          }
        }
      };

      request.onblocked = (event) => {
        console.error('Database access blocked:', event);
        reject(new Error('Database access blocked'));
      };
    });
  }

  async getDatabase(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = await this.openDatabase();
    }
    return this.db;
  }

  async migrateBase64ToBlobStore() {
    const db = await this.getDatabase();
    const batchSize = 100;

    let cursorPosition: IDBValidKey | undefined = undefined;
    let hasMore = true;

    if (!db.objectStoreNames.contains('base64Store')) {
      return;
    }

    while (hasMore) {
      const batch = await this.readBatch(db, cursorPosition, batchSize);
      if (batch.length > 0) {
        for (const record of batch) {
          await this.processAndStoreBlob(record, db);
        }
        cursorPosition = batch[batch.length - 1].UUID;
      } else {
        hasMore = false;
      }
    }
  }

  private async readBatch(db: IDBDatabase, cursorPosition: IDBValidKey | undefined, batchSize: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('base64Store', 'readonly');
      const store = transaction.objectStore('base64Store');
      const request = cursorPosition
        ? store.openCursor(IDBKeyRange.lowerBound(cursorPosition, true))
        : store.openCursor();

      const batch: any[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && batch.length < batchSize) {
          batch.push(cursor.value);
          cursor.continue();
        } else {
          resolve(batch);
        }
      };

      request.onerror = (event) => {
        console.error('Cursor failed:', event);
        reject(request.error);
      };
    });
  }

  private async processAndStoreBlob(record: any, db: IDBDatabase) {
    if (!record || !record.UUID || !record.base64) return;

    let blob = this.blobMigrationService.base64ToBlob(record.base64);
    if (blob.type === 'image/png') {
      blob = await this.blobMigrationService.convertToWebP(blob);
    }
    const transaction = db.transaction(['blobStore', 'base64Store'], 'readwrite');
    const blobStore = transaction.objectStore('blobStore');
    const base64Store = transaction.objectStore('base64Store');

    return new Promise<void>((resolve, reject) => {
      const blobRequest = blobStore.put({ UUID: record.UUID, blob });
      blobRequest.onsuccess = () => {
        const deleteRequest = base64Store.delete(record.UUID);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = (error) => {
          console.error('Error deleting base64 data:', error);
          reject(error);
        };
      };
      blobRequest.onerror = (error) => {
        console.error('Error storing blob:', error);
        reject(error);
      };
    });
  }

  async loadImageData(image: MobiansImage) {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName, 'blobStore'], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const blobStore = transaction.objectStore('blobStore');

      const request = store.get(image.UUID);
      request.onsuccess = async () => {
        const result = request.result as MobiansImage;
        if (result) {
          const blobRequest = blobStore.get(image.UUID);
          blobRequest.onsuccess = () => {
            const blobResult = blobRequest.result;
            if (blobResult && blobResult.blob) {
              image.blob = blobResult.blob;
            }
          };
        }
      };

      const blobRequest = blobStore.get(image.UUID);
      blobRequest.onsuccess = () => {
        const result = blobRequest.result;
        if (result) {
          const blob = result.blob;
          image.url = URL.createObjectURL(blob);
          this.blobUrls.push(image.url);
        }
      };

      await new Promise((resolve) => {
        transaction.oncomplete = () => {
          resolve(undefined);
        };
      });
    } catch (error) {
      console.error('Failed to load image data', error);
    }
  }

  private safeRevoke(url?: string) {
    if (!url) {
      return;
    }
    try { URL.revokeObjectURL(url); } catch {}
    this.blobUrls = this.blobUrls.filter((tracked) => tracked !== url);
  }

  debounce(func: Function, wait: number): (...args: any[]) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: any[]) => {
      const later = () => {
        timeout = null;
        func(...args);
      };
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(later, wait);
    };
  }

  async searchImages(preservePage: boolean = false) {
    this.isSearching = true;
    const previousPage = this.currentPageNumber;
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      const query = this.searchQuery.trim().toLowerCase();

      let results: MobiansImage[];

      if (store.indexNames.contains('promptFullText') && 'getAll' in IDBIndex.prototype) {
        try {
          const index = store.index('promptFullText');
          results = await new Promise<MobiansImage[]>((resolve, reject) => {
            const request = query.length > 0
              ? (index as any).getAll(query)
              : (index as any).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
          });
        } catch (error) {
          console.warn('Full-text search not supported or failed, falling back:', error);
          results = await new Promise<MobiansImage[]>((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
          });
        }
      } else {
        results = await new Promise<MobiansImage[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
      }

      if (query.length > 0) {
        results = results.filter((image: MobiansImage) =>
          image.prompt?.toLowerCase().includes(query) ||
          image.promptSummary?.toLowerCase().includes(query)
        );
      }

      results.sort((a, b) => {
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        return bTime - aTime;
      });

      this.imageHistoryMetadata = results.map((image: MobiansImage) => {
        return {
          UUID: image.UUID,
          prompt: image.prompt,
          promptSummary: image.promptSummary,
          loras: image.loras,
          timestamp: image.timestamp,
          aspectRatio: image.aspectRatio,
          width: image.width,
          height: image.height,
          favorite: image.favorite,
          model: image.model,
          seed: image.seed,
          negativePrompt: image.negativePrompt,
          cfg: image.cfg,
          tags: image.tags,
          syncPriority: image.syncPriority,
          lastModified: image.lastModified
        } as MobiansImageMetadata;
      });

      this.totalPages = Math.max(1, Math.ceil(this.imageHistoryMetadata.length / this.imagesPerPage));
      if (preservePage && previousPage <= this.totalPages) {
        this.currentPageNumber = previousPage;
      } else {
        this.currentPageNumber = 1;
      }
      this.currentPageImages = await this.paginateImages(this.currentPageNumber);
      this.updateFavoriteImages();
    } catch (error) {
      console.error('Error searching images:', error);
    } finally {
      this.isSearching = false;
    }
  }

  async favoriteSearchImages() {
    await this.updateFavoriteImages(false);
  }

  async paginateImages(pageNumber: number): Promise<MobiansImage[]> {
    const startIndex = (pageNumber - 1) * this.imagesPerPage;
    const endIndex = pageNumber * this.imagesPerPage;

    const pageImages = this.imageHistoryMetadata.slice(startIndex, endIndex);
    for (const image of pageImages) {
      await this.loadImageData(image);
    }
    return pageImages;
  }

  async paginateFavoriteImages(images: MobiansImageMetadata[], pageNumber: number): Promise<MobiansImage[]> {
    const startIndex = (pageNumber - 1) * this.favoriteImagesPerPage;
    const endIndex = pageNumber * this.favoriteImagesPerPage;

    const pageImages = images.slice(startIndex, endIndex);
    for (const image of pageImages) {
      await this.loadImageData(image);
    }
    return pageImages;
  }

  async loadImagePage(pageNumber: number) {
    if (pageNumber < 1 || pageNumber > this.totalPages) return;
    this.currentPageNumber = pageNumber;
    this.currentPageImages = await this.paginateImages(pageNumber);
    this.editPageNumber = this.currentPageNumber;
  }

  async loadFavoriteImagePage(pageNumber: number) {
    if (pageNumber < 1 || pageNumber > this.favoriteTotalPages) return;
    this.favoriteCurrentPageNumber = pageNumber;
    const favorites = this.favoriteImageHistoryMetadata;
    this.favoritePageImages = await this.paginateFavoriteImages(favorites, pageNumber);
    this.editFavoritePageNumber = this.favoriteCurrentPageNumber;
  }

  async previousPage() {
    if (this.currentPageNumber > 1) {
      await this.loadImagePage(this.currentPageNumber - 1);
    }
  }

  async nextPage() {
    if (this.currentPageNumber < this.totalPages) {
      await this.loadImagePage(this.currentPageNumber + 1);
    }
  }

  async goToPage() {
    await this.loadImagePage(this.editPageNumber);
  }

  async previousFavoritePage() {
    if (this.favoriteCurrentPageNumber > 1) {
      await this.loadFavoriteImagePage(this.favoriteCurrentPageNumber - 1);
    }
  }

  async nextFavoritePage() {
    if (this.favoriteCurrentPageNumber < this.favoriteTotalPages) {
      await this.loadFavoriteImagePage(this.favoriteCurrentPageNumber + 1);
    }
  }

  async goToFavoritePage() {
    await this.loadFavoriteImagePage(this.editFavoritePageNumber);
  }

  async updateFavoriteImages(preservePage: boolean = true) {
    let allImages: MobiansImage[] = [];
    if (this.authService.isLoggedIn()) {
      try {
        const { images } = await this.imageSyncService.downloadFromCloud(false);
        allImages = images;
      } catch {
        allImages = [];
      }
    } else {
      try {
        allImages = await this.getAllImagesFromDb();
      } catch {
        allImages = [];
      }
    }

    const favorites = allImages
      .filter((img) => img.favorite)
      .sort((a, b) => {
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        return bTime - aTime;
      });

    let filteredFavorites = favorites;
    if (this.selectedTagFilter) {
      filteredFavorites = filteredFavorites.filter(img => img.tags?.includes(this.selectedTagFilter!));
    }

    const searchQuery = this.favoriteSearchQuery.trim().toLowerCase();
    if (searchQuery.length > 0) {
      filteredFavorites = filteredFavorites.filter((image) =>
        image.prompt?.toLowerCase().includes(searchQuery) ||
        image.promptSummary?.toLowerCase().includes(searchQuery)
      );
    }

    this.favoriteImageHistoryMetadata = filteredFavorites;
    this.favoriteTotalPages = Math.max(1, Math.ceil(filteredFavorites.length / this.favoriteImagesPerPage));
    if (!preservePage) {
      this.favoriteCurrentPageNumber = 1;
    }
    this.favoriteCurrentPageNumber = Math.min(this.favoriteCurrentPageNumber, this.favoriteTotalPages);
    this.favoritePageImages = await this.paginateFavoriteImages(filteredFavorites, this.favoriteCurrentPageNumber);
    this.editFavoritePageNumber = this.favoriteCurrentPageNumber;
  }

  async loadTags() {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction('TagStore', 'readonly');
      const store = transaction.objectStore('TagStore');
      const tags = await new Promise<ImageTag[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      this.availableTags = tags.map(tag => this.normalizeTag(tag));
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  }

  async createTag() {
    const trimmedName = this.newTagName.trim();
    if (!trimmedName) return;
    const normalized = this.normalizeTagName(trimmedName);
    const exists = this.availableTags.some(tag => this.normalizeTagName(tag.name) === normalized);
    if (exists) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Tag Exists',
        detail: `Tag "${trimmedName}" already exists.`
      });
      return;
    }

    const newTag: ImageTag = {
      id: uuidv4(),
      name: trimmedName,
      color: this.tagColors[this.availableTags.length % this.tagColors.length],
      createdAt: new Date(),
      imageCount: 0
    };

    try {
      const db = await this.getDatabase();
      const transaction = db.transaction('TagStore', 'readwrite');
      const store = transaction.objectStore('TagStore');
      store.put(newTag);

      this.availableTags.push(newTag);
      this.newTagName = '';

      this.notifyTagsUpdated('create', newTag.id);

      if (this.authService.isLoggedIn()) {
        const synced = await this.imageSyncService.syncTags(this.availableTags);
        if (synced) {
          this.setTagsLastSyncAt(Date.now());
        }
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Tag Created',
        detail: `Tag "${newTag.name}" created successfully.`
      });
    } catch (error) {
      console.error('Failed to create tag:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create tag.'
      });
    }
  }

  async deleteTag(tag: ImageTag) {
    if (!confirm(`Are you sure you want to delete the tag "${tag.name}"? Images will not be deleted.`)) {
      return;
    }

    try {
      this.addTagTombstone(tag.id);
      const db = await this.getDatabase();
      const transaction = db.transaction(['TagStore', this.storeName], 'readwrite');
      const tagStore = transaction.objectStore('TagStore');
      const imageStore = transaction.objectStore(this.storeName);
      const transactionDone = new Promise<void>((resolve) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      });

      tagStore.delete(tag.id);

      const allImages = await new Promise<MobiansImage[]>((resolve) => {
        const request = imageStore.getAll();
        request.onsuccess = () => resolve(request.result);
      });

      for (const image of allImages) {
        if (image.tags?.includes(tag.id)) {
          image.tags = image.tags.filter(t => t !== tag.id);
          imageStore.put(image);
        }
      }

      await transactionDone;

      this.availableTags = this.availableTags.filter(t => t.id !== tag.id);

      this.imageHistoryMetadata.forEach(img => {
        if (img.tags?.includes(tag.id)) {
          img.tags = img.tags.filter(t => t !== tag.id);
        }
      });

      if (this.selectedTagFilter === tag.id) {
        this.selectedTagFilter = null;
      }

      await this.updateTagCounts();
      await this.updateFavoriteImages();
      this.notifyTagsUpdated('delete', tag.id);

      if (this.authService.isLoggedIn()) {
        const deletedInCloud = await this.imageSyncService.deleteCloudTag(tag.id);
        const synced = await this.imageSyncService.syncTags(this.availableTags);
        if (deletedInCloud) {
          this.removeTagTombstone(tag.id);
        }
        if (deletedInCloud || synced) {
          this.setTagsLastSyncAt(Date.now());
        }
        if (!deletedInCloud) {
          this.messageService.add({
            severity: 'warn',
            summary: 'Cloud Sync',
            detail: 'Tag removed locally but could not be deleted from the cloud.'
          });
        }
      }
      this.messageService.add({
        severity: 'success',
        summary: 'Tag Deleted',
        detail: `Tag "${tag.name}" deleted.`
      });
    } catch (error) {
      console.error('Failed to delete tag:', error);
    }
  }

  private notifyTagsUpdated(action?: string, tagId?: string): void {
    try {
      localStorage.setItem(this.tagsUpdateKey, JSON.stringify({ ts: Date.now(), action, tagId }));
    } catch {}
  }

  private readTagTombstones(): Set<string> {
    try {
      const raw = localStorage.getItem(this.tagTombstonesKey);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter((id) => typeof id === 'string'));
    } catch {}
    return new Set();
  }

  private saveTagTombstones(tombstones: Set<string>): void {
    try {
      localStorage.setItem(this.tagTombstonesKey, JSON.stringify([...tombstones]));
    } catch {}
  }

  private addTagTombstone(tagId: string): void {
    const tombstones = this.readTagTombstones();
    if (tombstones.has(tagId)) return;
    tombstones.add(tagId);
    this.saveTagTombstones(tombstones);
  }

  private removeTagTombstone(tagId: string): void {
    const tombstones = this.readTagTombstones();
    if (!tombstones.delete(tagId)) return;
    this.saveTagTombstones(tombstones);
  }

  private normalizeTagName(name: string): string {
    return name.trim().toLowerCase();
  }

  private normalizeTag(tag: ImageTag): ImageTag {
    let createdAt: Date;
    if (tag.createdAt instanceof Date) {
      createdAt = tag.createdAt;
    } else if (tag.createdAt) {
      createdAt = new Date(tag.createdAt as any);
    } else {
      createdAt = new Date();
    }
    return { ...tag, createdAt };
  }

  private getTagsLastSyncAt(): number | null {
    try {
      const raw = localStorage.getItem(this.tagsLastSyncKey);
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private setTagsLastSyncAt(timestamp: number): void {
    try {
      localStorage.setItem(this.tagsLastSyncKey, String(timestamp));
    } catch {}
  }

  private shouldKeepLocalTag(tag: ImageTag, lastSyncAt: number | null): boolean {
    if (!lastSyncAt) return true;
    const createdAt = tag.createdAt instanceof Date ? tag.createdAt.getTime() : Date.parse(String(tag.createdAt));
    if (!Number.isFinite(createdAt)) return true;
    return createdAt >= lastSyncAt;
  }

  private async getAllImagesFromDb(): Promise<MobiansImage[]> {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      return await new Promise<MobiansImage[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to load images from IndexedDB', error);
      return [];
    }
  }

  private async getAllImageUUIDs(): Promise<string[]> {
    const images = await this.getAllImagesFromDb();
    return images.map(img => img.UUID).filter(Boolean);
  }

  private async persistTagsToStore(tags: ImageTag[]): Promise<void> {
    try {
      const db = await this.getDatabase();
      const transaction = db.transaction('TagStore', 'readwrite');
      const store = transaction.objectStore('TagStore');
      const transactionDone = new Promise<void>((resolve) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      });
      store.clear();
      tags.forEach(tag => store.put(tag));
      await transactionDone;
    } catch (error) {
      console.error('Failed to persist tags to IndexedDB', error);
    }
  }

  private async replaceTagIdInImages(oldId: string, newId: string): Promise<void> {
    if (oldId === newId) return;
    const allImages = await this.getAllImagesFromDb();
    const updatedImages: { uuid: string; tags: string[] }[] = [];
    const db = await this.getDatabase();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const store = transaction.objectStore(this.storeName);
    const transactionDone = new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });

    allImages.forEach(image => {
      if (image.tags?.includes(oldId)) {
        image.tags = image.tags.map(tagId => (tagId === oldId ? newId : tagId));
        store.put(image);
        updatedImages.push({ uuid: image.UUID, tags: [...(image.tags || [])] });
      }
    });

    this.imageHistoryMetadata.forEach(img => {
      if (img.tags?.includes(oldId)) {
        img.tags = img.tags.map(tagId => (tagId === oldId ? newId : tagId));
      }
    });

    await transactionDone;

    if (this.authService.isLoggedIn() && updatedImages.length > 0) {
      for (const { uuid, tags } of updatedImages) {
        await this.imageSyncService.updateImageMetadata(uuid, { tags });
      }
    }
  }

  private async handleTagsUpdated(payload?: { action?: string; tagId?: string }): Promise<void> {
    if (this.authService.isLoggedIn()) {
      await this.syncTagsFromCloud();
    } else {
      await this.loadTags();
    }

    const tagId = payload?.tagId;
    if (payload?.action === 'delete' && tagId) {
      this.imageHistoryMetadata.forEach(img => {
        if (img.tags?.includes(tagId)) {
          img.tags = img.tags.filter(t => t !== tagId);
        }
      });
    } else if (payload?.action === 'assign' || payload?.action === 'unassign') {
      await this.searchImages(true);
    }

    await this.updateTagCounts();

    if (this.selectedTagFilter && !this.availableTags.some(t => t.id === this.selectedTagFilter)) {
      this.selectedTagFilter = null;
    }

    await this.updateFavoriteImages();
  }

  private async syncTagsFromCloud(): Promise<void> {
    if (!this.authService.isLoggedIn() || this.tagsSyncInProgress) return;
    this.tagsSyncInProgress = true;
    try {
      const cloudTags = await this.imageSyncService.getCloudTags();
      if (!Array.isArray(cloudTags)) return;

      const lastSyncAt = this.getTagsLastSyncAt();
      const hasCloudData = cloudTags.length > 0;
      const tombstones = this.readTagTombstones();
      const normalizedCloudTags = cloudTags.map(tag => this.normalizeTag(tag));
      const filteredCloudTags = normalizedCloudTags.filter(tag => !tombstones.has(tag.id));

      if (hasCloudData) {
        const cloudIds = new Set(normalizedCloudTags.map(tag => tag.id));
        let tombstonesChanged = false;
        tombstones.forEach(id => {
          if (!cloudIds.has(id)) {
            tombstones.delete(id);
            tombstonesChanged = true;
          }
        });
        if (tombstonesChanged) {
          this.saveTagTombstones(tombstones);
        }
      }

      const nextTags: ImageTag[] = [...filteredCloudTags];
      const nextById = new Map(nextTags.map(tag => [tag.id, tag]));
      const nextByName = new Map(nextTags.map(tag => [this.normalizeTagName(tag.name), tag]));

      const tagsToUpload: ImageTag[] = [];
      const tagsToRemove: ImageTag[] = [];
      const idRemaps: Array<{ from: string; to: string }> = [];

      for (const localTagRaw of this.availableTags) {
        const localTag = this.normalizeTag(localTagRaw);
        if (tombstones.has(localTag.id)) continue;

        const nameKey = this.normalizeTagName(localTag.name);
        const cloudById = nextById.get(localTag.id);
        if (cloudById) {
          if (!cloudById.color && localTag.color) {
            cloudById.color = localTag.color;
          }
          continue;
        }

        const cloudByName = nextByName.get(nameKey);
        if (cloudByName) {
          idRemaps.push({ from: localTag.id, to: cloudByName.id });
          continue;
        }

        const shouldKeep = !hasCloudData || this.shouldKeepLocalTag(localTag, lastSyncAt);
        if (shouldKeep) {
          nextTags.push(localTag);
          nextById.set(localTag.id, localTag);
          nextByName.set(nameKey, localTag);
          tagsToUpload.push(localTag);
        } else {
          tagsToRemove.push(localTag);
        }
      }

      if (idRemaps.length > 0) {
        for (const remap of idRemaps) {
          await this.replaceTagIdInImages(remap.from, remap.to);
        }
      }

      if (tagsToRemove.length > 0) {
        const allUUIDs = await this.getAllImageUUIDs();
        for (const tag of tagsToRemove) {
          await this.removeTagFromImages(tag, allUUIDs);
        }
      }

      const dedupedMap = new Map<string, ImageTag>();
      nextTags.forEach(tag => {
        if (tag?.id) {
          dedupedMap.set(tag.id, this.normalizeTag(tag));
        }
      });
      const dedupedTags = Array.from(dedupedMap.values());
      dedupedTags.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });

      const canonicalByName = new Map<string, ImageTag>();
      const duplicateNameRemaps: Array<{ from: string; to: string }> = [];
      dedupedTags.forEach(tag => {
        const key = this.normalizeTagName(tag.name);
        const existing = canonicalByName.get(key);
        if (!existing) {
          canonicalByName.set(key, tag);
        } else {
          duplicateNameRemaps.push({ from: tag.id, to: existing.id });
        }
      });

      if (duplicateNameRemaps.length > 0) {
        for (const remap of duplicateNameRemaps) {
          await this.replaceTagIdInImages(remap.from, remap.to);
        }
      }

      this.availableTags = Array.from(canonicalByName.values());
      await this.persistTagsToStore(this.availableTags);

      if (this.selectedTagFilter && !this.availableTags.some(t => t.id === this.selectedTagFilter)) {
        this.selectedTagFilter = null;
      }

      if (tagsToUpload.length > 0 || idRemaps.length > 0) {
        const synced = await this.imageSyncService.syncTags(this.availableTags);
        if (synced) {
          this.setTagsLastSyncAt(Date.now());
        }
      } else {
        this.setTagsLastSyncAt(Date.now());
      }

      await this.updateTagCounts();
      this.updateFavoriteImages();
    } catch (error) {
      console.error('Failed to sync tags from cloud:', error);
    } finally {
      this.tagsSyncInProgress = false;
    }
  }

  private startCloudTagSync() {
    if (this.cloudSyncInterval) {
      clearInterval(this.cloudSyncInterval);
    }

    void this.syncTagsFromCloud();
    this.cloudSyncInterval = window.setInterval(() => {
      void this.syncTagsFromCloud();
    }, this.cloudSyncIntervalMs);
  }

  private async syncFromCloud() {
    try {
      await this.imageSyncService.fetchSyncStatus();

      const mergedCount = await this.mergeCloudImages();
      if (mergedCount > 0) {
        this.messageService.add({
          severity: 'success',
          summary: 'Synced from Cloud',
          detail: `${mergedCount} image(s) restored from cloud.`
        });
      }
    } catch (error) {
      console.error('Failed to sync from cloud:', error);
    }
  }

  async mergeCloudImages(): Promise<number> {
    try {
      const { images, blobs } = await this.imageSyncService.downloadFromCloud();
      if (images.length === 0) return 0;

      const db = await this.getDatabase();
      let imagesAdded = 0;
      let imagesUpdated = 0;

      for (const cloudImage of images) {
        const localImage = await new Promise<MobiansImage | null>((resolve) => {
          const transaction = db.transaction(this.storeName, 'readonly');
          const store = transaction.objectStore(this.storeName);
          const request = store.get(cloudImage.UUID);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(null);
        });

        if (!localImage) {
          const transaction = db.transaction([this.storeName, 'blobStore'], 'readwrite');
          const imageStore = transaction.objectStore(this.storeName);
          const blobStore = transaction.objectStore('blobStore');

          imageStore.put(cloudImage);

          const blob = blobs.get(cloudImage.UUID);
          if (blob) {
            blobStore.put({ UUID: cloudImage.UUID, blob });
          }

          imagesAdded++;
        } else {
          const tagsChanged = JSON.stringify(localImage.tags || []) !== JSON.stringify(cloudImage.tags || []);
          const favoriteChanged = localImage.favorite !== cloudImage.favorite;

          if (tagsChanged || favoriteChanged) {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);

            localImage.tags = cloudImage.tags || [];
            localImage.favorite = cloudImage.favorite;
            store.put(localImage);

            const cachedImg = this.imageHistoryMetadata.find(i => i.UUID === cloudImage.UUID);
            if (cachedImg) {
              cachedImg.tags = cloudImage.tags || [];
              cachedImg.favorite = cloudImage.favorite;
            }

            imagesUpdated++;
          }
        }
      }

      if (imagesAdded > 0 || imagesUpdated > 0) {
        await this.searchImages();
        this.currentPageImages = await this.paginateImages(this.currentPageNumber);
        this.updateFavoriteImages();
        await this.updateTagCounts();
      }

      return imagesAdded + imagesUpdated;
    } catch (error) {
      console.error('Failed to merge cloud images:', error);
      return 0;
    }
  }
}
