import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, AuthProvider } from './auth.service';

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

  async handleCallback() {
    console.log('AuthCallback: handleCallback started');
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const errorParam = params.get('error');
    const errorDescription = params.get('error_description');
    const state = params.get('state');
    
    console.log('AuthCallback: code =', code, 'state =', state);
    
    // Handle OAuth error responses
    if (errorParam) {
      this.error = errorDescription || `Login failed: ${errorParam}`;
      console.log('AuthCallback: OAuth error', errorParam, errorDescription);
      return;
    }

    let provider: AuthProvider = 'discord';
    let link = false;
    if (state) {
      const s = decodeURIComponent(state);
      if (s.includes('p=google')) provider = 'google';
      if (s.includes('p=discord')) provider = 'discord';
      if (s.includes('m=link')) link = true;
    }
    
    console.log('AuthCallback: provider =', provider, 'link =', link);

    if (code) {
      try {
        console.log('AuthCallback: calling exchangeCode...');
        await this.auth.exchangeCode(provider, code, link);
        console.log('AuthCallback: exchangeCode succeeded, navigating home');
        this.router.navigateByUrl('/');
      } catch (e: any) {
        console.error('Auth exchange failed:', e);
        this.error = e?.message || 'Failed to complete sign in. Please try again.';
      }
    } else {
      this.error = 'No authorization code received. Please try signing in again.';
      console.log('AuthCallback: No code received');
    }
  }

  retry() {
    this.router.navigateByUrl('/');
  }
}
