import { Injectable } from '@angular/core';
import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { timeout } from 'rxjs';
import { environment } from '../environments/environment';
import { historyHttpContext } from './history-http-context';

const OPERATIONS = new Set([
  'db.open', 'db.read', 'db.write', 'db.reopen', 'db.closed', 'db.versionchange',
  'history.load', 'history.save', 'history.favorite', 'history.sync',
  'history.sync.status', 'history.sync.upload', 'history.sync.metadata',
  'history.sync.blobs', 'history.sync.favorite', 'history.sync.remove',
  'generation.save', 'generation.recover',
]);
const ERROR_MESSAGES: Record<string, string> = {
  QuotaExceededError: 'Browser storage quota exceeded.',
  InvalidStateError: 'Browser database connection is not usable.',
  TransactionInactiveError: 'Browser database transaction is inactive.',
  AbortError: 'Browser database operation was aborted.',
  UnknownError: 'Browser storage operation failed for an unknown reason.',
  NotReadableError: 'Browser storage could not be read.',
  BlockedError: 'Another browser tab is blocking a database upgrade.',
  VersionError: 'Browser database version does not match.',
  NotFoundError: 'Browser database or object store was not found.',
  ConstraintError: 'Browser database record conflicts with an existing record.',
  DataError: 'Browser database record has an invalid key.',
  DataCloneError: 'Browser database could not copy the record.',
  SecurityError: 'Browser storage access was denied.',
  NotAllowedError: 'Browser denied access to this operation.',
  NotSupportedError: 'This browser does not support local image history.',
  TimeoutError: 'Operation timed out.',
  NetworkError: 'Network request failed.',
  HttpErrorResponse: 'History API request failed.',
  Error: 'History operation failed.',
};
const NUMBER_LIMITS: Record<string, number> = {
  dbVersion: 100000, imageCount: 10000000, favoriteCount: 10000000,
  cloudCount: 10000000, unsavedCount: 100000, requestedCount: 100000,
  savedCount: 100000, attempt: 1000, httpStatus: 599,
  requestDurationMs: 600000, retryCount: 10,
};

/** Failure-only metadata. Never read image/prompt values, complete URLs or error stacks. */
@Injectable({ providedIn: 'root' })
export class HistoryDiagnosticsService {
  // Deliberately bypass AuthInterceptor: telemetry rejection must never sign the user out.
  private readonly http: HttpClient;
  private readonly seen = new Map<string, number>();
  private sentCount = 0;
  private readonly sessionId = this.newId();

  constructor(backend: HttpBackend) {
    this.http = new HttpClient(backend);
  }

  /** Best effort and nonblocking: never prevent saving/recovery or recursively report errors. */
  report(operation: string, error: unknown, context: Record<string, unknown> = {}): void {
    try {
      if (!OPERATIONS.has(operation) || this.sentCount >= 20) return;
      const safeError = this.describeError(error);
      const safeContext = this.sanitizeContext({ ...historyHttpContext(error), ...context });
      const key = [operation, safeError.name, safeContext['dbState'], safeContext['httpStatus']].join(':');
      const now = Date.now();
      if (this.seen.has(key) && now - this.seen.get(key)! < 60000) return;
      this.seen.set(key, now);
      this.sentCount++;
      const payload = {
        schemaVersion: 1, eventId: this.newId(), sessionId: this.sessionId,
        operation, error: safeError, context: safeContext,
        browser: this.browserState(), build: this.buildName(),
      };
      let token: string | null = null;
      try { token = localStorage.getItem('authToken'); } catch {}
      void this.storageState().then(storage => {
        const report = { ...payload, storage };
        // This sanitized fallback also works for signed-out users and API failures.
        console.warn('[History diagnostics]', report);
        if (!token) return;
        this.http.post(`${environment.apiBaseUrl}/history/diagnostics`, report, {
          headers: new HttpHeaders({ Authorization: `Bearer ${token}`, 'ngsw-bypass': '1' }),
        }).pipe(timeout(5000)).subscribe({ error: () => { /* Telemetry cannot affect application state. */ } });
      }).catch(() => { /* Browser capability failures must not escape. */ });
    } catch { /* Storage and browser APIs may be unavailable in private/restricted contexts. */ }
  }

  private describeError(error: unknown): { name: string; message: string } {
    let name = 'Error';
    // Wrapped database failures often carry the original DOMException in cause.
    let candidate: any = error;
    for (let depth = 0; depth < 3 && candidate; depth++) {
      if (typeof candidate.name === 'string' && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, candidate.name)) {
        name = candidate.name;
        if (name !== 'Error') break;
      }
      candidate = candidate.cause;
    }
    return { name, message: ERROR_MESSAGES[name] };
  }

  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, maximum] of Object.entries(NUMBER_LIMITS)) {
      const value = context[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum) result[key] = value;
    }
    if (['open', 'closed', 'opening', 'unavailable', 'unknown'].includes(context['dbState'] as string)) result['dbState'] = context['dbState'];
    if (typeof context['syncEnabled'] === 'boolean') result['syncEnabled'] = context['syncEnabled'];
    for (const key of ['serviceWorkerBypassed', 'includeBlobs']) {
      if (typeof context[key] === 'boolean') result[key] = context[key];
    }
    if (typeof context['requestId'] === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(context['requestId'])) result['requestId'] = context['requestId'];
    if (['GET', 'POST', 'PATCH', 'DELETE'].includes(context['requestMethod'] as string)) result['requestMethod'] = context['requestMethod'];
    if (['api', 'network', 'gateway-or-network'].includes(context['responseSource'] as string)) result['responseSource'] = context['responseSource'];
    return result;
  }

  private browserState(): Record<string, unknown> {
    const browser: Record<string, unknown> = {};
    try {
      browser['userAgent'] = this.safeBrowserString(navigator.userAgent, 512);
      browser['platform'] = this.safeBrowserString(navigator.platform, 64);
      browser['language'] = this.safeBrowserString(navigator.language, 32);
      browser['online'] = navigator.onLine;
      browser['visibility'] = document.visibilityState;
      browser['indexedDBAvailable'] = typeof indexedDB !== 'undefined';
      browser['viewportWidth'] = window.innerWidth;
      browser['viewportHeight'] = window.innerHeight;
      browser['hardwareConcurrency'] = navigator.hardwareConcurrency;
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      if (typeof memory === 'number') browser['deviceMemory'] = memory;
      browser['standalone'] = window.matchMedia('(display-mode: standalone)').matches;
      const controller = navigator.serviceWorker?.controller;
      browser['serviceWorkerControlled'] = !!controller;
      browser['serviceWorkerState'] = controller?.state || 'none';
    } catch {}
    try {
      localStorage.getItem('authToken');
      browser['localStorageAvailable'] = true;
    } catch { browser['localStorageAvailable'] = false; }
    return browser;
  }

  private safeBrowserString(value: string, limit: number): string {
    if (/:\/\/|data:|blob:|bearer |token=|@/i.test(value)) return '[redacted]';
    return value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, limit);
  }

  private buildName(): string | undefined {
    try {
      for (const script of Array.from(document.scripts)) {
        const name = new URL(script.src, location.origin).pathname.split('/').pop();
        if (name && /^main(?:[-.][A-Za-z0-9_-]{1,80})?\.js$/.test(name)) return name;
      }
    } catch {}
    return undefined;
  }

  private async storageState(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const inspect = Promise.allSettled([
        navigator.storage?.estimate?.(), navigator.storage?.persisted?.(),
      ]).then(([estimate, persisted]) => {
        if (estimate.status === 'fulfilled' && estimate.value) {
          for (const key of ['usage', 'quota'] as const) {
            const value = estimate.value[key];
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e16) result[key] = value;
          }
        }
        if (persisted.status === 'fulfilled' && typeof persisted.value === 'boolean') result['persisted'] = persisted.value;
      });
      await Promise.race([inspect, new Promise<void>(resolve => { timer = setTimeout(resolve, 800); })]);
    } catch {} finally { if (timer !== undefined) clearTimeout(timer); }
    return { ...result };
  }

  private newId(): string {
    try { return crypto.randomUUID(); } catch {
      // Non-secret correlation ID, never persisted with generated content.
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
        const value = Math.floor(Math.random() * 16);
        return (character === 'x' ? value : (value & 3) | 8).toString(16);
      });
    }
  }
}
