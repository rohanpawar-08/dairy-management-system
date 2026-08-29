import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ownerGuard } from './owner.guard';
import { AuthStateService } from '../services/auth-state.service';
import { AuthSessionDto } from '../../../../shared/ipc-contracts';

describe('OwnerGuard', () => {
  let authStateMock: {
    currentSession: ReturnType<typeof vi.fn>;
    restoreSession: ReturnType<typeof vi.fn>;
  };
  let routerMock: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authStateMock = {
      currentSession: vi.fn(),
      restoreSession: vi.fn().mockResolvedValue(undefined),
    };
    routerMock = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStateService, useValue: authStateMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('allows access for authenticated OWNER role', async () => {
    const ownerSession: AuthSessionDto = {
      userId: 1,
      username: 'owner',
      fullName: 'Owner Name',
      role: 'OWNER',
    };
    authStateMock.currentSession.mockReturnValue(ownerSession);

    const result = await TestBed.runInInjectionContext(() =>
      ownerGuard({} as any, {} as any)
    );

    expect(result).toBe(true);
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('blocks access and redirects to dashboard for OPERATOR role', async () => {
    const operatorSession: AuthSessionDto = {
      userId: 2,
      username: 'operator',
      fullName: 'Operator Name',
      role: 'OPERATOR',
    };
    authStateMock.currentSession.mockReturnValue(operatorSession);

    const result = await TestBed.runInInjectionContext(() =>
      ownerGuard({} as any, {} as any)
    );

    expect(result).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('blocks access and redirects to dashboard when no user session exists', async () => {
    authStateMock.currentSession.mockReturnValue(null);

    const result = await TestBed.runInInjectionContext(() =>
      ownerGuard({} as any, {} as any)
    );

    expect(result).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});
