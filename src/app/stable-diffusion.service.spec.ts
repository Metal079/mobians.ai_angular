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
});
