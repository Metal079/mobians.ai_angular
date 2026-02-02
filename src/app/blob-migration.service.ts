// blob-migration.service.ts
import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import ExifReader from 'exifreader';

interface MigrationProgress {
  total: number;
  processed: number;
  currentImageUrl?: string;
}

@Injectable({
  providedIn: 'root',
})
export class BlobMigrationService {
  private progressSubject = new Subject<MigrationProgress>();
  progress$: Observable<MigrationProgress> = this.progressSubject.asObservable();

  constructor() { }

  async migrateData(db: IDBDatabase) {
    const transaction = db.transaction('ImageStore', 'readwrite');
    const store = transaction.objectStore('ImageStore');

    const totalCount = await this.getTotalCount(store);
    let processedCount = 0;

    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = async (event: Event) => {
      const request = event.target as IDBRequest;
      if (!request) return;

      const cursor = request.result as IDBCursorWithValue;
      if (cursor) {
        const record = cursor.value;

        if (record.base64 && !record.blob) {
          try {
            // Convert base64 to Blob with auto-detection
            const blob = this.base64ToBlob(record.base64);

            // Update the record
            delete record.base64;
            record.blob = blob;

            const updateRequest = cursor.update(record);
            await this.awaitRequest(updateRequest);

            // Create a temporary URL for the current image
            const imageUrl = URL.createObjectURL(blob);

            // Update progress
            processedCount++;
            this.progressSubject.next({
              total: totalCount,
              processed: processedCount,
              currentImageUrl: imageUrl,
            });

            // Revoke the URL after a short delay to free memory
            setTimeout(() => {
              URL.revokeObjectURL(imageUrl);
            }, 5000); // Adjust delay as needed
          } catch (error) {
            console.error(`Failed to migrate image UUID: ${record.UUID}`, error);
            // Optionally, emit an error or handle it as needed
          }
        }

        cursor.continue();
      } else {
        // Migration completed
        this.progressSubject.complete();
      }
    };

    cursorRequest.onerror = (event: Event) => {
      console.error('Migration error:', cursorRequest.error);
      this.progressSubject.error(cursorRequest.error);
    };
  }

  base64ToBlob(base64: string): Blob {
    let contentType = 'application/octet-stream'; // Default MIME type
    let cleanedBase64 = base64;

    // Check if base64 string has data URL prefix
    const matches = base64.match(/^data:(image\/png|image\/webp);base64,(.+)$/);
    if (matches) {
      contentType = matches[1];
      cleanedBase64 = matches[2];
    } else {
      // No data URL prefix; attempt to detect MIME type based on magic numbers
      const byteArray = this.base64ToUint8Array(base64);

      // Detect image type based on magic numbers
      const isPng =
        byteArray[0] === 0x89 &&
        byteArray[1] === 0x50 &&
        byteArray[2] === 0x4e &&
        byteArray[3] === 0x47 &&
        byteArray[4] === 0x0d &&
        byteArray[5] === 0x0a &&
        byteArray[6] === 0x1a &&
        byteArray[7] === 0x0a;

      const isWebp =
        byteArray[0] === 0x52 && // 'R'
        byteArray[1] === 0x49 && // 'I'
        byteArray[2] === 0x46 && // 'F'
        byteArray[3] === 0x46 && // 'F'
        byteArray[8] === 0x57 && // 'W'
        byteArray[9] === 0x45 && // 'E'
        byteArray[10] === 0x42 && // 'B'
        byteArray[11] === 0x50;   // 'P'

      if (isPng) {
        contentType = 'image/png';
      } else if (isWebp) {
        contentType = 'image/webp';
      }

      // No data URL prefix; cleanedBase64 remains as the original base64 string
    }

    // Convert base64 to Uint8Array
    const byteArray = this.base64ToUint8Array(cleanedBase64);

    // Create and return the Blob
    return new Blob([byteArray], { type: contentType });
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private awaitRequest(request: IDBRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private getTotalCount(store: IDBObjectStore): Promise<number> {
    return new Promise((resolve, reject) => {
      const countRequest = store.count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
  }

  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        const result = reader.result as string;
        // The result is a data URL, so we need to remove the prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };

      reader.onerror = (error) => {
        reject(error);
      };

      reader.readAsDataURL(blob);
    });
  }

  async convertToWebP(blob: Blob): Promise<Blob> {
    try {
      const bitmap = await createImageBitmap(blob);

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return blob;
      }

      ctx.drawImage(bitmap, 0, 0);

      const webpBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob(
          (converted) => {
            resolve(converted ?? blob);
          },
          'image/webp',
          0.95
        );
      });

      return webpBlob;
    } catch (error) {
      console.warn('WebP conversion failed; keeping original blob.', error);
      return blob;
    }
  }
  
  async convertWebPToPNG(webpBlob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx!.drawImage(img, 0, 0);
        canvas.toBlob(
          (pngBlob) => {
            if (pngBlob) resolve(pngBlob);
            else reject('Conversion to PNG failed');
          },
          'image/png'
        );
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(webpBlob);
    });
  }

  async extractMetadata(blob: Blob): Promise<any> {
    const arrayBuffer = await blob.arrayBuffer();
    const tags = ExifReader.load(arrayBuffer);
    return tags;
  }
}
