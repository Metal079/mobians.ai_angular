import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { recordFirstTouch } from './app/first-touch';

// Before the app starts, so the arrival address is read before any redirect changes it.
recordFirstTouch();

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
