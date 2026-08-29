import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { setupGuard } from './setup.guard';
import { loginGuard } from './login.guard';
import { inconsistentGuard } from './inconsistent.guard';
import { AuthStateService } from '../services/auth-state.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';

describe('Route Guards (Angular Unit)', () => {
  let mockAuthState: Partial<AuthStateService>;
  let mockRouter: Partial<Router>;

  beforeEach(() => {
    mockAuthState = {
      setupStatus: signal({ state: 'READY', dairyProfile: null }),
      checkSetupStatus: vi.fn().mockResolvedValue({ state: 'READY', dairyProfile: null }),
      isAuthenticated: signal(false),
      restoreSession: vi.fn().mockResolvedValue(null),
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStateService, useValue: mockAuthState },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  it('authGuard redirects to /login when unauthenticated in READY state', async () => {
    const canActivate = await TestBed.runInInjectionContext(() =>
      authGuard({} as any, {} as any)
    );
    expect(canActivate).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('authGuard redirects to /inconsistent when state is INCONSISTENT', async () => {
    (mockAuthState.setupStatus as any).set({ state: 'INCONSISTENT', dairyProfile: null });

    const canActivate = await TestBed.runInInjectionContext(() =>
      authGuard({} as any, {} as any)
    );
    expect(canActivate).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/inconsistent']);
  });

  it('setupGuard allows /setup when state is UNINITIALIZED', async () => {
    (mockAuthState.setupStatus as any).set({ state: 'UNINITIALIZED', dairyProfile: null });

    const canActivate = await TestBed.runInInjectionContext(() =>
      setupGuard({} as any, {} as any)
    );
    expect(canActivate).toBe(true);
  });

  it('setupGuard redirects to /login when state is READY', async () => {
    (mockAuthState.setupStatus as any).set({ state: 'READY', dairyProfile: null });

    const canActivate = await TestBed.runInInjectionContext(() =>
      setupGuard({} as any, {} as any)
    );
    expect(canActivate).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('setupGuard redirects to /inconsistent when state is INCONSISTENT', async () => {
    (mockAuthState.setupStatus as any).set({ state: 'INCONSISTENT', dairyProfile: null });

    const canActivate = await TestBed.runInInjectionContext(() =>
      setupGuard({} as any, {} as any)
    );
    expect(canActivate).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/inconsistent']);
  });

  it('loginGuard redirects to /dashboard when authenticated', async () => {
    (mockAuthState.isAuthenticated as any).set(true);

    const canActivate = await TestBed.runInInjectionContext(() =>
      loginGuard({} as any, {} as any)
    );
    expect(canActivate).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('loginGuard redirects to /inconsistent when state is INCONSISTENT', async () => {
    (mockAuthState.setupStatus as any).set({ state: 'INCONSISTENT', dairyProfile: null });

    const canActivate = await TestBed.runInInjectionContext(() =>
      loginGuard({} as any, {} as any)
    );
    expect(canActivate).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/inconsistent']);
  });

  it('inconsistentGuard allows access when state is INCONSISTENT', async () => {
    (mockAuthState.setupStatus as any).set({ state: 'INCONSISTENT', dairyProfile: null });

    const canActivate = await TestBed.runInInjectionContext(() =>
      inconsistentGuard({} as any, {} as any)
    );
    expect(canActivate).toBe(true);
  });

  it('inconsistentGuard redirects to /login when state is READY', async () => {
    (mockAuthState.setupStatus as any).set({ state: 'READY', dairyProfile: null });

    const canActivate = await TestBed.runInInjectionContext(() =>
      inconsistentGuard({} as any, {} as any)
    );
    expect(canActivate).toBe(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});
