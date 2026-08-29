import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

export const authGuard: CanActivateFn = async () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  // 1. Ensure setup status is known
  let status = authState.setupStatus();
  if (!status) {
    status = await authState.checkSetupStatus();
  }

  if (status.state === 'UNINITIALIZED') {
    await router.navigate(['/setup']);
    return false;
  }

  if (status.state === 'INCONSISTENT') {
    await router.navigate(['/inconsistent']);
    return false;
  }

  // 2. Check if authenticated or restorable session
  if (authState.isAuthenticated()) {
    return true;
  }

  const restored = await authState.restoreSession();
  if (restored) {
    return true;
  }

  await router.navigate(['/login']);
  return false;
};
