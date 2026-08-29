import { TestBed } from '@angular/core/testing';
import { InconsistentStateComponent } from './inconsistent-state.component';
import { AuthStateService } from '../../core/services/auth-state.service';
import { Router } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('InconsistentStateComponent (Angular Unit)', () => {
  let mockAuthState: Partial<AuthStateService>;
  let mockRouter: Partial<Router>;

  beforeEach(async () => {
    mockAuthState = {
      checkSetupStatus: vi.fn().mockResolvedValue({ state: 'READY', dairyProfile: null }),
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [InconsistentStateComponent, NoopAnimationsModule],
      providers: [
        { provide: AuthStateService, useValue: mockAuthState },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();
  });

  it('renders warning without any password or login input fields', () => {
    const fixture = TestBed.createComponent(InconsistentStateComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('input')).toBeNull();
    expect(compiled.querySelector('form')).toBeNull();
    expect(compiled.textContent).toContain('डेटाबेस विसंगत स्थिती');
  });

  it('re-evaluates setup status on check again button click and navigates to login if recovered', async () => {
    const fixture = TestBed.createComponent(InconsistentStateComponent);
    const component = fixture.componentInstance;

    await component.checkAgain();

    expect(mockAuthState.checkSetupStatus).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});
