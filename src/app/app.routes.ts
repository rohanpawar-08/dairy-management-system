import { Routes } from '@angular/router';
import { Stage1StatusComponent } from './features/stage1-status/stage1-status.component';

export const routes: Routes = [
  {
    path: '',
    component: Stage1StatusComponent,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
