import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError, Subject } from 'rxjs';
import { catchError } from 'rxjs/operators';

// Global subject to notify about session invalidation
// Components can subscribe to this to show login modal
export const sessionInvalid$ = new Subject<void>();

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Get token from localStorage
    let token: string | null = null;
    try {
      token = localStorage.getItem('authToken');
    } catch {
      // localStorage not available
    }

    // If no token, proceed without auth header
    if (!token) {
      return next.handle(req);
    }

    // Clone the request and add Authorization header
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });

    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          // Token is invalid or expired - clear stale auth data
          try {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
          } catch {
            // localStorage not available
          }
          // Notify subscribers that session is invalid (e.g., to show login modal)
          sessionInvalid$.next();
        }
        return throwError(() => error);
      })
    );
  }
}
