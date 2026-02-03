import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { AdminComponent } from './admin.component';
import { AdminGuard } from '../auth/admin.guard';

// PrimeNG imports used by admin component
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { PanelModule } from 'primeng/panel';
import { TabViewModule } from 'primeng/tabview';
import { ToastModule } from 'primeng/toast';
import { MessageService, ConfirmationService } from 'primeng/api';

const routes: Routes = [
  { path: '', component: AdminComponent, canActivate: [AdminGuard] }
];

@NgModule({
  declarations: [
    AdminComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputSwitchModule,
    ConfirmDialogModule,
    TooltipModule,
    TagModule,
    MultiSelectModule,
    SelectButtonModule,
    PanelModule,
    TabViewModule,
    ToastModule
  ],
  providers: [
    MessageService,
    ConfirmationService
  ]
})
export class AdminModule { }
