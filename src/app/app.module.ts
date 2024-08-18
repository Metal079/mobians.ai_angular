import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HomeModule } from '../modules/home.module';
import { FormsModule } from '@angular/forms';
import { SharedService } from 'src/app/shared.service';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { ServiceWorkerModule } from '@angular/service-worker';

import { FaqComponent } from './home/faq/faq.component';
import { TrainComponent } from './train/train.component';
import { NewLoraComponent } from './train/new-lora/new-lora.component';
import { HomeComponent } from './home/home.component';
import { AddLorasComponent } from './home/add-loras/add-loras.component';

// PrimeNG imports
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { FileUploadModule } from 'primeng/fileupload';
import { AccordionModule } from 'primeng/accordion';
import { ImageModule } from 'primeng/image';
import { CardModule } from 'primeng/card';
import { DialogService } from 'primeng/dynamicdialog';


const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'faq', component: FaqComponent },
  { path: 'train', component: TrainComponent },
  { path: 'train/new', component: NewLoraComponent },
];

@NgModule({
  declarations: [
    AppComponent,
    TrainComponent,
    HomeComponent,
    NewLoraComponent, // Add this line
    AddLorasComponent, // Add this line
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FormsModule,
    HomeModule,
    RouterModule.forRoot(routes),
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: true,
      registrationStrategy: 'registerWhenStable:30000'
    }),
    // PrimeNG modules
    TableModule,
    ButtonModule,
    FileUploadModule,
    AccordionModule,
    ImageModule,
    CardModule,
  ],
  providers: [SharedService, DialogService],
  bootstrap: [AppComponent]
})
export class AppModule { }