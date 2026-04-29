import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type LoginCtaReason = 'priority' | 'upscale' | 'hires' | 'session-expired' | 'generic';

export interface LoginCtaContext {
  reason?: LoginCtaReason;
  title?: string;
  message?: string;
  requiredCredits?: number;
}

export type CreditPurchaseCtaReason = 'insufficient-credits' | 'profile-menu' | 'backend-402' | 'generic';

export interface CreditPurchaseCtaContext {
  reason?: CreditPurchaseCtaReason;
  requiredCredits?: number;
  currentCredits?: number;
  requestedMode?: 'priority' | 'upscale' | 'hires' | 'generate';
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class AccountCtaService {
  private readonly loginRequestSubject = new Subject<LoginCtaContext>();
  private readonly creditPurchaseRequestSubject = new Subject<CreditPurchaseCtaContext>();

  readonly loginRequests$ = this.loginRequestSubject.asObservable();
  readonly creditPurchaseRequests$ = this.creditPurchaseRequestSubject.asObservable();

  requestLogin(context: LoginCtaContext = {}): void {
    this.loginRequestSubject.next(context);
  }

  requestCreditPurchase(context: CreditPurchaseCtaContext = {}): void {
    this.creditPurchaseRequestSubject.next(context);
  }
}