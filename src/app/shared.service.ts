import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable()
export class SharedService {

  private _prompt: BehaviorSubject<string> = new BehaviorSubject<string>("");

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
}
