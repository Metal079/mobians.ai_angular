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

export interface LoraSuggestionCooldown {
  last_updated_date?: string | null;
  rerequest_available_at?: string | null;
  cooldown_seconds_remaining?: number;
}

export interface LoraSuggestionStatuses {
  rejected: number[];
  approved: number[];
  pending: number[];
  downloading: number[];
  rejected_cooldowns?: Record<string, LoraSuggestionCooldown>;
}

export interface SubmitJobResponse {
  job_id: string;
  prompt_template?: string;
  expanded_prompt?: string;
  credits_used?: number;
  credits_remaining?: number;
}

export type DynamicPromptMode = 'random' | 'combinatorial';

export interface DynamicPromptCategory {
  id: string;
  label: string;
  token: string;
  description: string;
  examples: string[];
}

export interface DynamicPromptStarterTemplate {
  id: string;
  name: string;
  description: string;
  token?: string;
  template: string;
}

export interface DynamicPromptSyntaxExample {
  label: string;
  template: string;
}

export interface DynamicPromptLibraryResponse {
  wildcard_set: string;
  categories: DynamicPromptCategory[];
  starter_templates: DynamicPromptStarterTemplate[];
  syntax_examples: DynamicPromptSyntaxExample[];
  defaults: {
    mode?: DynamicPromptMode;
    preview_count: number;
    max_generations?: number;
  };
}

export interface DynamicPromptPreviewRequest {
  template: string;
  mode?: DynamicPromptMode;
  seed?: number;
  preview_count?: number;
  max_generations?: number;
}

export interface DynamicPromptPreviewResponse {
  template: string;
  previews: string[];
  seed: number;
  mode: DynamicPromptMode;
  wildcard_set: string;
}

export interface DynamicPromptAdminItem {
  value: string;
  display_order: number;
  is_active: boolean;
}

export interface DynamicPromptAdminCategory extends DynamicPromptCategory {
  items: DynamicPromptAdminItem[];
  display_order: number;
  is_active: boolean;
}

export interface DynamicPromptAdminStarterTemplate extends DynamicPromptStarterTemplate {
  display_order: number;
  is_active: boolean;
}

export interface DynamicPromptAdminLibraryResponse {
  wildcard_set: string;
  categories: DynamicPromptAdminCategory[];
  starter_templates: DynamicPromptAdminStarterTemplate[];
}

export interface DynamicPromptAdminLibraryUpdate {
  categories: Array<{
    id: string;
    label: string;
    description?: string;
    token?: string;
    display_order?: number;
    is_active?: boolean;
    entries: string[];
  }>;
  starter_templates: Array<{
    id: string;
    name: string;
    description?: string;
    token?: string;
    template: string;
    display_order?: number;
    is_active?: boolean;
  }>;
}

export type DynamicPromptTemplateStatus = 'private' | 'pending' | 'approved' | 'rejected' | 'hidden';
export type DynamicPromptTemplateSort = 'new' | 'top' | 'popular';

export interface DynamicPromptCommunityTemplate {
  id: string;
  user_id: string;
  title: string;
  description: string;
  template: string;
  token?: string;
  tags: string[];
  status: DynamicPromptTemplateStatus;
  rejection_reason?: string | null;
  source_template_id?: string | null;
  source_snapshot_updated_at?: string | null;
  upvote_count: number;
  import_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  hidden_at?: string | null;
  author_display_name: string;
  source_author_display_name?: string | null;
  has_upvoted: boolean;
  has_imported: boolean;
  owned_template_id?: string | null;
  preview_samples?: string[];
  preview_error?: string;
}

export interface DynamicPromptCommunityTemplatePayload {
  title: string;
  description?: string;
  template: string;
  tags?: string[];
}

export interface DynamicPromptCommunityTemplateUpdate {
  title?: string;
  description?: string;
  template?: string;
  tags?: string[];
}

export interface DynamicPromptTemplateListResponse {
  templates: DynamicPromptCommunityTemplate[];
  page?: number;
  page_size?: number;
  sort?: DynamicPromptTemplateSort;
  status?: DynamicPromptTemplateStatus | 'all';
}

export interface DynamicPromptVoteReward {
  creator_credits_awarded: number;
  voter_credits_awarded: number;
  voter_balance_after?: number | null;
  voter_reward_skipped_reason?: string | null;
}

export interface DynamicPromptTemplateResponse {
  template: DynamicPromptCommunityTemplate;
  preview_samples?: string[];
  vote_reward?: DynamicPromptVoteReward | null;
}

export interface DynamicPromptTemplateListFilters {
  search?: string;
  tags?: string[];
  sort?: DynamicPromptTemplateSort;
  page?: number;
  page_size?: number;
}

export type DynamicPromptCustomCategoryStatus = 'private' | 'public' | 'hidden';
export type DynamicPromptCustomCategorySort = 'new' | 'top' | 'popular';

export interface DynamicPromptCustomCategory {
  id: string;
  user_id: string;
  title: string;
  description: string;
  token: string;
  tags: string[];
  status: DynamicPromptCustomCategoryStatus;
  source_category_id?: string | null;
  source_snapshot_updated_at?: string | null;
  upvote_count: number;
  import_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  author_display_name: string;
  has_upvoted: boolean;
  has_imported: boolean;
  owned_category_id?: string | null;
  entries: string[];
  examples: string[];
  item_count: number;
}

export interface DynamicPromptCustomCategoryPayload {
  title: string;
  description?: string;
  entries: string[];
  tags?: string[];
}

export interface DynamicPromptCustomCategoryListResponse {
  categories: DynamicPromptCustomCategory[];
  page?: number;
  page_size?: number;
  sort?: DynamicPromptCustomCategorySort;
  status?: DynamicPromptCustomCategoryStatus | 'all';
}

export interface DynamicPromptCustomCategoryResponse {
  category: DynamicPromptCustomCategory;
  vote_reward?: DynamicPromptVoteReward | null;
}

export interface DynamicPromptCustomCategoryListFilters {
  search?: string;
  tags?: string[];
  sort?: DynamicPromptCustomCategorySort;
  page?: number;
  page_size?: number;
}

export type AdminDynamicPromptCategoryStatus = 'public' | 'hidden' | 'all';

export interface JobStatusResponse {
  status?: 'pending' | 'completed' | 'failed' | 'error' | 'cancelled';
  queue_position?: number;
  eta?: number;
  result?: string[];
  prompt?: string;
  prompt_template?: string;
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

  getDynamicPromptLibrary(): Observable<DynamicPromptLibraryResponse> {
    const url = `${this.apiBaseUrl}/dynamic-prompts/library`;
    return this.http.get<DynamicPromptLibraryResponse>(url);
  }

  previewDynamicPrompt(data: DynamicPromptPreviewRequest): Observable<DynamicPromptPreviewResponse> {
    const url = `${this.apiBaseUrl}/dynamic-prompts/preview`;
    return this.http.post<DynamicPromptPreviewResponse>(url, data);
  }

  getUserDynamicPromptTemplates(status: DynamicPromptTemplateStatus | 'all' = 'all'): Observable<DynamicPromptTemplateListResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/templates?status=${encodeURIComponent(status)}`;
    return this.http.get<DynamicPromptTemplateListResponse>(url);
  }

  createUserDynamicPromptTemplate(data: DynamicPromptCommunityTemplatePayload): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/templates`;
    return this.http.post<DynamicPromptTemplateResponse>(url, data);
  }

  updateUserDynamicPromptTemplate(templateId: string, data: DynamicPromptCommunityTemplateUpdate): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/templates/${encodeURIComponent(templateId)}`;
    return this.http.put<DynamicPromptTemplateResponse>(url, data);
  }

  deleteUserDynamicPromptTemplate(templateId: string): Observable<{ success: boolean }> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/templates/${encodeURIComponent(templateId)}`;
    return this.http.delete<{ success: boolean }>(url);
  }

  shareUserDynamicPromptTemplate(templateId: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/templates/${encodeURIComponent(templateId)}/share`;
    return this.http.post<DynamicPromptTemplateResponse>(url, {});
  }

  unshareUserDynamicPromptTemplate(templateId: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/templates/${encodeURIComponent(templateId)}/unshare`;
    return this.http.post<DynamicPromptTemplateResponse>(url, {});
  }

  listDynamicPromptTemplates(filters: DynamicPromptTemplateListFilters = {}): Observable<DynamicPromptTemplateListResponse> {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.page_size) params.set('page_size', String(filters.page_size));
    for (const tag of filters.tags || []) {
      params.append('tags', tag);
    }
    const query = params.toString();
    const url = `${this.apiBaseUrl}/dynamic-prompts/templates${query ? `?${query}` : ''}`;
    return this.http.get<DynamicPromptTemplateListResponse>(url);
  }

  getDynamicPromptTemplate(templateId: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/dynamic-prompts/templates/${encodeURIComponent(templateId)}`;
    return this.http.get<DynamicPromptTemplateResponse>(url);
  }

  upvoteDynamicPromptTemplate(templateId: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/dynamic-prompts/templates/${encodeURIComponent(templateId)}/upvote`;
    return this.http.post<DynamicPromptTemplateResponse>(url, {});
  }

  removeDynamicPromptTemplateUpvote(templateId: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/dynamic-prompts/templates/${encodeURIComponent(templateId)}/upvote`;
    return this.http.delete<DynamicPromptTemplateResponse>(url);
  }

  importDynamicPromptTemplate(templateId: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/dynamic-prompts/templates/${encodeURIComponent(templateId)}/import`;
    return this.http.post<DynamicPromptTemplateResponse>(url, {});
  }

  getUserDynamicPromptCategories(status: DynamicPromptCustomCategoryStatus | 'all' = 'all'): Observable<DynamicPromptCustomCategoryListResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/categories?status=${encodeURIComponent(status)}`;
    return this.http.get<DynamicPromptCustomCategoryListResponse>(url);
  }

  createUserDynamicPromptCategory(data: DynamicPromptCustomCategoryPayload): Observable<DynamicPromptCustomCategoryResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/categories`;
    return this.http.post<DynamicPromptCustomCategoryResponse>(url, data);
  }

  updateUserDynamicPromptCategory(categoryId: string, data: DynamicPromptCustomCategoryPayload): Observable<DynamicPromptCustomCategoryResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/categories/${encodeURIComponent(categoryId)}`;
    return this.http.put<DynamicPromptCustomCategoryResponse>(url, data);
  }

  deleteUserDynamicPromptCategory(categoryId: string): Observable<{ success: boolean }> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/categories/${encodeURIComponent(categoryId)}`;
    return this.http.delete<{ success: boolean }>(url);
  }

  shareUserDynamicPromptCategory(categoryId: string): Observable<DynamicPromptCustomCategoryResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/categories/${encodeURIComponent(categoryId)}/share`;
    return this.http.post<DynamicPromptCustomCategoryResponse>(url, {});
  }

  unshareUserDynamicPromptCategory(categoryId: string): Observable<DynamicPromptCustomCategoryResponse> {
    const url = `${this.apiBaseUrl}/user/dynamic-prompts/categories/${encodeURIComponent(categoryId)}/unshare`;
    return this.http.post<DynamicPromptCustomCategoryResponse>(url, {});
  }

  listDynamicPromptCategories(filters: DynamicPromptCustomCategoryListFilters = {}): Observable<DynamicPromptCustomCategoryListResponse> {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.page_size) params.set('page_size', String(filters.page_size));
    for (const tag of filters.tags || []) {
      params.append('tags', tag);
    }
    const query = params.toString();
    const url = `${this.apiBaseUrl}/dynamic-prompts/categories${query ? `?${query}` : ''}`;
    return this.http.get<DynamicPromptCustomCategoryListResponse>(url);
  }

  upvoteDynamicPromptCategory(categoryId: string): Observable<DynamicPromptCustomCategoryResponse> {
    const url = `${this.apiBaseUrl}/dynamic-prompts/categories/${encodeURIComponent(categoryId)}/upvote`;
    return this.http.post<DynamicPromptCustomCategoryResponse>(url, {});
  }

  removeDynamicPromptCategoryUpvote(categoryId: string): Observable<DynamicPromptCustomCategoryResponse> {
    const url = `${this.apiBaseUrl}/dynamic-prompts/categories/${encodeURIComponent(categoryId)}/upvote`;
    return this.http.delete<DynamicPromptCustomCategoryResponse>(url);
  }

  importDynamicPromptCategory(categoryId: string): Observable<DynamicPromptCustomCategoryResponse> {
    const url = `${this.apiBaseUrl}/dynamic-prompts/categories/${encodeURIComponent(categoryId)}/import`;
    return this.http.post<DynamicPromptCustomCategoryResponse>(url, {});
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

  getAllSuggestionStatuses(): Observable<LoraSuggestionStatuses> {
    const url = `${this.apiBaseUrl}/get_all_suggestion_statuses/`;
    return this.http.get<LoraSuggestionStatuses>(url);
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

  getAdminDynamicPromptLibrary(): Observable<DynamicPromptAdminLibraryResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/library`;
    return this.http.get<DynamicPromptAdminLibraryResponse>(url);
  }

  updateAdminDynamicPromptLibrary(data: DynamicPromptAdminLibraryUpdate): Observable<DynamicPromptAdminLibraryResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/library`;
    return this.http.put<DynamicPromptAdminLibraryResponse>(url, data);
  }

  getAdminDynamicPromptTemplates(status: DynamicPromptTemplateStatus | 'all' = 'approved'): Observable<DynamicPromptTemplateListResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/templates?status=${encodeURIComponent(status)}`;
    return this.http.get<DynamicPromptTemplateListResponse>(url);
  }

  approveAdminDynamicPromptTemplate(templateId: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/templates/${encodeURIComponent(templateId)}/approve`;
    return this.http.post<DynamicPromptTemplateResponse>(url, {});
  }

  rejectAdminDynamicPromptTemplate(templateId: string, reason: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/templates/${encodeURIComponent(templateId)}/reject`;
    return this.http.post<DynamicPromptTemplateResponse>(url, { reason });
  }

  hideAdminDynamicPromptTemplate(templateId: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/templates/${encodeURIComponent(templateId)}/hide`;
    return this.http.post<DynamicPromptTemplateResponse>(url, {});
  }

  restoreAdminDynamicPromptTemplate(templateId: string): Observable<DynamicPromptTemplateResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/templates/${encodeURIComponent(templateId)}/restore`;
    return this.http.post<DynamicPromptTemplateResponse>(url, {});
  }

  getAdminDynamicPromptCategories(status: AdminDynamicPromptCategoryStatus = 'public'): Observable<DynamicPromptCustomCategoryListResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/categories?status=${encodeURIComponent(status)}`;
    return this.http.get<DynamicPromptCustomCategoryListResponse>(url);
  }

  hideAdminDynamicPromptCategory(categoryId: string): Observable<DynamicPromptCustomCategoryResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/categories/${encodeURIComponent(categoryId)}/hide`;
    return this.http.post<DynamicPromptCustomCategoryResponse>(url, {});
  }

  restoreAdminDynamicPromptCategory(categoryId: string): Observable<DynamicPromptCustomCategoryResponse> {
    const url = `${this.apiBaseUrl}/admin/dynamic-prompts/categories/${encodeURIComponent(categoryId)}/restore`;
    return this.http.post<DynamicPromptCustomCategoryResponse>(url, {});
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

  getJobStatus(jobId: string): Observable<JobStatusResponse> {
    const url = `${this.apiBaseUrl}/get_job_status/`;  // note the trailing slash
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify({ job_id: jobId });
    return this.http.post<JobStatusResponse>(url, body, {'headers':headers});
  }

  getJobImage(jobId: string, imageIndex: number): Observable<Blob> {
    const url = `${this.apiBaseUrl}/get_job_image/${encodeURIComponent(jobId)}/${imageIndex}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  cancelJob(jobId: string): Observable<any> {
    const url = `${this.apiBaseUrl}/cancel_job/${encodeURIComponent(jobId)}/`;
    return this.http.delete(url);
  }

  // April Fools - Ring Collection
  submitRings(rings: number): Observable<{ status: string; total_rings: number }> {
    return this.http.post<{ status: string; total_rings: number }>(
      `${this.apiBaseUrl}/april-fools/rings`,
      { rings }
    );
  }

  getRingLeaderboard(): Observable<{
    leaderboard: Array<{ rank: number; display_name: string; rings: number }>;
    viewer: {
      display_name: string;
      rings: number;
      rank: number | null;
      points_to_top_ten: number;
      top_ten_cutoff: number | null;
    } | null;
  }> {
    return this.http.get<{
      leaderboard: Array<{ rank: number; display_name: string; rings: number }>;
      viewer: {
        display_name: string;
        rings: number;
        rank: number | null;
        points_to_top_ten: number;
        top_ten_cutoff: number | null;
      } | null;
    }>(
      `${this.apiBaseUrl}/april-fools/ring-leaderboard`
    );
  }
}
