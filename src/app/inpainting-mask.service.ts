import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class InpaintingMaskService {

  private canvasDataSubject = new Subject<string>(); // Using RxJS Subject to make it observable
  canvasData$ = this.canvasDataSubject.asObservable(); // Exposing as Observable

  private currentCanvasData: string = ''; // Add this line to store the current canvas data

  constructor() { }

  // To save canvas data, you can pass in canvas.toDataURL()
  setCanvasData(dataUrl: string) {
    this.currentCanvasData = dataUrl; // Update the current canvas data
    this.canvasDataSubject.next(dataUrl);
  }

  // To get canvas data directly
  getCurrentCanvasData(): string {
    return this.currentCanvasData;
  }

  // Clear the canvas data
  clearCanvasData() {
    this.currentCanvasData = ''; // Clear the current canvas data
    this.canvasDataSubject.next('');
  }
}
