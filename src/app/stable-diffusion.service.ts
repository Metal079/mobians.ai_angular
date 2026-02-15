import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface CreditPackageResponseItem {
  id: string;
  name: string;
  price_usd: number;
  credits: number;
  description: string;
}

export interface CreditPackagesResponse {
  packages: CreditPackageResponseItem[];
}

export interface PayPalOrderResponse {
  order_id: string;
}

export interface PayPalCaptureResponse {
  message?: string;
  credits_added: number;
  new_balance?: number;
}

export interface ApiUser {
  credits?: number;
  is_banned?: boolean;
  daily_bonus_streak?: number;
  last_daily_bonus?: string | null;
}

export interface CurrentUserResponse {
  status: string;
  user?: ApiUser;
}

export interface UserCreditsResponse {
  status: string;
  credits: number;
  can_claim_daily_bonus: boolean;
  daily_bonus_streak: number;
  last_daily_bonus?: string | null;
  next_daily_bonus?: number;
  next_daily_bonus_streak?: number;
}

export interface DailyBonusResponse {
  status: string;
  message: string;
  new_balance: number;
  streak: number;
  credits_awarded: number;
}

export interface RegionalPromptPresetRegion {
  id: string;
  prompt: string;
  negative_prompt: string;
  x: number;
  y: number;
  width: number;
  height: number;
  denoise_strength: number;
  feather: number;
  opacity: number;
  inherit_base_prompt: boolean;
}

export interface RegionalPromptPreset {
  id?: string;
  name: string;
  regions: RegionalPromptPresetRegion[];
}

export interface SubmitJobResponse {
  job_id: string;
  credits_used?: number;
  credits_remaining?: number;
}

export interface JobStatusResponse {
  status?: 'pending' | 'completed' | 'failed' | 'error' | 'cancelled';
  queue_position?: number;
  eta?: number;
  result?: string[];
  message?: string;
  refund?: {
    credits_refunded: number;
    new_balance: number;
  };
}

export interface AuthExchangeResponse {
  token?: string;
  credits?: number;
  daily_bonus_streak?: number;
  last_daily_bonus?: string | null;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class StableDiffusionService {
  private apiBaseUrl =  environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  submitJob(data: any): Observable<SubmitJobResponse> {
    const url = `${this.apiBaseUrl}/submit_job/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post<SubmitJobResponse>(url, body, {'headers':headers});
  }

  getJob(data: any): Observable<JobStatusResponse> {
    const url = `${this.apiBaseUrl}/get_job/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post<JobStatusResponse>(url, body, {'headers':headers});
  }

  rateImage(data: any): Observable<any> {
    const url = `${this.apiBaseUrl}/rate_image/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post<AuthExchangeResponse>(url, body, {'headers':headers});
  }

  discordLogin(data: any): Observable<AuthExchangeResponse> {
    const url = `${this.apiBaseUrl}/discord_auth/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post<AuthExchangeResponse>(url, body, {'headers':headers});
  }

  googleLogin(data: any): Observable<AuthExchangeResponse> {
    const url = `${this.apiBaseUrl}/google_auth/`;  // backend endpoint to exchange google code
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(data);
    return this.http.post(url, body, {'headers':headers});
  }

  // Credit system endpoints
  getUserCredits(): Observable<UserCreditsResponse> {
    const url = `${this.apiBaseUrl}/user/credits`;
    return this.http.get<UserCreditsResponse>(url);
  }

  claimDailyBonus(): Observable<DailyBonusResponse> {
    const url = `${this.apiBaseUrl}/user/credits/daily`;
    return this.http.post<DailyBonusResponse>(url, {});
  }

  getCreditCosts(): Observable<any> {
    const url = `${this.apiBaseUrl}/credits/costs`;
    return this.http.get<CurrentUserResponse>(url);
  }

  getModelCreditCost(model: string): Observable<any> {
    const url = `${this.apiBaseUrl}/credits/cost/${encodeURIComponent(model)}`;
    return this.http.get(url);
  }

  getCurrentUser(): Observable<CurrentUserResponse> {
    const url = `${this.apiBaseUrl}/user/me`;
    return this.http.get<CurrentUserResponse>(url);
  }

  // PayPal payment endpoints
  getCreditPackages(): Observable<CreditPackagesResponse> {
    const url = `${this.apiBaseUrl}/credit-packages`;
    return this.http.get<CreditPackagesResponse>(url);
  }

  createPayPalOrder(packageId: string): Observable<PayPalOrderResponse> {
    const url = `${this.apiBaseUrl}/paypal/create-order`;
    return this.http.post<PayPalOrderResponse>(url, { package_id: packageId });
  }

  capturePayPalOrder(orderId: string): Observable<PayPalCaptureResponse> {
    const url = `${this.apiBaseUrl}/paypal/capture-order`;
    return this.http.post<PayPalCaptureResponse>(url, { order_id: orderId });
  }

  //#region Lora API calls
  getLoras(status: string = 'active'): Observable<any> {
    const url = `${this.apiBaseUrl}/get_loras/?status=${encodeURIComponent(status)}`;  // default to active
    return this.http.get(url);
  }

  getLoraPreferences(): Observable<any> {
    const url = `${this.apiBaseUrl}/lora/preferences`;
    return this.http.get(url);
  }

  syncLoraPreferences(data: { preferences: Array<{ version_id: number; is_favorite?: boolean; last_used_at?: string }> }): Observable<any> {
    const url = `${this.apiBaseUrl}/lora/preferences`;
    return this.http.post(url, data);
  }

  getRegionalPromptPresets(): Observable<RegionalPromptPreset[]> {
    const url = `${this.apiBaseUrl}/regional-presets`;
    return this.http.get<RegionalPromptPreset[]>(url);
  }

  syncRegionalPromptPresets(data: { presets: RegionalPromptPreset[] }): Observable<{ success: boolean; synced_count: number }> {
    const url = `${this.apiBaseUrl}/regional-presets`;
    return this.http.post<{ success: boolean; synced_count: number }>(url, data);
  }

  getLoraSuggestions(status: string = 'pending'): Observable<any> {
    const url = `${this.apiBaseUrl}/get_lora_suggestions/?status=${encodeURIComponent(status)}`;
    return this.http.get(url);
  }

  getMyLoraSuggestions(status: string = 'pending'): Observable<any> {
    const url = `${this.apiBaseUrl}/get_my_lora_suggestions/?status=${encodeURIComponent(status)}`;
    return this.http.get(url);
  }

  // Admin endpoints
  updateLora(loraId: number, data: { is_active?: boolean; is_nsfw?: boolean; name?: string; trigger_words?: string[] }): Observable<any> {
    const url = `${this.apiBaseUrl}/admin/lora/${loraId}`;
    return this.http.patch(url, data);
  }

  uploadLoraImage(loraId: number, file: File): Observable<any> {
    const url = `${this.apiBaseUrl}/admin/lora/${loraId}/image`;
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post(url, formData);
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

  cancelLoraSuggestion(suggestionId: number): Observable<any> {
    const url = `${this.apiBaseUrl}/cancel_lora_suggestion/${encodeURIComponent(String(suggestionId))}/`;
    return this.http.post(url, {});
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
