import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from 'src/environments/environment';
import { AuthInterceptor, sessionInvalid$ } from './auth/auth.interceptor';

import { StableDiffusionService } from './stable-diffusion.service';

describe('StableDiffusionService', () => {
  let service: StableDiffusionService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('authToken', 'test-session-token');
    localStorage.setItem('userData', JSON.stringify({ token: 'test-session-token' }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      ],
    });
    service = TestBed.inject(StableDiffusionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loads the public catalog without preflight-triggering headers even when signed in', () => {
    const catalog = { default_model: 'test-model', models: [] };
    const received = jasmine.createSpy('received');
    service.getGenerationModels().subscribe(received);
    const request = http.expectOne(`${environment.apiBaseUrl}/models`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.keys()).toEqual([]);
    expect(request.request.withCredentials).toBeFalse();
    request.flush(catalog);
    expect(received).toHaveBeenCalledWith(catalog);
    expect(localStorage.getItem('authToken')).toBe('test-session-token');
  });

  it('still authenticates protected requests and invalidates expired sessions', () => {
    const invalidated = jasmine.createSpy('invalidated');
    const subscription = sessionInvalid$.subscribe(invalidated);
    try {
      service.getCurrentUser().subscribe({ error: () => {} });
      const request = http.expectOne(`${environment.apiBaseUrl}/user/me`);
      expect(request.request.headers.get('Authorization')).toBe('Bearer test-session-token');
      request.flush({}, { status: 401, statusText: 'Unauthorized' });
      expect(invalidated).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('authToken')).toBeNull();
      expect(localStorage.getItem('userData')).toBeNull();
    } finally {
      subscription.unsubscribe();
    }
  });

  it('does not discard the session when a public catalog request fails', () => {
    service.getGenerationModels().subscribe({ error: () => {} });
    const request = http.expectOne(`${environment.apiBaseUrl}/models`);
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(localStorage.getItem('authToken')).toBe('test-session-token');
    expect(localStorage.getItem('userData')).not.toBeNull();
  });
  for (const [name, path, call] of [
    ['credit packages', '/credit-packages', () => service.getCreditPackages()],
    ['credit costs', '/credits/costs', () => service.getCreditCosts()],
    ['model credit cost', '/credits/cost/novaMobianXL_v20', () => service.getModelCreditCost('novaMobianXL_v20')],
    ['LoRA search', '/search_civitAi_loras_by_query/Sonic?show_nsfw=false', () => service.searchByQuery('Sonic')],
    ['LoRA ID lookup', '/search_civitAi_loras_by_id/123?show_nsfw=false', () => service.searchByID('123')],
    ['LoRA creator lookup', '/search_civitAi_loras_by_user/creator?show_nsfw=false', () => service.searchByUser('creator')],
  ] as Array<[string, string, () => any]>) {
    it('omits authentication for public ' + name, () => {
      call().subscribe();
      const request = http.expectOne(environment.apiBaseUrl + path);
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({});
    });
  }

  it('keeps package requests fresh and authenticates both checkout steps with their exact payloads', () => {
    for (const price of [5, 6]) {
      const received = jasmine.createSpy();
      service.getCreditPackages().subscribe(received);
      const request = http.expectOne(environment.apiBaseUrl + '/credit-packages');
      expect(request.request.headers.has('Authorization')).toBeFalse();
      const response = { packages: [{ id: 'starter', price_usd: price, credits: 1500 }] };
      request.flush(response);
      expect(received).toHaveBeenCalledWith(response);
    }
    service.createPayPalOrder('starter').subscribe();
    const create = http.expectOne(environment.apiBaseUrl + '/paypal/create-order');
    expect(create.request.headers.get('Authorization')).toBe('Bearer test-session-token');
    expect(create.request.body).toEqual({ package_id: 'starter' });
    create.flush({ order_id: 'TEST-ORDER' });
    service.capturePayPalOrder('TEST-ORDER').subscribe();
    const capture = http.expectOne(environment.apiBaseUrl + '/paypal/capture-order');
    expect(capture.request.headers.get('Authorization')).toBe('Bearer test-session-token');
    expect(capture.request.body).toEqual({ order_id: 'TEST-ORDER' });
    capture.flush({ credits_added: 1500, new_balance: 1600 });
  });

  for (const call of [
    () => service.getDynamicPromptLibrary(), () => service.getLoraPreferences(),
    () => service.getUserCredits(), () => service.getRegionalPromptPresets(),
  ]) {
    it('retains authentication for personalized data', () => {
      call().subscribe();
      const request = http.expectOne(() => true);
      expect(request.request.headers.get('Authorization')).toBe('Bearer test-session-token');
      request.flush({});
    });
  }

  it('returns image blobs unchanged without adding authentication', () => {
    const blob = new Blob(['image'], { type: 'image/png' });
    const received = jasmine.createSpy();
    service.getJobImage('test-job', 2).subscribe(received);
    const request = http.expectOne(environment.apiBaseUrl + '/get_job_image/test-job/2');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    expect(request.request.responseType).toBe('blob');
    request.flush(blob);
    expect(received).toHaveBeenCalledWith(blob);
  });

  it('deduplicates LoRA reads and isolates cached rows from component mutations', () => {
    let first: any, second: any, cached: any;
    service.getLoras().subscribe(value => first = value);
    service.getLoras().subscribe(value => second = value);
    const request = http.expectOne(environment.apiBaseUrl + '/get_loras/?status=active&fields=summary');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush([{ id: 1, trigger_words: ['original'] }]);
    first[0].trigger_words.push('local preference');
    service.getLoras().subscribe(value => cached = value);
    http.expectNone(() => true);
    expect(second[0].trigger_words).toEqual(['original']);
    expect(cached[0].trigger_words).toEqual(['original']);
  });

  it('expires catalogs after 60 seconds', () => {
    const now = spyOn(Date, 'now').and.returnValue(1000);
    service.getLoras().subscribe();
    http.expectOne(() => true).flush([]);
    now.and.returnValue(60999);
    service.getLoras().subscribe();
    http.expectNone(() => true);
    now.and.returnValue(61000);
    service.getLoras().subscribe();
    http.expectOne(() => true).flush([]);
  });

  it('fetches fresh suggestion statuses on every call without authentication', () => {
    for (const pending of [[1], []]) {
      const received = jasmine.createSpy();
      service.getAllSuggestionStatuses().subscribe(received);
      const request = http.expectOne(environment.apiBaseUrl + '/get_all_suggestion_statuses/');
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({ pending });
      expect(received).toHaveBeenCalledWith({ pending });
    }
  });

  it('does not cache failures and always fetches full admin catalogs', () => {
    service.getLoras().subscribe({ error: () => {} });
    http.expectOne(() => true).flush({}, { status: 503, statusText: 'Unavailable' });
    service.getLoras().subscribe();
    http.expectOne(() => true).flush([]);
    service.getLoras('all', 'full').subscribe();
    service.getLoras('all', 'full').subscribe();
    const requests = http.match(request => request.url.includes('fields=full'));
    expect(requests.length).toBe(2);
    requests.forEach(request => request.flush([]));
  });

  it('invalidates catalogs after a successful authenticated LoRA mutation', () => {
    service.getLoras().subscribe(); http.expectOne(() => true).flush([]);
    service.updateLora(1, { name: 'Updated' }).subscribe();
    const mutation = http.expectOne(environment.apiBaseUrl + '/admin/lora/1');
    expect(mutation.request.headers.get('Authorization')).toBe('Bearer test-session-token');
    mutation.flush({});
    service.getLoras().subscribe(); http.expectOne(() => true).flush([]);
  });

  it('does not let an old in-flight response replace a cache invalidated by an edit', () => {
    service.getLoras().subscribe();
    const old = http.expectOne(() => true);
    service.cancelLoraSuggestion(1).subscribe();
    http.expectOne(() => true).flush({});
    service.getLoras().subscribe();
    http.expectOne(() => true).flush([{ name: 'fresh' }]);
    old.flush([{ name: 'old' }]);
    let result: any;
    service.getLoras().subscribe(value => result = value);
    expect(result).toEqual([{ name: 'fresh' }]);
    http.expectNone(() => true);
  });

});
