import { TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { AuthStateService } from '../../core/services/auth-state.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';

describe('DashboardComponent (Angular Unit)', () => {
  let mockAuthState: Partial<AuthStateService>;

  beforeEach(async () => {
    mockAuthState = {
      dairyProfile: signal({
        centreName: 'श्री गणेश कृपा डेअरी',
        ownerName: 'राम पाटील',
        phonePrimary: '9876543210',
        defaultLanguage: 'mr',
        settlementStartDay: 'MONDAY',
      }),
      currentSession: signal({
        userId: 1,
        username: 'owner',
        fullName: 'राम पाटील',
        role: 'OWNER',
        loginTime: new Date().toISOString(),
      }),
      isOwner: signal(true),
      isOperator: signal(false),
      loadProfile: vi.fn().mockResolvedValue(null),
      logout: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: AuthStateService, useValue: mockAuthState },
      ],
    }).compileComponents();
  });

  it('renders dairy profile summary and logged-in user info', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('श्री गणेश कृपा डेअरी');
    expect(compiled.textContent).toContain('राम पाटील');
  });

  it('triggers logout on button click', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const component = fixture.componentInstance;

    await component.onLogout();
    expect(mockAuthState.logout).toHaveBeenCalled();
  });
});
