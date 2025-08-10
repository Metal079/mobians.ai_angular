import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class StableDiffusionService {
  private apiBaseUrl =  environment.apiBaseUrl;

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

  discordLogin(data: any): Observable<any> {
    const url = `${this.apiBaseUrl}/discord_auth/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post(url, body, {'headers':headers});
  }

  //#region Lora API calls
  getLoras(status: string = 'active'): Observable<any> {
    const url = `${this.apiBaseUrl}/get_loras/?status=${encodeURIComponent(status)}`;  // default to active
    return this.http.get(url);
  }

  getLoraSuggestions(): Observable<any> {
    const url = `${this.apiBaseUrl}/get_lora_suggestions/`;
    return this.http.get(url);
  }
  //#endregion

  //#region CivitAI API calls
  searchByQuery(query: string): Observable<any> {
    const url = `${this.apiBaseUrl}/search_civitAi_loras_by_query/${query}`;  // note the trailing slash
    return this.http.get(url);
  }

  searchByID(id: string): Observable<any> {
    const url = `${this.apiBaseUrl}/search_civitAi_loras_by_id/${id}`;  // note the trailing slash
    return this.http.get(url);
  }

  searchByUser(username: string): Observable<any> {
    const url = `${this.apiBaseUrl}/search_civitAi_loras_by_user/${username}`;  // note the trailing slash
    return this.http.get(url);
  }

  addLoraSuggestion(data: any): Observable<any> {
    const url = `${this.apiBaseUrl}/add_lora_suggestion/`; 
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post(url, body, {'headers':headers});
  }

  getJobStatus(jobId: string): Observable<any> {
    const url = `${this.apiBaseUrl}/get_job_status/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify({ job_id: jobId });
    return this.http.post(url, body, {'headers':headers});
  }

  cancelJob(jobId: string): Observable<any> {
    const url = `${this.apiBaseUrl}/cancel_job/${encodeURIComponent(jobId)}/`;
    return this.http.delete(url);
  }
}
