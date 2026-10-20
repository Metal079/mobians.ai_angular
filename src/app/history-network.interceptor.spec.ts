import { HttpClient, HTTP_INTERCEPTORS, HttpErrorResponse, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { environment } from '../environments/environment';
import { HistoryNetworkInterceptor } from './history-network.interceptor';
import { historyHttpContext } from './history-http-context';

describe('HistoryNetworkInterceptor', () => {
  let http: HttpClient;
  let requests: HttpTestingController;
  const url = `${environment.apiBaseUrl}/history/sync/status`;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
      { provide: HTTP_INTERCEPTORS, useClass: HistoryNetworkInterceptor, multi: true }] });
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
  });
  afterEach(() => requests.verify());

  it('bypasses the worker and retries a transient read once with a new correlation ID', fakeAsync(() => {
    let result: unknown;
    http.get(url).subscribe(value => result = value);
    const first = requests.expectOne(url);
    expect(first.request.headers.get('ngsw-bypass')).toBe('1');
    const id = first.request.headers.get('X-Request-ID');
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    first.flush(null, { status: 504, statusText: 'Gateway Timeout' });
    tick(500);
    const second = requests.expectOne(url);
    expect(second.request.headers.get('X-Request-ID')).not.toBe(id);
    second.flush({ images_in_cloud: 10 });
    expect(result).toEqual({ images_in_cloud: 10 });
  }));

  it('distinguishes API errors using exposed request IDs and never retains payloads', fakeAsync(() => {
    let failure: unknown;
    http.get(url).subscribe({ error: error => failure = error });
    requests.expectOne(url).flush({ private: 'prompt' }, { status: 504, statusText: 'Timeout' });
    tick(500);
    requests.expectOne(url).flush({ private: 'prompt' }, { status: 504, statusText: 'Timeout', headers: { 'X-Request-ID': 'server-request-123' } });
    expect(historyHttpContext(failure)).toEqual(jasmine.objectContaining({ requestId: 'server-request-123', responseSource: 'api', retryCount: 1, serviceWorkerBypassed: true, httpStatus: 504 }));
    expect(JSON.stringify(historyHttpContext(failure))).not.toContain('prompt');
  }));

  it('records actual browser network failures and does not retry mutations', fakeAsync(() => {
    let failure: HttpErrorResponse | undefined;
    const mutation = `${environment.apiBaseUrl}/history/sync/image`;
    http.post(mutation, { prompt: 'private prompt' }).subscribe({ error: error => failure = error });
    requests.expectOne(mutation).error(new ProgressEvent('error'));
    tick(1000);
    requests.expectNone(mutation);
    expect(historyHttpContext(failure)).toEqual(jasmine.objectContaining({ responseSource: 'network', retryCount: 0, requestMethod: 'POST' }));
  }));

  it('does not retry auth or size-limit rejections', fakeAsync(() => {
    for (const status of [401, 413]) {
      let error: unknown;
      http.get(url).subscribe({ error: value => error = value });
      requests.expectOne(url).flush({}, { status, statusText: 'Rejected' });
      tick(1000);
      expect(historyHttpContext(error)['retryCount']).toBe(0);
    }
  }));

  it('bounds stalled reads instead of leaving sync pending indefinitely', fakeAsync(() => {
    let failure: any;
    http.get(url).subscribe({ error: error => failure = error });
    const first = requests.expectOne(url);
    tick(15001);
    expect(first.cancelled).toBeTrue();
    tick(500);
    const second = requests.expectOne(url);
    tick(15001);
    expect(second.cancelled).toBeTrue();
    expect(failure.name).toBe('TimeoutError');
    expect(historyHttpContext(failure)['retryCount']).toBe(1);
  }));

  it('does not change unrelated or third-party requests', () => {
    for (const other of [`${environment.apiBaseUrl}/models`, 'https://elsewhere.test/history/sync/status']) {
      http.get(other).subscribe();
      const request = requests.expectOne(other);
      expect(request.request.headers.has('ngsw-bypass')).toBeFalse();
      request.flush({});
    }
  });
});
