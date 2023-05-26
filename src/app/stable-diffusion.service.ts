import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class StableDiffusionService {
  private apiBaseUrl = 'https://localhost:7246';  // replace with your base API url

  constructor(private http: HttpClient) {}

  txt2Img(data: any): Observable<any> {
    const url = `${this.apiBaseUrl}/StableDiffusion/txt2img`;
    return this.http.post(url, data);
  }

}
