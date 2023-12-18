import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { GenerationRequest } from 'src/_shared/generation-request.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

@Injectable()
export class SharedService {

  private _prompt: BehaviorSubject<string> = new BehaviorSubject<string>("");
  private _generationRequest: BehaviorSubject<GenerationRequest | null> = new BehaviorSubject<GenerationRequest | null>(null);
  private _images: BehaviorSubject<MobiansImage[]> = new BehaviorSubject<MobiansImage[]>([]);
  private _referenceImage: BehaviorSubject<MobiansImage | null> = new BehaviorSubject<MobiansImage | null>(null);
  private _userData: BehaviorSubject<any> = new BehaviorSubject<any>(null);


  constructor() { }

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
  }

  getUserData(): Observable<any> {
      return this._userData.asObservable();
  }

  getUserDataValue(): any {
      return this._userData.getValue();
  }

}
