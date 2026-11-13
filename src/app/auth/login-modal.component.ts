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
      case 'wait-screen':
        return "Sign in free and get 200 credits: priority images in seconds, or your first video. The image you're waiting for keeps its place in line.";
      case 'results':
        return 'Sign in free to keep your images synced across devices, and get 200 credits for priority images or your first video.';
      case 'animate':
        return 'Sign in free to turn this image into a video. New accounts get 200 credits, enough for a first video.';
      default:
        return 'Sign in free and get 200 credits: priority images in seconds, or your first video. Your history stays synced across devices.';
    }
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  // The reason that opened this dialog travels with the sign-in so new accounts can be traced to a prompt.
  loginDiscord() { this.auth.startLogin('discord', 'login', this.context?.reason); }
  loginGoogle() { this.auth.startLogin('google', 'login', this.context?.reason); }
  loginAuth0() { this.auth.loginAuth0(); }
}
