import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AuthService } from './auth.service';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

@Component({
    selector: 'app-login-modal',
    templateUrl: './login-modal.component.html',
    styleUrls: ['./login-modal.component.css'],
    standalone: true,
    imports: [DialogModule, ButtonModule]
})
export class LoginModalComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  constructor(public auth: AuthService) {}

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  loginDiscord() { this.auth.startLogin('discord'); }
  loginGoogle() { this.auth.startLogin('google'); }
  loginAuth0() { this.auth.loginAuth0(); }
}
