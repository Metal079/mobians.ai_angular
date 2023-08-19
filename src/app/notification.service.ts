import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  readonly VAPID_PUBLIC_KEY = "BDrvd3soyvIOUEp5c-qXV-833C8hJvO-6wE1GZquvs9oqWQ70j0W4V9RCa_el8gIpOBeCKkuyVwmnAdalvOMfLg";

  //private apiBaseUrl =  'http://76.157.184.213:9000';
  private apiBaseUrl = 'https://mobians.azurewebsites.net'

  constructor(private http: HttpClient, private swPush: SwPush) { }

  playDing() {
    const ding = new Audio('/assets/ding.mp3');
    ding.volume = 0.5;
    ding.play();
  }

  subscribeToNotifications() {
    this.swPush.requestSubscription({
      serverPublicKey: this.VAPID_PUBLIC_KEY
    })
      .then(subscription => {
        // Send the subscription object to your server
        this.http.post(`${this.apiBaseUrl}/subscribe`, subscription).subscribe(response => {
          console.log('Subscription sent to server:', response);
        }, error => {
          console.error('Error sending subscription to server:', error);
        });
      })
      .catch(err => console.error("Could not subscribe to notifications", err));
  }

  sendPushNotification() {
    this.http.get(`${this.apiBaseUrl}/send_notification`).subscribe(response => {
      console.log('Push notification sent:', response);
    }, error => {
      console.error('Error sending push notification:', error);
    });
  }
}
