import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RatePlanFormDialogComponent,
  RatePlanFormDialogData,
} from './rate-plan-form-dialog.component';
import { RatePlanStateService } from '../../../core/services/rate-plan-state.service';
import { I18nService } from '../../../core/services/i18n.service';
import { RatePlanDto } from '../../../../../shared/ipc-contracts';

describe('RatePlanFormDialogComponent (Angular Unit)', () => {
  let mockDialogRef: any;
  let mockRatePlanState: any;
  let mockI18n: any;

  const mockApprovedPlan: RatePlanDto = {
    id: 1,
    planName: 'गाय दरपत्रक',
    milkType: 'COW',
    strategyType: 'FORMULA',
    pricingBasis: 'PER_PERCENT_POINT_PER_LITRE',
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    status: 'APPROVED',
    roundingMode: 'ROUND_HALF_UP',
    notes: 'Approved notes',
    parameters: {
      fatRatePaisePerPoint: 850,
      snfRatePaisePerPoint: 300,
      minimumFatX100: 300,
      maximumFatX100: 600,
      fatStepX100: 10,
      minimumSnfX100: 750,
      maximumSnfX100: 950,
      snfStepX100: 10,
    },
    createdByUserId: 1,
    approvedByUserId: 1,
    approvedAt: '2026-09-01T00:00:00Z',
    cancelledByUserId: null,
    cancelledByName: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    lifecycleState: 'CURRENT',
  };

  const createDialogData: RatePlanFormDialogData = {
    mode: 'create',
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockRatePlanState = {
      createDraft: vi.fn().mockResolvedValue(mockApprovedPlan),
      updateDraft: vi.fn().mockResolvedValue(mockApprovedPlan),
    };

    mockI18n = {
      translate: vi.fn((key: string) => key),
    };

    await TestBed.configureTestingModule({
      imports: [RatePlanFormDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: createDialogData },
        { provide: RatePlanStateService, useValue: mockRatePlanState },
        { provide: I18nService, useValue: mockI18n },
      ],
    }).compileComponents();
  });

  it('initializes in create mode with empty form and no prefilled test reference coefficients', () => {
    const fixture = TestBed.createComponent(RatePlanFormDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.planForm.valid).toBe(false);
    expect(component.planForm.get('planName')?.value).toBe('');
    expect(component.planForm.get('fatRateRupees')?.value).toBe('');
    expect(component.planForm.get('snfRateRupees')?.value).toBe('');
    expect(component.planForm.get('minimumFatPercent')?.value).toBe('');
    expect(component.planForm.get('maximumFatPercent')?.value).toBe('');
  });

  it('validates and submits create-draft converting ₹ strings to integer paise and percents to x100 integers', async () => {
    const fixture = TestBed.createComponent(RatePlanFormDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.planForm.patchValue({
      planName: 'नवीन गाय दरपत्रक',
      milkType: 'COW',
      effectiveFrom: '2026-10-01',
      fatRateRupees: '8.50',
      snfRateRupees: '3.00',
      minimumFatPercent: '3.00',
      maximumFatPercent: '6.00',
      fatStepPercent: '0.10',
      minimumSnfPercent: '7.50',
      maximumSnfPercent: '9.50',
      snfStepPercent: '0.10',
      notes: 'नवीन दर नोंद',
    });

    expect(component.planForm.valid).toBe(true);

    await component.savePlan();

    expect(mockRatePlanState.createDraft).toHaveBeenCalledWith({
      planName: 'नवीन गाय दरपत्रक',
      milkType: 'COW',
      effectiveFrom: '2026-10-01',
      effectiveTo: null,
      notes: 'नवीन दर नोंद',
      parameters: {
        fatRatePaisePerPoint: 850,
        snfRatePaisePerPoint: 300,
        minimumFatX100: 300,
        maximumFatX100: 600,
        fatStepX100: 10,
        minimumSnfX100: 750,
        maximumSnfX100: 950,
        snfStepX100: 10,
      },
    });
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });
});
