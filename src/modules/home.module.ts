import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ImageGridComponent } from 'src/app/home/image-grid/image-grid.component';
import { OptionsComponent } from 'src/app/home/options/options.component';
import { FaqComponent } from 'src/app/home/faq/faq.component';


@NgModule({
  declarations: [
    ImageGridComponent,
    OptionsComponent,
    FaqComponent
  ],
  imports: [
    CommonModule,
    FormsModule  // FormsModule included here in imports
  ],
  exports: [
    ImageGridComponent,
    OptionsComponent,
    FaqComponent
  ]
})
export class HomeModule { }  // PascalCase

