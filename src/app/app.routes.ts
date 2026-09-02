import { Routes } from '@angular/router';
import { SetupComponent } from './features/setup/setup.component';
import { LoginComponent } from './features/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { InconsistentStateComponent } from './features/inconsistent-state/inconsistent-state.component';
import { setupGuard } from './core/guards/setup.guard';
import { loginGuard } from './core/guards/login.guard';
import { authGuard } from './core/guards/auth.guard';
import { ownerGuard } from './core/guards/owner.guard';
import { ReportsComponent } from './features/reports/reports.component';
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
    path: 'collection',
    loadComponent: () =>
      import('./features/collection/collection.component').then((m) => m.CollectionComponent),
    canActivate: [authGuard],
  },
  {
    path: 'ledger',
    loadComponent: () =>
      import('./features/ledger/ledger.component').then((m) => m.LedgerComponent),
    canActivate: [authGuard],
  },
  {
    path: 'settlements',
    loadComponent: () =>
      import('./features/settlements/settlements.component').then((m) => m.SettlementsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'inconsistent',
    component: InconsistentStateComponent,
    canActivate: [inconsistentGuard],
  },
  {
    path: 'reports',
    component: ReportsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'backup-restore',
    loadComponent: () =>
      import('./features/backup-restore/backup-restore.component').then((m) => m.BackupRestoreComponent),
    canActivate: [authGuard, ownerGuard],
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
