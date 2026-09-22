import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { GenerationRequest } from 'src/_shared/generation-request.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

@Injectable({ providedIn: 'root' })
export class SharedService implements OnDestroy {

  private _prompt: BehaviorSubject<string> = new BehaviorSubject<string>("");
  private _generationRequest: BehaviorSubject<GenerationRequest | null> = new BehaviorSubject<GenerationRequest | null>(null);
  private _images: BehaviorSubject<MobiansImage[]> = new BehaviorSubject<MobiansImage[]>([]);
  private imageObjectUrls = new Map<string, Blob>();
  private _referenceImage: BehaviorSubject<MobiansImage | null> = new BehaviorSubject<MobiansImage | null>(null);
  private referenceImageObjectUrl: string | null = null;
  private _userData: BehaviorSubject<any> = new BehaviorSubject<any>(null);
  private _instructions: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);


  constructor() {
    // Rehydrate user session from localStorage on app start
    try {
      const saved = localStorage.getItem('userData');
      if (saved) {
        const userData = JSON.parse(saved);
        
        // Check if userData has a valid token - if not, clear invalid session
        // This handles users who got userData saved without a token due to backend errors
        if (!userData?.token) {
          // Invalid session - user appears logged in but has no token
          // Clear it so they can log in fresh
          console.warn('Invalid session detected (no token) - clearing stale auth data');
          localStorage.removeItem('userData');
          localStorage.removeItem('authToken');
          this._userData.next(null);
        } else {
          this._userData.next(userData);
          // Ensure authToken is synchronized for the HTTP interceptor
          localStorage.setItem('authToken', userData.token);
        }
      }
    } catch {
      // JSON parse error - clear corrupted data
      try {
        localStorage.removeItem('userData');
        localStorage.removeItem('authToken');
      } catch {}
    }
  }

  setPrompt(value: string) {
    this._prompt.next(value);
  }

  getPrompt(): Observable<string> {
    return this._prompt.asObservable();
  }

  getPromptValue(): string {
    return this._prompt.getValue();
  }

  setGenerationRequest(value: GenerationRequest) {
    this._generationRequest.next(value);
  }

  getGenerationRequest(): Observable<GenerationRequest | null> {
    return this._generationRequest.asObservable();
  }

  getGenerationRequestValue(): GenerationRequest | null {
    return this._generationRequest.getValue();
  }

  // Images
  setImages(value: MobiansImage[]) {
    const nextObjectUrls = new Map<string, Blob>();
    const images = value.map(image => {
      if (!image.blob) return image;

      // The generating view and history own temporary URLs that are revoked
      // on navigation. Shared previews must live as long as the shared images.
      const url = image.url && this.imageObjectUrls.get(image.url) === image.blob
        ? image.url
        : URL.createObjectURL(image.blob);
      nextObjectUrls.set(url, image.blob);
      return { ...image, url };
    });

    const previousObjectUrls = this.imageObjectUrls;
    this.imageObjectUrls = nextObjectUrls;
    this._images.next(images);
    previousObjectUrls.forEach((_, url) => {
      if (!nextObjectUrls.has(url)) URL.revokeObjectURL(url);
    });
  }

  getImages(): Observable<MobiansImage[]> {
    return this._images.asObservable();
  }

  getImagesValue(): MobiansImage[] {
    return this._images.getValue();
  }

  // Update a single image by index
  updateImage(index: number, value: MobiansImage) {
    const images = [...this._images.getValue()];
    images[index] = value;
    this.setImages(images);
  }

  // Get a single image by index
  getImage(index: number): MobiansImage | null {
    const images = this._images.getValue();
    return images[index] || null;
  }

  // Reference Image
  setReferenceImage(value: MobiansImage | null) {
    this.revokeReferenceImageObjectUrl();

    if (value?.blob) {
      try {
        const url = URL.createObjectURL(value.blob);
        this.referenceImageObjectUrl = url;
        this._referenceImage.next({ ...value, url });
        return;
      } catch {
        // Fall back to the existing URL if object URLs are unavailable.
      }
    }

    this._referenceImage.next(value);
  }

  getReferenceImage(): Observable<MobiansImage | null> {
    return this._referenceImage.asObservable();
  }

  getReferenceImageValue(): MobiansImage | null {
    return this._referenceImage.getValue();
  }

  private revokeReferenceImageObjectUrl(): void {
    if (!this.referenceImageObjectUrl) return;
    URL.revokeObjectURL(this.referenceImageObjectUrl);
    this.referenceImageObjectUrl = null;
  }

  ngOnDestroy(): void {
    this.imageObjectUrls.forEach((_, url) => URL.revokeObjectURL(url));
    this.imageObjectUrls.clear();
    this.revokeReferenceImageObjectUrl();
  }

  setUserData(value: any) {
    this._userData.next(value);
    // Persist or clear session in localStorage
    try {
      if (value) {
        localStorage.setItem('userData', JSON.stringify(value));
        // Sync authToken for the HTTP interceptor
        if (value.token) {
          localStorage.setItem('authToken', value.token);
        }
      } else {
        localStorage.removeItem('userData');
        localStorage.removeItem('authToken');
      }
    } catch {
      // ignore storage errors
    }
  }

  getUserData(): Observable<any> {
    return this._userData.asObservable();
  }

  getUserDataValue(): any {
    return this._userData.getValue();
  }

  // Set the instructions to show/hide
  enableInstructions(): void {
    this._instructions.next(true);
  }

  disableInstructions(): void {
    this._instructions.next(false);
  }

  getInstructionValue(): boolean {
    return this._instructions.getValue();
  }

}
