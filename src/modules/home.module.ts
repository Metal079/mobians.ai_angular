import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ImageGridComponent } from 'src/app/home/image-grid/image-grid.component';
import { OptionsComponent } from 'src/app/home/options/options.component';
import { FaqComponent } from 'src/app/home/faq/faq.component';
import { ImageModalComponent } from 'src/app/home/image-modal/image-modal.component';
import { GligenDisplayComponent } from 'src/app/home/gligen-display/gligen-display.component';
import { InpaintingDisplayComponent } from 'src/app/home/inpainting-display/inpainting-display.component';

import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {ToastModule} from 'primeng/toast';
import {MessageService} from 'primeng/api';
import {InputTextareaModule} from 'primeng/inputtextarea';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
import { ColorPickerModule } from 'primeng/colorpicker';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { OverlayPanelModule } from 'primeng/overlaypanel';

@NgModule({
  declarations: [
    ImageGridComponent,
    OptionsComponent,
    FaqComponent,
    ImageModalComponent,
    GligenDisplayComponent, 
    InpaintingDisplayComponent,
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
    ColorPickerModule,
    ToggleButtonModule,
    OverlayPanelModule,
  ],
  exports: [
    ImageGridComponent,
    OptionsComponent,
    FaqComponent,
    ImageModalComponent,
    GligenDisplayComponent, 
    InpaintingDisplayComponent,
    OverlayPanelModule,
  ],
  providers: [MessageService]
})
export class HomeModule { }  // PascalCase

