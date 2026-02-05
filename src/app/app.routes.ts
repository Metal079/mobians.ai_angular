import { Routes } from '@angular/router';
import { AdminGuard } from './auth/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'faq',
    loadComponent: () => import('./home/faq/faq.component').then((m) => m.FaqComponent)
  },
  {
    path: 'train',
    children: [
      {
        path: '',
        loadComponent: () => import('./train/train.component').then((m) => m.TrainComponent)
      },
      {
        path: 'new',
        loadComponent: () => import('./train/new-lora/new-lora.component').then((m) => m.NewLoraComponent)
      }
    ]
  },
  {
    path: 'admin',
    canActivate: [AdminGuard],
    loadComponent: () => import('./admin/admin.component').then((m) => m.AdminComponent)
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./auth/auth-callback.component').then((m) => m.AuthCallbackComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
