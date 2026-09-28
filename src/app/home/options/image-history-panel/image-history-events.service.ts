import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ImageHistoryEventsService {
  private readonly saved = new Subject<object>();
  readonly imagesSaved$ = this.saved.asObservable();

  // Each history panel has its own cached list, but they share the same database.
  notifyImagesSaved(source: object): void { this.saved.next(source); }
}
