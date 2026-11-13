import { characterDraftGuard } from './characters/character-drafts.service';
import { Routes } from '@angular/router';
import { AdminGuard } from './auth/admin.guard';

// `title` and `data.description` feed the search and link-preview tags
// (see seo-title.strategy.ts). Pages listed in sitemap.xml: /, /video, /characters, /faq.
const CHARACTERS_DESCRIPTION =
  'Keep your original characters and their looks in one place, then make new images and videos of them in a click.';

export const routes: Routes = [
  {
    path: 'characters',
    title: 'Save Your Characters | Mobians.ai',
    data: { description: CHARACTERS_DESCRIPTION },
    canDeactivate: [characterDraftGuard],
    loadComponent: () => import('./characters/characters.component').then(m => m.CharactersComponent)
  },
  {
    path: 'characters/:id',
    title: 'Your Character | Mobians.ai',
    data: { description: CHARACTERS_DESCRIPTION, noindex: true },
    canDeactivate: [characterDraftGuard],
    loadComponent: () => import('./characters/characters.component').then(m => m.CharactersComponent)
  },
  {
    // Title and description come from the defaults in seo-title.strategy.ts.
    path: '',
    canDeactivate: [characterDraftGuard],
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'faq',
    title: 'FAQ and Prompt Tips | Mobians.ai',
    data: { description: 'Tips for better prompts, the characters the models know, and answers to common questions about Mobians.ai.' },
    loadComponent: () => import('./home/faq/faq.component').then((m) => m.FaqComponent)
  },
  {
    path: 'video',
    title: 'AI Video Generator: Animate Your Images | Mobians.ai',
    data: { description: 'Turn a picture into a short AI video. Start from your own image or one you made on Mobians, pick a length from 5 to 20 seconds, and extend the clips you like.' },
    canDeactivate: [characterDraftGuard],
    loadComponent: () => import('./video/video.component').then((m) => m.VideoComponent)
  },
  {
    path: 'train',
    title: 'Train a LoRA | Mobians.ai',
    data: { noindex: true },
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
    title: 'Admin | Mobians.ai',
    data: { noindex: true },
    canActivate: [AdminGuard],
    loadComponent: () => import('./admin/admin.component').then((m) => m.AdminComponent)
  },
  {
    path: 'auth/callback',
    title: 'Signing in | Mobians.ai',
    data: { noindex: true },
    loadComponent: () =>
      import('./auth/auth-callback.component').then((m) => m.AuthCallbackComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
