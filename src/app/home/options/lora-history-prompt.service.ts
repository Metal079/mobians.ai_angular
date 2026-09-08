import { CharactersService } from '../../characters/characters.service';
import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

export type HistoryLoadRequest = {
  image: MobiansImage;
  hasLoras: boolean;
  hasRegionalPrompting: boolean;
};

@Injectable({ providedIn: 'root' })
export class LoraHistoryPromptService {
  private readonly characters = inject(CharactersService);
  private readonly requestsSubject = new Subject<HistoryLoadRequest>();
  readonly requests$ = this.requestsSubject.asObservable();

  requestLoad(request: HistoryLoadRequest) {
    this.characters.clearActiveCharacter();
    this.requestsSubject.next(request);
  }
}
