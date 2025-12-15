import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { GenerationRequest } from 'src/_shared/generation-request.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

@Injectable({ providedIn: 'root' })
export class SharedService {

  private _prompt: BehaviorSubject<string> = new BehaviorSubject<string>("");
  private _generationRequest: BehaviorSubject<GenerationRequest | null> = new BehaviorSubject<GenerationRequest | null>(null);
  private _images: BehaviorSubject<MobiansImage[]> = new BehaviorSubject<MobiansImage[]>([]);
  private _referenceImage: BehaviorSubject<MobiansImage | null> = new BehaviorSubject<MobiansImage | null>(null);
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
    this._images.next(value);
  }

  getImages(): Observable<MobiansImage[]> {
    return this._images.asObservable();
  }

  getImagesValue(): MobiansImage[] {
    return this._images.getValue();
  }

  // Update a single image by index
  updateImage(index: number, value: MobiansImage) {
    const images = this._images.getValue();
    images[index] = value;
    this._images.next(images);
  }

  // Get a single image by index
  getImage(index: number): MobiansImage | null {
    const images = this._images.getValue();
    return images[index] || null;
  }

  // Reference Image
  setReferenceImage(value: MobiansImage | null) {
    this._referenceImage.next(value);
  }

  getReferenceImage(): Observable<MobiansImage | null> {
    return this._referenceImage.asObservable();
  }

  getReferenceImageValue(): MobiansImage | null {
    return this._referenceImage.getValue();
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
