import { TestBed } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { AuthStateService } from '../../core/services/auth-state.service';
import { Router } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('LoginComponent (Angular Unit)', () => {
  let mockAuthState: Partial<AuthStateService>;
  let mockRouter: Partial<Router>;

  beforeEach(async () => {
    mockAuthState = {
      checkSetupStatus: vi.fn().mockResolvedValue({ state: 'READY', dairyProfile: null }),
      login: vi.fn().mockResolvedValue({
        userId: 1,
        username: 'owner',
        fullName: 'Owner Name',
        role: 'OWNER',
        loginTime: new Date().toISOString(),
      }),
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, NoopAnimationsModule],
      providers: [
        { provide: AuthStateService, useValue: mockAuthState },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();
  });

  it('initializes in password mode and performs password authentication', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;

    expect(component.loginMode()).toBe('password');

    component.passwordForm.patchValue({
      username: 'owner',
      password: 'SecurePassword123',
    });

    await component.submitLogin();

    expect(mockAuthState.login).toHaveBeenCalledWith({
      username: 'owner',
      password: 'SecurePassword123',
      pin: undefined,
    });
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    // Password input field is cleared
    expect(component.passwordForm.value.password).toBe('');
  });

  it('switches to PIN mode and submits quick PIN', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;

    component.setMode('pin');
    expect(component.loginMode()).toBe('pin');

    component.pinForm.patchValue({
      username: 'owner',
      pin: '1234',
    });

    await component.submitLogin();

    expect(mockAuthState.login).toHaveBeenCalledWith({
      username: 'owner',
      password: undefined,
      pin: '1234',
    });
    expect(component.pinForm.value.pin).toBe('');
  });

  it('displays error banner if login fails', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;

    (mockAuthState.login as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Invalid username or credentials.')
    );

    component.passwordForm.patchValue({
      username: 'wrong_user',
      password: 'wrong_pass',
    });

    await component.submitLogin();

    expect(component.errorMessage()).toContain('Invalid username or credentials.');
  });

  it('redirects to /inconsistent on init if database state is INCONSISTENT', async () => {
    (mockAuthState.checkSetupStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      state: 'INCONSISTENT',
      dairyProfile: null,
    });

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    await component.ngOnInit();

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/inconsistent']);
  });
});
