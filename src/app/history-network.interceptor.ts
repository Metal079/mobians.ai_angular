import { Injectable } from '@angular/core';
import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, catchError, defer, retry, throwError, timeout, timer } from 'rxjs';
import { environment } from '../environments/environment';
import { rememberHistoryHttpContext } from './history-http-context';

@Injectable()
export class HistoryNetworkInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const base = new URL(environment.apiBaseUrl, location.origin);
    const url = new URL(req.url, location.origin);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/history/')
      || url.pathname.endsWith('/diagnostics')) return next.handle(req);

    const readOnly = req.method === 'GET' || (req.method === 'POST' && url.pathname.endsWith('/images/blobs'));
    const deadline = req.method === 'GET' ? 15000 : 60000;
    return defer(() => {
      const started = performance.now();
      let attempts = 0;
      let requestId = '';
      return defer(() => {
        attempts++;
        requestId = this.newRequestId();
        // API calls are never cached. Bypass Angular SW's synthetic network-error 504s.
        return next.handle(req.clone({ setHeaders: { 'ngsw-bypass': '1', 'X-Request-ID': requestId } }));
      }).pipe(
        timeout(deadline),
        retry({ count: 1, delay: error => readOnly && (error?.name === 'TimeoutError' || [0, 502, 503, 504].includes(error?.status))
          ? timer(500) : throwError(() => error) }),
        catchError(error => {
          const serverId = error instanceof HttpErrorResponse ? error.headers.get('X-Request-ID') : null;
          rememberHistoryHttpContext(error, {
            requestId: serverId || requestId, requestDurationMs: Math.round(performance.now() - started),
            retryCount: attempts - 1, requestMethod: req.method, serviceWorkerBypassed: true,
            responseSource: serverId ? 'api' : error?.status === 0 || error?.name === 'TimeoutError' ? 'network' : 'gateway-or-network',
            httpStatus: error?.status,
            ...(url.pathname.endsWith('/sync/images') ? { includeBlobs: url.searchParams.get('include_blobs') === 'true' || req.params.get('include_blobs') === 'true' } : {}),
          });
          return throwError(() => error);
        }),
      );
    });
  }

  private newRequestId(): string {
    try { return crypto.randomUUID(); } catch { return Date.now().toString(16) + Math.random().toString(16).slice(2, 14); }
  }
}
