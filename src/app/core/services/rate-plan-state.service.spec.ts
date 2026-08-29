import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RatePlanStateService } from './rate-plan-state.service';
import { ElectronBridgeService } from './electron-bridge.service';
import { RatePlanDto } from '../../../../shared/ipc-contracts';

describe('RatePlanStateService', () => {
  let service: RatePlanStateService;
  let bridgeMock: any;

  const mockCowPlan: RatePlanDto = {
    id: 1,
    planName: 'Cow Active Plan',
    milkType: 'COW',
    strategyType: 'FORMULA',
    pricingBasis: 'PER_PERCENT_POINT_PER_LITRE',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    status: 'APPROVED',
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
    approvedByUserId: 1,
    approvedAt: '2026-01-01T00:00:00Z',
    cancelledByUserId: null,
    cancelledByName: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    lifecycleState: 'CURRENT',
  };

  beforeEach(() => {
    bridgeMock = {
      ratePlans: {
        list: vi.fn().mockResolvedValue({ success: true, data: [mockCowPlan] }),
        getById: vi.fn().mockResolvedValue({ success: true, data: mockCowPlan }),
        createDraft: vi.fn().mockResolvedValue({ success: true, data: mockCowPlan }),
        updateDraft: vi.fn().mockResolvedValue({ success: true, data: mockCowPlan }),
        clone: vi.fn().mockResolvedValue({ success: true, data: mockCowPlan }),
        approve: vi.fn().mockResolvedValue({ success: true, data: mockCowPlan }),
        supersede: vi.fn().mockResolvedValue({ success: true, data: { oldPlan: mockCowPlan, newPlan: mockCowPlan } }),
        cancel: vi.fn().mockResolvedValue({ success: true, data: mockCowPlan }),
        calculatePreview: vi.fn().mockResolvedValue({
          success: true,
          data: {
            valid: true,
            ratePaisePerLitre: 5950,
            rateRupeesFormatted: '₹59.50/L',
          },
        }),
        resolveApprovedRate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            ratePlanId: 1,
            planName: 'Cow Active Plan',
            milkType: 'COW',
            effectiveFrom: '2026-01-01',
            effectiveTo: null,
            ratePaisePerLitre: 5950,
            rateRupeesFormatted: '₹59.50/L',
          },
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        RatePlanStateService,
        { provide: ElectronBridgeService, useValue: bridgeMock },
      ],
    });

    service = TestBed.inject(RatePlanStateService);
  });

  it('loads rate plans and updates currentCowPlan computed signal', async () => {
    await service.loadPlans();

    expect(bridgeMock.ratePlans.list).toHaveBeenCalled();
    expect(service.plans()).toHaveLength(1);
    expect(service.currentCowPlan()?.id).toBe(1);
    expect(service.currentBuffaloPlan()).toBeNull();
    expect(service.hasMissingApprovedRate()).toBe(true); // Buffalo missing
  });

  it('handles preview calculation through electron bridge', async () => {
    const preview = await service.calculatePreview({
      planId: 1,
      milkType: 'COW',
      fatX100: 400,
      snfX100: 850,
    });

    expect(preview.valid).toBe(true);
    expect(preview.ratePaisePerLitre).toBe(5950);
  });
});
