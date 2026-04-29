import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AuthService } from './auth.service';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { LoginCtaContext } from './account-cta.service';

@Component({
    selector: 'app-login-modal',
    templateUrl: './login-modal.component.html',
    styleUrls: ['./login-modal.component.css'],
    standalone: true,
    imports: [DialogModule, ButtonModule]
})
export class LoginModalComponent {
  @Input() visible = false;
  @Input() context: LoginCtaContext | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();

  constructor(public auth: AuthService) {}

  get dialogHeader(): string {
    return this.context?.title || 'Sign in';
  }

  get loginMessage(): string {
    if (this.context?.message) {
      return this.context.message;
    }

    const creditCopy = this.context?.requiredCredits
      ? ` This request costs ${this.context.requiredCredits} credits.`
      : '';

    switch (this.context?.reason) {
      case 'priority':
        return `Sign in to use the priority queue and keep your credits synced across devices.${creditCopy}`;
      case 'upscale':
        return `Sign in to upscale images with your account credits.${creditCopy}`;
      case 'hires':
        return `Sign in to use Hi-Res generation with your account credits.${creditCopy}`;
      case 'session-expired':
        return 'Your session expired. Sign in again to keep using credits, priority generation, and synced account features.';
      default:
        return 'Sign in to get credits, use priority generation, and keep your history synced across devices.';
    }
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  loginDiscord() { this.auth.startLogin('discord'); }
  loginGoogle() { this.auth.startLogin('google'); }
  loginAuth0() { this.auth.loginAuth0(); }
}
