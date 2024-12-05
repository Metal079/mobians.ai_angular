import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  readonly VAPID_PUBLIC_KEY = "BDrvd3soyvIOUEp5c-qXV-833C8hJvO-6wE1GZquvs9oqWQ70j0W4V9RCa_el8gIpOBeCKkuyVwmnAdalvOMfLg";
  public userId: string = uuidv4();  // Generate a new UUID for the user

  //private apiBaseUrl = 'http://76.157.184.213:9000';
  private apiBaseUrl = 'https://api.mobians.ai';

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
        // Prepare the data to send to the server
        const data = {
          userId: this.userId,
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh') as ArrayBuffer))),
            auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth') as ArrayBuffer)))
                    
          }
        };
        // Send the subscription object to your server
        this.http.post(`${this.apiBaseUrl}/subscribe`, data).subscribe(response => {
          console.log('Subscription sent to server:', response);
        }, error => {
          console.error('Error sending subscription to server:', error);
        });
      })
      .catch(err => console.error("Could not subscribe to notifications", err));
  }
  

  sendPushNotification() {
    const userId = this.userId; // Use the user ID generated earlier
    this.http.get(`${this.apiBaseUrl}/send_notification/${userId}`).subscribe(response => {
      console.log('Push notification sent:', response);
    }, error => {
      console.error('Error sending push notification:', error);
    });
  }

}
