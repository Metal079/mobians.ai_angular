import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { MobiansImage, MobiansImageMetadata, ImageTag } from '../_shared/mobians-image.interface';
import { AuthService } from './auth/auth.service';
import { environment } from '../environments/environment';

export interface SyncStatus {
  syncEnabled: boolean;
  imagesInCloud: number;
  quota: { used: number; limit: number };
  lastSyncTime: string | null;
  isSyncing: boolean;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  uploadedCount: number;
  downloadedCount: number;
  errors: string[];
}

interface SyncedImageInfo {
  imageUUID: string;
  isSynced: boolean;
  serverUpdatedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ImageSyncService {
  private readonly SYNC_LIMIT = 1000;
  private readonly API_URL = environment.apiBaseUrl;
  
  // Track sync status
  private syncStatusSubject = new BehaviorSubject<SyncStatus>({
    syncEnabled: false,
    imagesInCloud: 0,
    quota: { used: 0, limit: 1000 },
    lastSyncTime: null,
    isSyncing: false
  });
  public syncStatus$ = this.syncStatusSubject.asObservable();

  // Track which images are synced (cached locally)
  private syncedImageUUIDs = new Set<string>();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    // Load synced UUIDs from localStorage on init
    this.loadSyncedUUIDsFromStorage();
  }

  /**
   * Calculate sync priority for an image
   */
  calculateSyncPriority(image: MobiansImage | MobiansImageMetadata): number {
    let priority = 0;
    
    // Favorites get highest priority - always synced first
    if (image.favorite) priority += 1000;
    
    // Tagged images are organized = important
    if (image.tags && image.tags.length > 0) priority += 50;
    
    // Recent images get priority
    if (image.timestamp) {
      const ageInDays = (Date.now() - new Date(image.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays < 7) priority += 30;
      else if (ageInDays < 30) priority += 15;
    }
    
    return priority;
  }

  /**
   * Check if an image is synced to the cloud
   */
  isImageSynced(imageUUID: string): boolean {
    return this.syncedImageUUIDs.has(imageUUID);
  }

  /**
   * Get auth headers for API calls
   */
  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  /**
   * Fetch sync status from server
   */
  async fetchSyncStatus(): Promise<SyncStatus> {
    if (!this.authService.isLoggedIn()) {
      return this.syncStatusSubject.value;
    }

    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.API_URL}/history/sync/status`, {
          headers: this.getAuthHeaders()
        })
      );

      const status: SyncStatus = {
        syncEnabled: true,
        imagesInCloud: response.images_in_cloud || 0,
        quota: { 
          used: response.images_in_cloud || 0, 
          limit: this.SYNC_LIMIT 
        },
        lastSyncTime: response.last_sync_time || null,
        isSyncing: false
      };

      // Update synced UUIDs cache
      if (response.synced_uuids) {
        this.syncedImageUUIDs = new Set(response.synced_uuids);
        this.saveSyncedUUIDsToStorage();
      }

      this.syncStatusSubject.next(status);
      return status;
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
      return this.syncStatusSubject.value;
    }
  }

  /**
   * Sync a single image to the cloud (used when favoriting)
   */
  async syncImage(image: MobiansImage, blob: Blob): Promise<boolean> {
    if (!this.authService.isLoggedIn()) {
      console.log('Cannot sync - user not logged in');
      return false;
    }

    const wasSynced = this.isImageSynced(image.UUID);

    // Check quota
    const status = this.syncStatusSubject.value;
    if (status.quota.used >= status.quota.limit && !wasSynced) {
      console.log('Sync quota exceeded');
      return false;
    }

    try {
      // Convert blob to base64
      const base64 = await this.blobToBase64(blob);

      const payload = {
        image_uuid: image.UUID,
        prompt: image.prompt || '',
        prompt_summary: image.promptSummary || '',
        negative_prompt: image.negativePrompt || '',
        model: image.model || '',
        seed: image.seed || null,
        cfg: image.cfg || null,
        width: image.width,
        height: image.height,
        aspect_ratio: image.aspectRatio,
        is_favorite: image.favorite || false,
        sync_priority: this.calculateSyncPriority(image),
        loras: image.loras || [],
        regional_prompting: image.regional_prompting || null,
        tags: image.tags || [],
        image_blob: base64
      };

      await firstValueFrom(
        this.http.post(`${this.API_URL}/history/sync/image`, payload, {
          headers: this.getAuthHeaders()
        })
      );

      // Mark as synced locally
      this.syncedImageUUIDs.add(image.UUID);
      this.saveSyncedUUIDsToStorage();

      // Update status
      const currentStatus = this.syncStatusSubject.value;
      this.syncStatusSubject.next({
        ...currentStatus,
        imagesInCloud: currentStatus.imagesInCloud + (wasSynced ? 0 : 1),
        quota: {
          ...currentStatus.quota,
          used: currentStatus.quota.used + (wasSynced ? 0 : 1)
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to sync image:', error);
      return false;
    }
  }

  /**
   * Sync multiple images (batch sync for "Backup Old Images" button)
   */
  async syncBatchImages(
    images: MobiansImage[], 
    getBlob: (uuid: string) => Promise<Blob | undefined>,
    progressCallback?: (current: number, total: number) => void
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      uploadedCount: 0,
      downloadedCount: 0,
      errors: []
    };

    if (!this.authService.isLoggedIn()) {
      result.success = false;
      result.errors.push('User not logged in');
      return result;
    }

    // Update syncing status
    const currentStatus = this.syncStatusSubject.value;
    this.syncStatusSubject.next({ ...currentStatus, isSyncing: true });

    // Sort by priority and filter to limit
    const sortedImages = [...images]
      .map(img => ({ ...img, syncPriority: this.calculateSyncPriority(img) }))
      .sort((a, b) => (b.syncPriority || 0) - (a.syncPriority || 0))
      .slice(0, this.SYNC_LIMIT);

    // Filter out already synced images
    const imagesToSync = sortedImages.filter(img => !this.isImageSynced(img.UUID));

    for (let i = 0; i < imagesToSync.length; i++) {
      const image = imagesToSync[i];
      
      if (progressCallback) {
        progressCallback(i + 1, imagesToSync.length);
      }

      try {
        const blob = await getBlob(image.UUID);
        if (blob) {
          const success = await this.syncImage(image, blob);
          if (success) {
            result.uploadedCount++;
            result.syncedCount++;
          }
        } else {
          result.errors.push(`No blob found for image ${image.UUID}`);
        }
      } catch (error) {
        result.errors.push(`Failed to sync ${image.UUID}: ${error}`);
      }
    }

    // Update syncing status
    this.syncStatusSubject.next({ 
      ...this.syncStatusSubject.value, 
      isSyncing: false,
      lastSyncTime: new Date().toISOString()
    });

    return result;
  }

  /**
   * Download synced images from cloud to local device
   */
  async downloadFromCloud(includeBlobs: boolean = true): Promise<{ images: MobiansImage[], blobs: Map<string, Blob> }> {
    const images: MobiansImage[] = [];
    const blobs = new Map<string, Blob>();

    if (!this.authService.isLoggedIn()) {
      return { images, blobs };
    }

    try {
      const params = new HttpParams().set('include_blobs', includeBlobs ? 'true' : 'false');
      const response = await firstValueFrom(
        this.http.get<any[]>(`${this.API_URL}/history/sync/images`, {
          headers: this.getAuthHeaders(),
          params
        })
      );

      for (const item of response) {
        const image: MobiansImage = {
          UUID: item.image_uuid,
          prompt: item.prompt,
          promptSummary: item.prompt_summary,
          negativePrompt: item.negative_prompt,
          model: item.model,
          seed: item.seed,
          cfg: item.cfg,
          width: item.width,
          height: item.height,
          aspectRatio: item.aspect_ratio,
          favorite: item.is_favorite,
          syncPriority: item.sync_priority,
          loras: item.loras || [],
          regional_prompting: item.regional_prompting || { enabled: false, regions: [] },
          tags: item.tags || [],
          timestamp: new Date(item.created_at)
        };
        images.push(image);

        // Convert base64 blob back to Blob
        if (includeBlobs && item.image_blob) {
          const blob = this.base64ToBlob(item.image_blob, 'image/webp');
          blobs.set(item.image_uuid, blob);
        }

        // Mark as synced
        this.syncedImageUUIDs.add(item.image_uuid);
      }

      this.saveSyncedUUIDsToStorage();
      return { images, blobs };
    } catch (error) {
      console.error('Failed to download from cloud:', error);
      return { images, blobs };
    }
  }

  /**
   * Sync user tags to cloud
   */
  async syncTags(tags: ImageTag[]): Promise<boolean> {
    if (!this.authService.isLoggedIn()) {
      return false;
    }

    try {
      await firstValueFrom(
        this.http.post(`${this.API_URL}/history/sync/tags`, { tags }, {
          headers: this.getAuthHeaders()
        })
      );
      return true;
    } catch (error) {
      console.error('Failed to sync tags:', error);
      return false;
    }
  }

  /**
   * Delete a synced tag from the cloud.
   */
  async deleteCloudTag(tagId: string): Promise<boolean> {
    if (!this.authService.isLoggedIn()) {
      return false;
    }

    try {
      await firstValueFrom(
        this.http.delete(`${this.API_URL}/history/sync/tags/${tagId}`, {
          headers: this.getAuthHeaders()
        })
      );
      return true;
    } catch (error) {
      if ((error as any)?.status === 404) {
        return true;
      }
      console.error('Failed to delete cloud tag:', error);
      return false;
    }
  }

  /**
   * Get tags from cloud
   */
  async getCloudTags(): Promise<ImageTag[]> {
    if (!this.authService.isLoggedIn()) {
      return [];
    }

    try {
      const response = await firstValueFrom(
        this.http.get<any[]>(`${this.API_URL}/history/sync/tags`, {
          headers: this.getAuthHeaders()
        })
      );
      return response.map(t => ({
        id: t.id,
        name: t.name,
        color: t.color,
        createdAt: new Date(t.created_at)
      }));
    } catch (error) {
      console.error('Failed to get cloud tags:', error);
      return [];
    }
  }

  /**
   * Update just the metadata (tags, favorite status) of a synced image
   * without re-uploading the blob. More efficient for tag operations.
   */
  async updateImageMetadata(
    imageUUID: string, 
    updates: { tags?: string[]; is_favorite?: boolean }
  ): Promise<boolean> {
    if (!this.authService.isLoggedIn()) {
      return false;
    }

    // Only update if image is synced to cloud
    if (!this.isImageSynced(imageUUID)) {
      return false;
    }

    try {
      await firstValueFrom(
        this.http.patch(`${this.API_URL}/history/sync/image/${imageUUID}`, updates, {
          headers: this.getAuthHeaders()
        })
      );
      return true;
    } catch (error) {
      console.error('Failed to update image metadata:', error);
      return false;
    }
  }

  /**
   * Remove an image from cloud sync
   */
  async unsyncImage(imageUUID: string): Promise<boolean> {
    if (!this.authService.isLoggedIn()) {
      return false;
    }

    try {
      await firstValueFrom(
        this.http.delete(`${this.API_URL}/history/sync/image/${imageUUID}`, {
          headers: this.getAuthHeaders()
        })
      );

      this.syncedImageUUIDs.delete(imageUUID);
      this.saveSyncedUUIDsToStorage();

      const currentStatus = this.syncStatusSubject.value;
      this.syncStatusSubject.next({
        ...currentStatus,
        imagesInCloud: Math.max(0, currentStatus.imagesInCloud - 1),
        quota: {
          ...currentStatus.quota,
          used: Math.max(0, currentStatus.quota.used - 1)
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to unsync image:', error);
      return false;
    }
  }

  // Helper: Convert Blob to base64
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix if present
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Helper: Convert base64 to Blob
  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  // Load synced UUIDs from localStorage
  private loadSyncedUUIDsFromStorage(): void {
    try {
      const stored = localStorage.getItem('syncedImageUUIDs');
      if (stored) {
        this.syncedImageUUIDs = new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load synced UUIDs from storage:', error);
    }
  }

  // Save synced UUIDs to localStorage
  private saveSyncedUUIDsToStorage(): void {
    try {
      localStorage.setItem('syncedImageUUIDs', JSON.stringify([...this.syncedImageUUIDs]));
    } catch (error) {
      console.error('Failed to save synced UUIDs to storage:', error);
    }
  }
}
