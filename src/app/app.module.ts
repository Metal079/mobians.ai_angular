import { NgModule } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HomeModule } from '../modules/home.module';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthCallbackComponent } from './auth/auth-callback.component';
import { LoginModalComponent } from './auth/login-modal.component';
import { ProfileMenuComponent } from './auth/profile-menu.component';
import { CreditsPurchaseComponent } from './auth/credits-purchase.component';
import { AuthInterceptor } from './auth/auth.interceptor';
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from 'src/environments/environment';

// Only import Auth0 if configured - prevents side effects from loading the module
const auth0Config = (environment as any).auth0;
const hasAuth0 = !!(auth0Config?.domain && auth0Config?.clientId);

import { FaqComponent } from './home/faq/faq.component';
import { HomeComponent } from './home/home.component';

// PrimeNG imports
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { FileUploadModule } from 'primeng/fileupload';
import { AccordionModule } from 'primeng/accordion';
import { ImageModule } from 'primeng/image';
import { CardModule } from 'primeng/card';
import { DialogService } from 'primeng/dynamicdialog';
import { ConfirmationService } from 'primeng/api';
import { PanelModule } from 'primeng/panel';
import { ChipModule } from 'primeng/chip';
import { DialogModule } from 'primeng/dialog'; 
import { InputSwitchModule } from 'primeng/inputswitch';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ChipsModule } from 'primeng/chips';
import { MultiSelectModule } from 'primeng/multiselect';
import { TabViewModule } from 'primeng/tabview';
import { MenuModule } from 'primeng/menu';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { RippleModule } from 'primeng/ripple';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';


const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'faq', component: FaqComponent },
  // Lazy load train and admin modules for better initial bundle size
  { 
    path: 'train', 
    loadChildren: () => import('./train/train.module').then(m => m.TrainModule) 
  },
  { 
    path: 'admin', 
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule) 
  },
  { path: 'auth/callback', component: AuthCallbackComponent },
];

@NgModule({ declarations: [
        AppComponent,
        HomeComponent,
  AuthCallbackComponent,
  LoginModalComponent,
  ProfileMenuComponent,
  CreditsPurchaseComponent,
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        BrowserAnimationsModule,
        FormsModule,
        HomeModule,
    RouterModule.forRoot(routes),
    // Auth0 is not currently configured - remove when adding Auth0 support
    // AuthModule.forRoot({ ... }),
        ServiceWorkerModule.register('ngsw-worker.js', {
            enabled: environment.production,
            registrationStrategy: 'registerWhenStable:30000'
        }),
        // PrimeNG modules
        TableModule,
        PanelModule,
        ChipModule,
        ButtonModule,
        DialogModule,  
        InputSwitchModule,
        SelectButtonModule,
        ChipsModule,
        MultiSelectModule,
  TabViewModule,
        FileUploadModule,
        AccordionModule,
        ImageModule,
  CardModule,
  MenuModule,
  ConfirmDialogModule,
  TooltipModule,
  RippleModule,
  InputTextModule,
  TagModule], providers: [
    DialogService,
    ConfirmationService,
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ] })
export class AppModule { }