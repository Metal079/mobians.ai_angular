import { Component } from '@angular/core';
import { SharedService } from './shared.service';
import { SwUpdate } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  loginPromptVisible = false;
  isLoggedIn = false;

  constructor(private swUpdate: SwUpdate, private shared: SharedService) {
    this.checkForUpdates();
    
    // Subscribe reactively to user data changes - handles both initial load from localStorage and OAuth callbacks
    this.shared.getUserData().subscribe(user => {
      this.isLoggedIn = !!user && (!!user.discord_user_id || !!user.google_user_id || !!user.user_id);
      // Only show login prompt automatically if not logged in (optional - can be removed if you don't want auto-prompt)
      // this.loginPromptVisible = !this.isLoggedIn;
    });
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
