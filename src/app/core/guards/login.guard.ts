import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

export const loginGuard: CanActivateFn = async () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  let status = authState.setupStatus();
  if (!status) {
    status = await authState.checkSetupStatus();
  }

  // If uninitialized, redirect to /setup
  if (status.state === 'UNINITIALIZED') {
    await router.navigate(['/setup']);
    return false;
  }

  // Redirect INCONSISTENT strictly to /inconsistent
  if (status.state === 'INCONSISTENT') {
    await router.navigate(['/inconsistent']);
    return false;
  }

  // If already authenticated, redirect to /dashboard
  if (authState.isAuthenticated()) {
    await router.navigate(['/dashboard']);
    return false;
  }

  const restored = await authState.restoreSession();
  if (restored) {
    await router.navigate(['/dashboard']);
    return false;
  }

  return true;
};
