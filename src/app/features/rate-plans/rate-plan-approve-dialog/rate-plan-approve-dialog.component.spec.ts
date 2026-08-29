import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RatePlanApproveDialogComponent,
  RatePlanApproveDialogData,
} from './rate-plan-approve-dialog.component';
import { RatePlanStateService } from '../../../core/services/rate-plan-state.service';
import { I18nService } from '../../../core/services/i18n.service';
import { RatePlanDto } from '../../../../../shared/ipc-contracts';

describe('RatePlanApproveDialogComponent (Angular Unit)', () => {
  let mockDialogRef: any;
  let mockRatePlanState: any;
  let mockI18n: any;

  const mockDraftPlan: RatePlanDto = {
    id: 2,
    planName: 'नवीन गाय दरपत्रक',
    milkType: 'COW',
    strategyType: 'FORMULA',
    pricingBasis: 'PER_PERCENT_POINT_PER_LITRE',
    effectiveFrom: '2026-10-01',
    effectiveTo: null,
    status: 'DRAFT',
    roundingMode: 'ROUND_HALF_UP',
    notes: 'चाचणी मसुदा',
    parameters: {
      fatRatePaisePerPoint: 860,
      snfRatePaisePerPoint: 310,
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

  const mockActivePlan: RatePlanDto = {
    id: 1,
    planName: 'सध्याचे गाय दरपत्रक',
    milkType: 'COW',
    strategyType: 'FORMULA',
    pricingBasis: 'PER_PERCENT_POINT_PER_LITRE',
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    status: 'APPROVED',
    roundingMode: 'ROUND_HALF_UP',
    notes: 'सध्याचे दर',
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

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockRatePlanState = {
      approvePlan: vi.fn().mockResolvedValue({ ...mockDraftPlan, status: 'APPROVED' }),
      supersedePlan: vi.fn().mockResolvedValue({
        oldPlan: { ...mockActivePlan, effectiveTo: '2026-09-30' },
        newPlan: { ...mockDraftPlan, status: 'APPROVED' },
      }),
    };

    mockI18n = {
      translate: vi.fn((key: string) => key),
    };
  });

  it('renders approval dialog for standalone approval with formula parameters and date range', async () => {
    const dialogData: RatePlanApproveDialogData = {
      plan: mockDraftPlan,
      conflictingPlan: null,
    };

    await TestBed.configureTestingModule({
      imports: [RatePlanApproveDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: RatePlanStateService, useValue: mockRatePlanState },
        { provide: I18nService, useValue: mockI18n },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RatePlanApproveDialogComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('नवीन गाय दरपत्रक');
    expect(compiled.textContent).toContain('2026-10-01');

    const component = fixture.componentInstance;
    await component.confirmApproval();

    expect(mockRatePlanState.approvePlan).toHaveBeenCalledWith(2);
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });

  it('renders supersede alert and invokes supersedePlan when a conflicting plan exists', async () => {
    const dialogData: RatePlanApproveDialogData = {
      plan: mockDraftPlan,
      conflictingPlan: mockActivePlan,
    };

    await TestBed.configureTestingModule({
      imports: [RatePlanApproveDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: RatePlanStateService, useValue: mockRatePlanState },
        { provide: I18nService, useValue: mockI18n },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RatePlanApproveDialogComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('सध्याचे गाय दरपत्रक');

    const component = fixture.componentInstance;
    await component.confirmApproval();

    expect(mockRatePlanState.supersedePlan).toHaveBeenCalledWith({
      oldPlanId: 1,
      newPlanId: 2,
      newEffectiveFrom: '2026-10-01',
    });
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });
});
