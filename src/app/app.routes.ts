import { Routes } from '@angular/router';
import { SetupComponent } from './features/setup/setup.component';
import { LoginComponent } from './features/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { InconsistentStateComponent } from './features/inconsistent-state/inconsistent-state.component';
import { setupGuard } from './core/guards/setup.guard';
import { loginGuard } from './core/guards/login.guard';
import { authGuard } from './core/guards/auth.guard';
import { ownerGuard } from './core/guards/owner.guard';
import { inconsistentGuard } from './core/guards/inconsistent.guard';

export const routes: Routes = [
  {
    path: 'setup',
    component: SetupComponent,
    canActivate: [setupGuard],
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [loginGuard],
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'farmers',
    loadComponent: () =>
      import('./features/farmers/farmers.component').then((m) => m.FarmersComponent),
    canActivate: [authGuard],
  },
  {
    path: 'rate-plans',
    loadComponent: () =>
      import('./features/rate-plans/rate-plans.component').then((m) => m.RatePlansComponent),
    canActivate: [authGuard, ownerGuard],
  },
  {
    path: 'inconsistent',
    component: InconsistentStateComponent,
    canActivate: [inconsistentGuard],
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
