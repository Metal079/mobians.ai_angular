import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  constructor() { }

  playDing() {
     const ding = new Audio('/assets/ding.mp3');
     ding.volume = 0.5;
     ding.play();
  }
}
