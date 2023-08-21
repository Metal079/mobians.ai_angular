import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GligenService {

  constructor() { }

  private drawingEnabledSubject = new BehaviorSubject<boolean>(false);
  drawingEnabled$ = this.drawingEnabledSubject.asObservable();

  enableDrawing() {
    this.drawingEnabledSubject.next(true);
  }

  disableDrawing() {
    this.drawingEnabledSubject.next(false);
  }
}
