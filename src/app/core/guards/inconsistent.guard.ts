import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

export const inconsistentGuard: CanActivateFn = async () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  let status = authState.setupStatus();
  if (!status) {
    status = await authState.checkSetupStatus();
  }

  // Only allow /inconsistent if database state is INCONSISTENT
  if (status.state === 'INCONSISTENT') {
    return true;
  }

  if (status.state === 'UNINITIALIZED') {
    await router.navigate(['/setup']);
    return false;
  }

  // If READY: redirect to login or dashboard
  if (authState.isAuthenticated()) {
    await router.navigate(['/dashboard']);
  } else {
    await router.navigate(['/login']);
  }
  return false;
};
