import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class StableDiffusionService {
  // private apiBaseUrl =  'http://76.157.184.213:9000';
  private apiBaseUrl =  'https://mobians.azurewebsites.net'

  constructor(private http: HttpClient) {}

  submitJob(data: any): Observable<any> {
    const url = `${this.apiBaseUrl}/submit_job/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post(url, body, {'headers':headers});
  }

  getJob(data: any): Observable<any> {
    const url = `${this.apiBaseUrl}/get_job/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post(url, body, {'headers':headers});
  }

  rateImage(data: any): Observable<any> {
    const url = `${this.apiBaseUrl}/rate_image/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post(url, body, {'headers':headers});
  }
}
