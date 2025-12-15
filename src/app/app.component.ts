import { Component, OnInit, OnDestroy } from '@angular/core';
import { SharedService } from './shared.service';
import { SwUpdate } from '@angular/service-worker';
import { AuthService } from './auth/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  loginPromptVisible = false;
  isLoggedIn = false;
  private sessionInvalidSub: Subscription | null = null;

  constructor(
    private swUpdate: SwUpdate,
    private shared: SharedService,
    private authService: AuthService
  ) {
    this.checkForUpdates();
    
    // Subscribe reactively to user data changes - handles both initial load from localStorage and OAuth callbacks
    this.shared.getUserData().subscribe(user => {
      this.isLoggedIn = !!user && (!!user.discord_user_id || !!user.google_user_id || !!user.user_id);
      // Only show login prompt automatically if not logged in (optional - can be removed if you don't want auto-prompt)
      // this.loginPromptVisible = !this.isLoggedIn;
    });
  }

  ngOnInit(): void {
    // Validate session token on app startup
    this.validateSessionOnStartup();
    
    // Subscribe to session invalid events to show login modal
    this.sessionInvalidSub = this.authService.sessionInvalid$.subscribe(() => {
      this.isLoggedIn = false;
      this.loginPromptVisible = true;
    });
  }

  ngOnDestroy(): void {
    if (this.sessionInvalidSub) {
      this.sessionInvalidSub.unsubscribe();
    }
  }

  private async validateSessionOnStartup(): Promise<void> {
    // Only validate if there's a stored token
    const userData = this.shared.getUserDataValue();
    if (userData && (userData.discord_user_id || userData.google_user_id || userData.user_id)) {
      const isValid = await this.authService.validateSession();
      if (!isValid) {
        // Session is invalid - prompt login
        this.loginPromptVisible = true;
      }
    }
  }

  checkForUpdates() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.checkForUpdate().then(() => {
        console.log("Checked for updates");
      });

      this.swUpdate.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_READY') {
          if (confirm("New version available. Load New Version?")) {
            window.location.reload();
          }
        }
      });
    }
  }

  onLoginModalVisibleChange(visible: boolean) {
    this.loginPromptVisible = visible;
  }
}
