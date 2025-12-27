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
  private swVersionSub: Subscription | null = null;
  private swUnrecoverableSub: Subscription | null = null;
  private updateCheckIntervalId: any = null;
  private updateCheckHandler: (() => void) | null = null;
  private visibilityChangeHandler: (() => void) | null = null;
  private userActivityHandler: (() => void) | null = null;
  private pendingReload = false;
  private reloadStartAt: number | null = null;
  private reloadTimerId: any = null;
  private lastUserActivityAt = Date.now();
  private readonly appStartAt = Date.now();

  private readonly updateCheckIntervalMs = 5 * 60_000; // 5 minutes
  private readonly idleBeforeReloadMs = 30_000; // 30s of inactivity
  private readonly maxReloadDelayMs = 5 * 60_000; // force refresh within 5 minutes
  private readonly startupImmediateReloadWindowMs = 10_000; // reload immediately if update is found within first 10s after load

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
    this.applyStoredTheme();
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
    if (this.swVersionSub) {
      this.swVersionSub.unsubscribe();
    }
    if (this.swUnrecoverableSub) {
      this.swUnrecoverableSub.unsubscribe();
    }
    if (this.updateCheckIntervalId) {
      clearInterval(this.updateCheckIntervalId);
      this.updateCheckIntervalId = null;
    }
    if (this.reloadTimerId) {
      clearTimeout(this.reloadTimerId);
      this.reloadTimerId = null;
    }
    if (this.updateCheckHandler) {
      window.removeEventListener('focus', this.updateCheckHandler);
      window.removeEventListener('online', this.updateCheckHandler);
    }
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }
    if (this.userActivityHandler) {
      window.removeEventListener('pointerdown', this.userActivityHandler, true);
      window.removeEventListener('keydown', this.userActivityHandler, true);
      window.removeEventListener('touchstart', this.userActivityHandler, true);
      window.removeEventListener('wheel', this.userActivityHandler, true);
    }
  }

  private normalizeTheme(theme: string | null | undefined): 'sonic' | 'navy' {
    return theme === 'navy' ? 'navy' : 'sonic';
  }

  private applyStoredTheme(): void {
    try {
      const storedTheme = localStorage.getItem('panel-theme');
      const theme = this.normalizeTheme(storedTheme);
      document.body.classList.toggle('theme-navy', theme === 'navy');
    } catch {
      // Ignore theme load failures (e.g. storage unavailable).
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
      this.updateCheckHandler = () => {
        if (typeof navigator !== 'undefined' && navigator && 'onLine' in navigator && !navigator.onLine) return;
        console.log(`Checking for updates @ ${new Date().toISOString()}`);
        this.swUpdate
          .checkForUpdate()
          .then(found => {
            if (found) {
              console.log('New version detected');
              this.activateUpdateAndReload();
            }
          })
          .catch(err => {
            console.warn('Service worker update check failed', err);
          });
      };

      this.visibilityChangeHandler = () => {
        if (document.visibilityState === 'visible') {
          this.updateCheckHandler?.();
        } else if (this.pendingReload) {
          this.tryReloadForUpdate();
        }
      };

      this.userActivityHandler = () => {
        this.lastUserActivityAt = Date.now();
      };

      window.addEventListener('focus', this.updateCheckHandler);
      window.addEventListener('online', this.updateCheckHandler);
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
      window.addEventListener('pointerdown', this.userActivityHandler, true);
      window.addEventListener('keydown', this.userActivityHandler, true);
      window.addEventListener('touchstart', this.userActivityHandler, true);
      window.addEventListener('wheel', this.userActivityHandler, true);

      this.swVersionSub = this.swUpdate.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_READY') {
          this.activateUpdateAndReload();
        } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
          console.warn('Service worker update installation failed', event.error);
        }
      });

      this.swUnrecoverableSub = this.swUpdate.unrecoverable.subscribe(event => {
        console.warn('Service worker unrecoverable state, reloading', event.reason);
        window.location.reload();
      });

      this.updateCheckHandler();
      this.updateCheckIntervalId = setInterval(this.updateCheckHandler, this.updateCheckIntervalMs);
    }
  }

  private activateUpdateAndReload() {
    if (this.pendingReload) return;
    this.pendingReload = true;
    this.reloadStartAt = Date.now();

    this.swUpdate
      .activateUpdate()
      .then(activated => {
        if (activated) console.log('Activated new version');
        this.tryReloadForUpdate();
      })
      .catch(err => {
        console.warn('Service worker activateUpdate failed', err);
        this.tryReloadForUpdate();
      });
  }

  private tryReloadForUpdate() {
    if (!this.pendingReload) return;

    const now = Date.now();
    const waitedMs = this.reloadStartAt ? now - this.reloadStartAt : 0;
    const idleMs = now - this.lastUserActivityAt;
    const detectedAt = this.reloadStartAt ?? now;
    const detectedSinceStartMs = detectedAt - this.appStartAt;
    const shouldReloadImmediatelyOnStartup = detectedSinceStartMs <= this.startupImmediateReloadWindowMs;

    const shouldReload =
      shouldReloadImmediatelyOnStartup ||
      document.visibilityState === 'hidden' ||
      !document.hasFocus() ||
      idleMs >= this.idleBeforeReloadMs ||
      waitedMs >= this.maxReloadDelayMs;

    if (shouldReload) {
      window.location.reload();
      return;
    }

    if (this.reloadTimerId) return;
    this.reloadTimerId = setTimeout(() => {
      this.reloadTimerId = null;
      this.tryReloadForUpdate();
    }, 5_000);
  }

  onLoginModalVisibleChange(visible: boolean) {
    this.loginPromptVisible = visible;
  }
}
