import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ImageGridComponent } from 'src/app/home/image-grid/image-grid.component';
import { OptionsComponent } from 'src/app/home/options/options.component';
import { FaqComponent } from 'src/app/home/faq/faq.component';
import { UserRatingComponent } from 'src/app/home/user-rating/user-rating.component';

import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {ToastModule} from 'primeng/toast';
import {MessageService} from 'primeng/api';
import {InputTextareaModule} from 'primeng/inputtextarea';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';


@NgModule({
  declarations: [
    ImageGridComponent,
    OptionsComponent,
    FaqComponent,
    UserRatingComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    ToastModule,
    CommonModule,
    FormsModule,  // FormsModule included here in imports
    InputTextareaModule,
    TooltipModule,
    ButtonModule,
  ],
  exports: [
    ImageGridComponent,
    OptionsComponent,
    FaqComponent,
    UserRatingComponent,
  ],
  providers: [MessageService]
})
export class HomeModule { }  // PascalCase

