import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

@Injectable({ providedIn: 'root' })
export class LoraHistoryPromptService {
  private readonly requestsSubject = new Subject<MobiansImage>();
  readonly requests$ = this.requestsSubject.asObservable();

  requestLoad(image: MobiansImage) {
    this.requestsSubject.next(image);
  }
}
