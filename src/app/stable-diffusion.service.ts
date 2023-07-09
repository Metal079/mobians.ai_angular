import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class StableDiffusionService {
  //private apiBaseUrl = 'http://76.157.184.213:8000 ';  // replace with your base API url
  //private apiBaseUrl = 'http://127.0.0.1:8080';
  private apiBaseUrl =  'http://76.157.184.213:9000';

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
}
