import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'documents/generate',
    title: 'Document generation',
    // Lazy: the page and its dependencies load only when the route is visited.
    loadComponent: () => import('./docgen/docgen-page').then((m) => m.DocgenPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'documents/generate' },
];
