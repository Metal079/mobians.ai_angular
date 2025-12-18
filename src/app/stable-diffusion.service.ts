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

  googleLogin(data: any): Observable<any> {
    const url = `${this.apiBaseUrl}/google_auth/`;  // backend endpoint to exchange google code
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post(url, body, {'headers':headers});
  }

  // Credit system endpoints
  getUserCredits(): Observable<any> {
    const url = `${this.apiBaseUrl}/user/credits`;
    return this.http.get(url);
  }

  claimDailyBonus(): Observable<any> {
    const url = `${this.apiBaseUrl}/user/credits/daily`;
    return this.http.post(url, {});
  }

  getCreditCosts(): Observable<any> {
    const url = `${this.apiBaseUrl}/credits/costs`;
    return this.http.get(url);
  }

  getModelCreditCost(model: string): Observable<any> {
    const url = `${this.apiBaseUrl}/credits/cost/${encodeURIComponent(model)}`;
    return this.http.get(url);
  }

  getCurrentUser(): Observable<any> {
    const url = `${this.apiBaseUrl}/user/me`;
    return this.http.get(url);
  }

  // PayPal payment endpoints
  getCreditPackages(): Observable<any> {
    const url = `${this.apiBaseUrl}/credit-packages`;
    return this.http.get(url);
  }

  createPayPalOrder(packageId: string): Observable<any> {
    const url = `${this.apiBaseUrl}/paypal/create-order`;
    return this.http.post(url, { package_id: packageId });
  }

  capturePayPalOrder(orderId: string): Observable<any> {
    const url = `${this.apiBaseUrl}/paypal/capture-order`;
    return this.http.post(url, { order_id: orderId });
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

  // Admin endpoints
  updateLora(loraId: number, data: { is_active?: boolean; is_nsfw?: boolean; name?: string }): Observable<any> {
    const url = `${this.apiBaseUrl}/admin/lora/${loraId}`;
    return this.http.patch(url, data);
  }

  approveSuggestion(suggestionId: number): Observable<any> {
    const url = `${this.apiBaseUrl}/admin/suggestion/${suggestionId}/approve`;
    return this.http.post(url, {});
  }

  rejectSuggestion(suggestionId: number): Observable<any> {
    const url = `${this.apiBaseUrl}/admin/suggestion/${suggestionId}/reject`;
    return this.http.post(url, {});
  }

  resolveCivitAiLink(versionId: number): Observable<any> {
    const url = `${this.apiBaseUrl}/admin/civitai-link/${encodeURIComponent(versionId)}`;
    return this.http.get(url);
  }

  // Downloader status endpoints
  getDownloaderStatus(): Observable<any> {
    const url = `${this.apiBaseUrl}/admin/downloader-status`;
    return this.http.get(url);
  }

  getDownloadHistory(limit: number = 20): Observable<any> {
    const url = `${this.apiBaseUrl}/admin/download-history?limit=${limit}`;
    return this.http.get(url);
  }

  triggerDownload(): Observable<any> {
    const url = `${this.apiBaseUrl}/admin/trigger-download`;
    return this.http.post(url, {});
  }
  //#endregion

  //#region CivitAI API calls
  searchByQuery(query: string, showNsfw: boolean = false): Observable<any> {
    const url = `${this.apiBaseUrl}/search_civitAi_loras_by_query/${encodeURIComponent(query)}?show_nsfw=${showNsfw}`;
    return this.http.get(url);
  }

  searchByID(id: string, showNsfw: boolean = false): Observable<any> {
    const url = `${this.apiBaseUrl}/search_civitAi_loras_by_id/${encodeURIComponent(id)}?show_nsfw=${showNsfw}`;
    return this.http.get(url);
  }

  searchByUser(username: string, showNsfw: boolean = false): Observable<any> {
    const url = `${this.apiBaseUrl}/search_civitAi_loras_by_user/${encodeURIComponent(username)}?show_nsfw=${showNsfw}`;
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
