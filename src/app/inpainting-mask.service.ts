import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class InpaintingMaskService {

  private canvasDataSubject = new Subject<string>(); // Using RxJS Subject to make it observable
  canvasData$ = this.canvasDataSubject.asObservable(); // Exposing as Observable

  constructor() { }

  // To save canvas data, you can pass in canvas.toDataURL()
  setCanvasData(dataUrl: string) {
    this.canvasDataSubject.next(dataUrl);
  }

  // Clear the canvas data
  clearCanvasData() {
    this.canvasDataSubject.next('');
  }
}
