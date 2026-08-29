import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RatePlanCloneDialogComponent,
  RatePlanCloneDialogData,
} from './rate-plan-clone-dialog.component';
import { RatePlanStateService } from '../../../core/services/rate-plan-state.service';
import { I18nService } from '../../../core/services/i18n.service';
import { RatePlanDto } from '../../../../../shared/ipc-contracts';

describe('RatePlanCloneDialogComponent (Angular Unit)', () => {
  let mockDialogRef: any;
  let mockRatePlanState: any;
  let mockI18n: any;

  const mockSourcePlan: RatePlanDto = {
    id: 1,
    planName: 'गाय दरपत्रक',
    milkType: 'COW',
    strategyType: 'FORMULA',
    pricingBasis: 'PER_PERCENT_POINT_PER_LITRE',
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    status: 'APPROVED',
    roundingMode: 'ROUND_HALF_UP',
    notes: 'मूळ नोंद',
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

  const cloneDialogData: RatePlanCloneDialogData = {
    sourcePlan: mockSourcePlan,
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockRatePlanState = {
      clonePlan: vi.fn().mockResolvedValue({ ...mockSourcePlan, id: 2, status: 'DRAFT' }),
    };

    mockI18n = {
      translate: vi.fn((key: string) => key),
    };

    await TestBed.configureTestingModule({
      imports: [RatePlanCloneDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: cloneDialogData },
        { provide: RatePlanStateService, useValue: mockRatePlanState },
        { provide: I18nService, useValue: mockI18n },
      ],
    }).compileComponents();
  });

  it('initializes clone dialog with source plan values and requires a new effective date', () => {
    const fixture = TestBed.createComponent(RatePlanCloneDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.cloneForm.get('newPlanName')?.value).toContain('गाय दरपत्रक');
    expect(component.cloneForm.get('newEffectiveFrom')?.value).toBe('');
    expect(component.cloneForm.valid).toBe(false);
  });

  it('submits clone payload and closes dialog on success', async () => {
    const fixture = TestBed.createComponent(RatePlanCloneDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.cloneForm.patchValue({
      newPlanName: 'गाय दरपत्रक (ऑक्टोबर)',
      newEffectiveFrom: '2026-10-01',
      fatRateRupees: '8.60',
      snfRateRupees: '3.10',
      notes: 'नवीन ऑक्टोबर दर',
    });

    expect(component.cloneForm.valid).toBe(true);

    await component.submitClone();

    expect(mockRatePlanState.clonePlan).toHaveBeenCalledWith({
      sourcePlanId: 1,
      newPlanName: 'गाय दरपत्रक (ऑक्टोबर)',
      newEffectiveFrom: '2026-10-01',
      newEffectiveTo: null,
      notes: 'नवीन ऑक्टोबर दर',
      parameters: {
        fatRatePaisePerPoint: 860,
        snfRatePaisePerPoint: 310,
      },
    });
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });
});
