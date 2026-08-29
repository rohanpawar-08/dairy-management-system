import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

export const setupGuard: CanActivateFn = async () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  let status = authState.setupStatus();
  if (!status) {
    status = await authState.checkSetupStatus();
  }

  // Redirect INCONSISTENT strictly to /inconsistent
  if (status.state === 'INCONSISTENT') {
    await router.navigate(['/inconsistent']);
    return false;
  }

  // Only allow /setup if state is UNINITIALIZED
  if (status.state === 'UNINITIALIZED') {
    return true;
  }

  // If READY: redirect to login (or dashboard if session exists)
  if (authState.isAuthenticated()) {
    await router.navigate(['/dashboard']);
  } else {
    await router.navigate(['/login']);
  }
  return false;
};
