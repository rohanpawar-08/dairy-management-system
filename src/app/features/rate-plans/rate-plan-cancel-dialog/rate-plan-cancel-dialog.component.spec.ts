import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RatePlanCancelDialogComponent,
  RatePlanCancelDialogData,
} from './rate-plan-cancel-dialog.component';
import { RatePlanStateService } from '../../../core/services/rate-plan-state.service';
import { I18nService } from '../../../core/services/i18n.service';
import { RatePlanDto } from '../../../../../shared/ipc-contracts';

describe('RatePlanCancelDialogComponent (Angular Unit)', () => {
  let mockDialogRef: any;
  let mockRatePlanState: any;
  let mockI18n: any;

  const mockPlanToCancel: RatePlanDto = {
    id: 3,
    planName: 'रद्द करावयाचे दरपत्रक',
    milkType: 'COW',
    strategyType: 'FORMULA',
    pricingBasis: 'PER_PERCENT_POINT_PER_LITRE',
    effectiveFrom: '2026-11-01',
    effectiveTo: null,
    status: 'DRAFT',
    roundingMode: 'ROUND_HALF_UP',
    notes: null,
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
    approvedByUserId: null,
    approvedAt: null,
    cancelledByUserId: null,
    cancelledByName: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    lifecycleState: 'DRAFT',
  };

  const cancelDialogData: RatePlanCancelDialogData = {
    plan: mockPlanToCancel,
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockRatePlanState = {
      cancelPlan: vi.fn().mockResolvedValue({
        ...mockPlanToCancel,
        status: 'CANCELLED',
        cancellationReason: 'चुकीचे दर',
      }),
    };

    mockI18n = {
      translate: vi.fn((key: string) => key),
    };

    await TestBed.configureTestingModule({
      imports: [RatePlanCancelDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: cancelDialogData },
        { provide: RatePlanStateService, useValue: mockRatePlanState },
        { provide: I18nService, useValue: mockI18n },
      ],
    }).compileComponents();
  });

  it('requires a mandatory cancellation reason and blocks submission when empty', async () => {
    const fixture = TestBed.createComponent(RatePlanCancelDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.cancelForm.valid).toBe(false);

    await component.confirmCancel();
    expect(mockRatePlanState.cancelPlan).not.toHaveBeenCalled();
  });

  it('submits cancellation with reason and closes dialog on success', async () => {
    const fixture = TestBed.createComponent(RatePlanCancelDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.cancelForm.patchValue({
      reason: 'चुकीचे दर नमूद केल्यामुळे रद्द केले.',
    });

    expect(component.cancelForm.valid).toBe(true);

    await component.confirmCancel();

    expect(mockRatePlanState.cancelPlan).toHaveBeenCalledWith(
      3,
      'चुकीचे दर नमूद केल्यामुळे रद्द केले.'
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });
});
