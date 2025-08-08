import { NgModule } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HomeModule } from '../modules/home.module';
import { FormsModule } from '@angular/forms';
import { SharedService } from 'src/app/shared.service';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from 'src/environments/environment';

import { FaqComponent } from './home/faq/faq.component';
import { TrainComponent } from './train/train.component';
import { NewLoraComponent } from './train/new-lora/new-lora.component';
import { HomeComponent } from './home/home.component';
import { AdminComponent } from './admin/admin.component';

// PrimeNG imports
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { FileUploadModule } from 'primeng/fileupload';
import { AccordionModule } from 'primeng/accordion';
import { ImageModule } from 'primeng/image';
import { CardModule } from 'primeng/card';
import { DialogService } from 'primeng/dynamicdialog';
import { PanelModule } from 'primeng/panel';
import { ChipModule } from 'primeng/chip';
import { DialogModule } from 'primeng/dialog'; 
import { InputSwitchModule } from 'primeng/inputswitch';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ChipsModule } from 'primeng/chips';
import { MultiSelectModule } from 'primeng/multiselect';


const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'faq', component: FaqComponent },
  { path: 'train', component: TrainComponent },
  { path: 'train/new', component: NewLoraComponent },
  { path: 'admin', component: AdminComponent },
];

@NgModule({ declarations: [
        AppComponent,
        TrainComponent,
        HomeComponent,
        NewLoraComponent, // Add this line
        AdminComponent,
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        BrowserAnimationsModule,
        FormsModule,
        HomeModule,
        RouterModule.forRoot(routes),
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
        FileUploadModule,
        AccordionModule,
        ImageModule,
        CardModule], providers: [SharedService, DialogService, provideHttpClient(withInterceptorsFromDi())] })
export class AppModule { }