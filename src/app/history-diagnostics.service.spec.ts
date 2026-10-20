import { HttpBackend, HttpRequest, HttpResponse } from '@angular/common/http';
import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HistoryDiagnosticsService } from './history-diagnostics.service';
import { sessionInvalid$ } from './auth/auth.interceptor';

describe('HistoryDiagnosticsService', () => {
  let service: HistoryDiagnosticsService;
  let backend: jasmine.SpyObj<HttpBackend>;
  let originalToken: string | null;

  beforeEach(() => {
    originalToken = localStorage.getItem('authToken');
    localStorage.setItem('authToken', 'diagnostic-test-token');
    backend = jasmine.createSpyObj<HttpBackend>('HttpBackend', ['handle']);
    backend.handle.and.returnValue(of(new HttpResponse({ status: 202 })));
    service = new HistoryDiagnosticsService(backend);
    spyOn(console, 'warn');
    spyOn<any>(service, 'storageState').and.returnValue(Promise.resolve({ usage: 1024, quota: 4096, persisted: false }));
  });

  afterEach(() => {
    if (originalToken === null) localStorage.removeItem('authToken');
    else localStorage.setItem('authToken', originalToken);
  });

  function request(): HttpRequest<any> { return backend.handle.calls.mostRecent().args[0]; }

  it('captures useful browser and storage metadata without content, raw errors or credentials', fakeAsync(() => {
    service.report('history.save', new DOMException('private prompt https://host/?token=secret', 'QuotaExceededError'), {
      dbState: 'open', imageCount: 4, savedCount: 0, prompt: 'private prompt', image: 'data:image/png;base64,secret', authToken: 'secret',
    });
    flushMicrotasks();
    const req = request();
    expect(req.url).toMatch(/\/history\/diagnostics$/);
    expect(req.headers.get('Authorization')).toBe('Bearer diagnostic-test-token');
    expect(req.body.context).toEqual({ imageCount: 4, savedCount: 0, dbState: 'open' });
    expect(req.body.error).toEqual({ name: 'QuotaExceededError', message: 'Browser storage quota exceeded.' });
    expect(req.body.storage).toEqual({ usage: 1024, quota: 4096, persisted: false });
    expect(req.body.browser.userAgent).toBeTruthy();
    expect(req.body.browser.viewportWidth).toBeGreaterThan(0);
    expect(JSON.stringify(req.body)).not.toContain('private prompt');
    expect(JSON.stringify(req.body)).not.toContain('secret');
    expect(JSON.stringify(req.body)).not.toContain('diagnostic-test-token');
  }));

  it('uses underlying DOMException cause and drops invalid context', fakeAsync(() => {
    service.report('db.write', { name: 'Error', message: 'private', cause: new DOMException('private', 'InvalidStateError') }, {
      dbState: 'private', imageCount: -1, attempt: NaN, savedCount: true, httpStatus: 503,
    });
    flushMicrotasks();
    expect(request().body.error.name).toBe('InvalidStateError');
    expect(request().body.context).toEqual({ httpStatus: 503 });
  }));

  it('deduplicates repeated failures for a minute and caps the page session at twenty', fakeAsync(() => {
    service.report('db.write', new Error('private'));
    service.report('db.write', new Error('private again'));
    flushMicrotasks();
    expect(backend.handle).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 30; i++) {
      tick(60001);
      service.report('db.write', new Error('private'));
      flushMicrotasks();
    }
    expect(backend.handle).toHaveBeenCalledTimes(20);
  }));

  it('keeps auth and application state intact when diagnostics are unauthorized or offline', fakeAsync(() => {
    const invalidSession = jasmine.createSpy('session invalid');
    const subscription = sessionInvalid$.subscribe(invalidSession);
    backend.handle.and.returnValue(throwError(() => ({ status: 401 })));
    expect(() => service.report('history.save', new Error('private'))).not.toThrow();
    flushMicrotasks();
    tick(6000);
    expect(localStorage.getItem('authToken')).toBe('diagnostic-test-token');
    expect(invalidSession).not.toHaveBeenCalled();
    expect(backend.handle).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  }));

  it('only emits the sanitized console fallback when signed out', fakeAsync(() => {
    localStorage.removeItem('authToken');
    service.report('history.load', new Error('private prompt'));
    flushMicrotasks();
    expect(backend.handle).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect((console.warn as jasmine.Spy).calls.mostRecent().args[1].storage.quota).toBe(4096);
    expect(JSON.stringify((console.warn as jasmine.Spy).calls.mostRecent().args)).not.toContain('private prompt');
  }));

  it('bounds slow browser storage inspection and handles partial API failures', fakeAsync(() => {
    (service as any).storageState.and.callThrough();
    spyOn(navigator.storage, 'estimate').and.returnValue(new Promise<StorageEstimate>(() => {}));
    spyOn(navigator.storage, 'persisted').and.returnValue(Promise.reject(new Error('unavailable')));
    service.report('history.save', new Error('private'));
    tick(801);
    flushMicrotasks();
    expect(backend.handle).toHaveBeenCalledTimes(1);
    expect(request().body.storage).toEqual({});
  }));

  it('ignores unknown operations and never exposes arbitrary error names', fakeAsync(() => {
    service.report('private prompt', new Error('private'));
    expect(backend.handle).not.toHaveBeenCalled();
    service.report('history.sync', { name: 'private prompt', stack: 'private token' });
    flushMicrotasks();
    expect(request().body.error).toEqual({ name: 'Error', message: 'History operation failed.' });
  }));
});
