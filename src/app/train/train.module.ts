import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { TrainComponent } from './train.component';
import { NewLoraComponent } from './new-lora/new-lora.component';

// PrimeNG imports used by train components
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { FileUploadModule } from 'primeng/fileupload';
import { CardModule } from 'primeng/card';
import { ChipModule } from 'primeng/chip';
import { AccordionModule } from 'primeng/accordion';
import { ImageModule } from 'primeng/image';

const routes: Routes = [
  { path: '', component: TrainComponent },
  { path: 'new', component: NewLoraComponent }
];

@NgModule({
  declarations: [
    TrainComponent,
    NewLoraComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    TableModule,
    ButtonModule,
    FileUploadModule,
    CardModule,
    ChipModule,
    AccordionModule,
    ImageModule
  ]
})
export class TrainModule { }
