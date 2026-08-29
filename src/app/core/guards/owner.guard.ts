import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

export const ownerGuard: CanActivateFn = async () => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  let session = authState.currentSession();
  if (!session) {
    await authState.restoreSession();
    session = authState.currentSession();
  }

  if (session && session.role === 'OWNER') {
    return true;
  }

  // Operator or unauthenticated access blocked
  await router.navigate(['/dashboard']);
  return false;
};
