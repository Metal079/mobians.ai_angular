import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ImageGridComponent } from 'src/app/home/image-grid/image-grid.component';
import { OptionsComponent } from 'src/app/home/options/options.component';
import { FaqComponent } from 'src/app/home/faq/faq.component';
import { ImageModalComponent } from 'src/app/home/image-modal/image-modal.component';
import { GligenDisplayComponent } from 'src/app/home/gligen-display/gligen-display.component';
import { InpaintingDisplayComponent } from 'src/app/home/inpainting-display/inpainting-display.component';
import { AddLorasComponent } from 'src/app/home/add-loras/add-loras.component';
import { BlobMigrationService } from 'src/app/blob-migration.service';

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
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { PanelModule } from 'primeng/panel';
import { ChipModule } from 'primeng/chip';
import { TabViewModule } from 'primeng/tabview';
import { RouterModule } from '@angular/router';
import { MessagesModule } from 'primeng/messages';
import { InputSwitchModule } from 'primeng/inputswitch';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ChipsModule } from 'primeng/chips';
import { MultiSelectModule } from 'primeng/multiselect';


@NgModule({
  declarations: [
    ImageGridComponent,
    OptionsComponent,
    FaqComponent,
    ImageModalComponent,
    GligenDisplayComponent,
    InpaintingDisplayComponent,
    AddLorasComponent,
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
    InputTextModule,
    DropdownModule,
    ProgressSpinnerModule,
    DialogModule,
    TableModule,
    PanelModule,
    ChipModule,
    TabViewModule,
    RouterModule,
    MessagesModule,
    InputSwitchModule,
    SelectButtonModule,
    MultiSelectModule,
    ChipsModule,
  ],
  exports: [
    ImageGridComponent,
    OptionsComponent,
    FaqComponent,
    ImageModalComponent,
    GligenDisplayComponent,
    InpaintingDisplayComponent,
    OverlayPanelModule,
    InputTextModule,
    DropdownModule,
    ProgressSpinnerModule,
    AddLorasComponent,
  ],
  providers: [MessageService, BlobMigrationService]
})
export class HomeModule { }  // PascalCase

