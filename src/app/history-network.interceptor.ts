import { Injectable } from '@angular/core';
import { HttpErrorResponse, HttpEvent, HttpEventType, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { NEVER, Observable, catchError, defer, distinctUntilChanged, finalize, fromEvent, map, merge, retry, startWith, switchMap, takeWhile, throwError, timeout, timer } from 'rxjs';
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
      let retries = 0;
      let requestId = '';
      let backgroundedDuringRequest = false;
      let offlineDuringRequest = false;
      const activity = merge(fromEvent(document, 'visibilitychange'), fromEvent(window, 'online'), fromEvent(window, 'offline')).pipe(
        startWith(null),
        map(() => {
          const visible = document.visibilityState !== 'hidden';
          backgroundedDuringRequest ||= !visible;
          offlineDuringRequest ||= !navigator.onLine;
          return visible && navigator.onLine;
        }),
        distinctUntilChanged(),
      );
      const request = defer(() => {
        requestId = this.newRequestId();
        // API calls are never cached. Bypass Angular SW's synthetic network-error 504s.
        return next.handle(req.clone({ setHeaders: { 'ngsw-bypass': '1', 'X-Request-ID': requestId } }));
      }).pipe(
        timeout(deadline),
        retry({ count: 1, delay: error => {
          if (readOnly && (error?.name === 'TimeoutError' || [0, 502, 503, 504].includes(error?.status))) {
            retries++;
            return timer(500);
          }
          return throwError(() => error);
        } }),
      );
      // Safe reads can be cancelled while suspended and restarted on return.
      // Writes keep their original request: a lost response may already be committed.
      const activitySubscription = readOnly ? undefined : activity.subscribe();
      const execution = readOnly ? activity.pipe(
        switchMap(active => active ? request : NEVER),
        takeWhile(event => event.type !== HttpEventType.Response, true),
      ) : request;
      return execution.pipe(
        catchError(error => {
          const serverId = error instanceof HttpErrorResponse ? error.headers.get('X-Request-ID') : null;
          rememberHistoryHttpContext(error, {
            requestId: serverId || requestId, requestDurationMs: Math.round(performance.now() - started),
            retryCount: retries, requestMethod: req.method, serviceWorkerBypassed: true,
            backgroundedDuringRequest, offlineDuringRequest,
            responseSource: serverId ? 'api' : error?.status === 0 || error?.name === 'TimeoutError' ? 'network' : 'gateway-or-network',
            httpStatus: error?.status,
            ...(url.pathname.endsWith('/sync/images') ? { includeBlobs: url.searchParams.get('include_blobs') === 'true' || req.params.get('include_blobs') === 'true' } : {}),
          });
          return throwError(() => error);
        }),
        finalize(() => activitySubscription?.unsubscribe()),
      );
    });
  }

  private newRequestId(): string {
    try { return crypto.randomUUID(); } catch { return Date.now().toString(16) + Math.random().toString(16).slice(2, 14); }
  }
}
