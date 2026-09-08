import { characterDraftGuard } from './characters/character-drafts.service';
import { Routes } from '@angular/router';
import { AdminGuard } from './auth/admin.guard';

export const routes: Routes = [
  {
    path: 'characters',
    canDeactivate: [characterDraftGuard],
    loadComponent: () => import('./characters/characters.component').then(m => m.CharactersComponent)
  },
  {
    path: 'characters/:id',
    canDeactivate: [characterDraftGuard],
    loadComponent: () => import('./characters/characters.component').then(m => m.CharactersComponent)
  },
  {
    path: '',
    canDeactivate: [characterDraftGuard],
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'faq',
    loadComponent: () => import('./home/faq/faq.component').then((m) => m.FaqComponent)
  },
  {
    path: 'video',
    canDeactivate: [characterDraftGuard],
    loadComponent: () => import('./video/video.component').then((m) => m.VideoComponent)
  },
  {
    path: 'train',
    children: [
      {
        path: '',
    canDeactivate: [characterDraftGuard],
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
