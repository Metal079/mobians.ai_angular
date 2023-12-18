import { NgModule, isDevMode } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { HomeModule } from '../modules/home.module';  // updated import
import { FormsModule } from '@angular/forms';
import { SharedService } from 'src/app/shared.service';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { ServiceWorkerModule } from '@angular/service-worker';

import { FaqComponent } from './home/faq/faq.component';

const routes: Routes = [
  { path: 'faq', component: FaqComponent },
];

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    HomeModule,
    RouterModule.forRoot(routes),
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: true,
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    })    
  ],
  providers: [SharedService],
  bootstrap: [AppComponent]
})
export class AppModule { }
