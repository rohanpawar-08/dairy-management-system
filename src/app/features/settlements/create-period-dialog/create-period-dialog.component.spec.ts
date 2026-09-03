import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import {
  CreatePeriodDialogComponent,
  calculateDefaultPeriodStart,
} from './create-period-dialog.component';
import { AuthStateService } from '../../../core/services/auth-state.service';

describe('CreatePeriodDialogComponent', () => {
  let component: CreatePeriodDialogComponent;
  let fixture: ComponentFixture<CreatePeriodDialogComponent>;
  let mockDialogRef: any;
  let mockAuthState: any;

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockAuthState = {
      dairyProfile: signal({ settlementStartDay: 'WEDNESDAY' }),
    };

    await TestBed.configureTestingModule({
      imports: [CreatePeriodDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: AuthStateService, useValue: mockAuthState },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreatePeriodDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default start date to a Wednesday when dairy profile specifies WEDNESDAY', () => {
    const val = component.form.get('periodStart')?.value;
    expect(val).toBeTruthy();
    const [y, m, d] = val.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    // 3 = Wednesday
    expect(date.getUTCDay()).toBe(3);
  });

  it('should calculate end date as 6 days after start date', () => {
    component.form.patchValue({ periodStart: '2026-09-02' });
    component.onStartDateChange();
    expect(component.calculatedEnd).toBe('2026-09-08');
  });

  it('should close with payload on confirm', () => {
    component.form.patchValue({ periodStart: '2026-09-02' });
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith({ periodStart: '2026-09-02' });
  });

  it('should close with null on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(null);
  });

  describe('calculateDefaultPeriodStart (pure algorithm)', () => {
    // 2026-09-03 is a Thursday
    const thursday = new Date(2026, 8, 3);

    it('calculates preceding or current Monday when startDay is MONDAY', () => {
      const start = calculateDefaultPeriodStart('MONDAY', thursday);
      expect(start).toBe('2026-08-31'); // 2026-08-31 was Monday
      const [y, m, d] = start.split('-').map(Number);
      expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(1);
    });

    it('calculates preceding Wednesday when startDay is WEDNESDAY', () => {
      const start = calculateDefaultPeriodStart('WEDNESDAY', thursday);
      expect(start).toBe('2026-09-02'); // 2026-09-02 was Wednesday
      const [y, m, d] = start.split('-').map(Number);
      expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(3);
    });

    it('calculates preceding Sunday when startDay is SUNDAY', () => {
      const start = calculateDefaultPeriodStart('SUNDAY', thursday);
      expect(start).toBe('2026-08-30'); // 2026-08-30 was Sunday
      const [y, m, d] = start.split('-').map(Number);
      expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(0);
    });

    it('calculates same day when baseDate is already the configured start day', () => {
      const wednesday = new Date(2026, 8, 2);
      const start = calculateDefaultPeriodStart('WEDNESDAY', wednesday);
      expect(start).toBe('2026-09-02');
    });
  });
});
