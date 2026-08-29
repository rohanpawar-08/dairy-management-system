import { TestBed } from '@angular/core/testing';
import { SetupComponent } from './setup.component';
import { AuthStateService } from '../../core/services/auth-state.service';
import { Router } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('SetupComponent (Angular Unit)', () => {
  let mockAuthState: Partial<AuthStateService>;
  let mockRouter: Partial<Router>;

  beforeEach(async () => {
    mockAuthState = {
      completeSetup: vi.fn().mockResolvedValue({
        centreName: 'श्री गणेश कृपा डेअरी',
        ownerName: 'राम पाटील',
        defaultLanguage: 'mr',
        settlementStartDay: 'MONDAY',
      }),
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [SetupComponent, NoopAnimationsModule],
      providers: [
        { provide: AuthStateService, useValue: mockAuthState },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();
  });

  it('initializes on Step 1 with invalid profile form', () => {
    const fixture = TestBed.createComponent(SetupComponent);
    const component = fixture.componentInstance;
    expect(component.currentStep()).toBe(1);
    expect(component.profileForm.valid).toBe(false);
  });

  it('advances through wizard steps upon valid form input', () => {
    const fixture = TestBed.createComponent(SetupComponent);
    const component = fixture.componentInstance;

    // Fill valid Step 1
    component.profileForm.patchValue({
      centreName: 'श्री गणेश कृपा डेअरी',
      ownerName: 'राम पाटील',
      phonePrimary: '9876543210',
      pincode: '411001',
      defaultLanguage: 'mr',
      enabledMilkTypes: 'BOTH',
      settlementStartDay: 'MONDAY',
    });

    component.nextStep();
    expect(component.currentStep()).toBe(2);

    // Fill valid Step 2
    component.credentialsForm.patchValue({
      username: 'owner_ram',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      pin: '1234',
      confirmPin: '1234',
    });

    component.nextStep();
    expect(component.currentStep()).toBe(3);
  });

  it('submits setup and cleans up sensitive password fields', async () => {
    const fixture = TestBed.createComponent(SetupComponent);
    const component = fixture.componentInstance;

    component.profileForm.patchValue({
      centreName: 'श्री गणेश कृपा डेअरी',
      ownerName: 'राम पाटील',
      phonePrimary: '9876543210',
      defaultLanguage: 'mr',
      enabledMilkTypes: 'BOTH',
      settlementStartDay: 'MONDAY',
    });

    component.credentialsForm.patchValue({
      username: 'owner_ram',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      pin: '1234',
      confirmPin: '1234',
    });

    await component.submitSetup();

    expect(mockAuthState.completeSetup).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    expect(component.credentialsForm.value.password).toBeNull();
  });

  it('rejects passwords shorter than 10 characters in credentials form', () => {
    const fixture = TestBed.createComponent(SetupComponent);
    const component = fixture.componentInstance;

    component.credentialsForm.patchValue({
      username: 'owner_ram',
      password: 'Pass9char', // 9 characters
      confirmPassword: 'Pass9char',
    });

    expect(component.credentialsForm.get('password')?.hasError('minlength')).toBe(true);
    expect(component.credentialsForm.valid).toBe(false);
  });
});
