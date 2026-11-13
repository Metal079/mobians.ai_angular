import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { updateAnalyticsPageLocation } from './signup-tracking';

@Component({
    selector: 'app-auth-callback',
    template: `
    @if (!error) {
      <div class="p-4">Signing you in…</div>
    }
    @if (error) {
      <div class="p-4" style="color: #ff6b6b;">
        <p>{{ error }}</p>
        <button (click)="retry()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">Try Again</button>
      </div>
    }
    `,
    standalone: true
})
export class AuthCallbackComponent implements OnInit {
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService
  ) {}

  async ngOnInit() {
    await this.handleCallback();
  }

  // The address of this page holds a one-time sign-in code: never log it.
  async handleCallback() {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const errorParam = params.get('error');

    // Handle OAuth error responses
    if (errorParam) {
      this.error = params.get('error_description') || `Login failed: ${errorParam}`;
      return;
    }
    if (!code) {
      this.error = 'No authorization code received. Please try signing in again.';
      return;
    }

    const signIn = this.auth.readSignInReturn(params.get('state'));
    // Linking attaches a sign-in method to the account that is open in this
    // browser, so it is only done for a request this browser itself started.
    // A plain sign-in is still accepted without that proof (it then lands on the
    // home page): on some phones the provider returns in a different browser.
    if (signIn.link && !signIn.verified) {
      this.error = "We couldn't confirm this request to connect a sign-in method. Please start again from the Account panel.";
      return;
    }

    try {
      await this.auth.exchangeCode(signIn.provider, code, signIn.link, signIn);
      await this.router.navigateByUrl(signIn.returnPath);
      updateAnalyticsPageLocation();
    } catch (e: any) {
      console.error('Auth exchange failed:', e?.status ?? '', e?.error?.detail ?? e?.message ?? '');
      const detail = e?.error?.detail;
      this.error = (typeof detail === 'string' && detail) || 'Failed to complete sign in. Please try again.';
    }
  }

  retry() {
    this.router.navigateByUrl('/').then(() => updateAnalyticsPageLocation());
  }
}
