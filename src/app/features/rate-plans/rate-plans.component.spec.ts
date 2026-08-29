import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RatePlansComponent } from './rate-plans.component';
import { RatePlanStateService } from '../../core/services/rate-plan-state.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { I18nService } from '../../core/services/i18n.service';
import { RatePlanDto } from '../../../../shared/ipc-contracts';

describe('RatePlansComponent (Angular Unit)', () => {
  let ratePlanStateMock: any;
  let authStateMock: any;
  let i18nMock: any;
  let routerMock: any;

  const mockApprovedCowPlan: RatePlanDto = {
    id: 1,
    planName: 'गाय दरपत्रक',
    milkType: 'COW',
    strategyType: 'FORMULA',
    pricingBasis: 'PER_PERCENT_POINT_PER_LITRE',
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    status: 'APPROVED',
    roundingMode: 'ROUND_HALF_UP',
    notes: 'चाचणी नोंद',
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

  const mockDraftCowPlan: RatePlanDto = {
    id: 2,
    planName: 'गाय दरपत्रक (मसुदा)',
    milkType: 'COW',
    strategyType: 'FORMULA',
    pricingBasis: 'PER_PERCENT_POINT_PER_LITRE',
    effectiveFrom: '2026-10-01',
    effectiveTo: null,
    status: 'DRAFT',
    roundingMode: 'ROUND_HALF_UP',
    notes: null,
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

  beforeEach(async () => {
    ratePlanStateMock = {
      plans: signal([mockApprovedCowPlan, mockDraftCowPlan]),
      isLoading: signal(false),
      errorMessage: signal(null),
      currentCowPlan: signal(mockApprovedCowPlan),
      currentBuffaloPlan: signal(null),
      upcomingCowPlan: signal(null),
      upcomingBuffaloPlan: signal(null),
      hasMissingApprovedRate: signal(true),
      loadPlans: vi.fn().mockResolvedValue(undefined),
      calculatePreview: vi.fn().mockResolvedValue({
        valid: true,
        ratePaisePerLitre: 5950,
        amountPaise: 59500,
        rateRupeesFormatted: '₹59.50/L',
        amountRupeesFormatted: '₹595.00',
      }),
    };

    authStateMock = {
      isOwner: signal(true),
      currentSession: signal({ userId: 1, username: 'owner', role: 'OWNER', fullName: 'Owner' }),
    };

    i18nMock = {
      isMarathi: signal(true),
      currentLanguage: signal('mr'),
      toggleLanguage: vi.fn(),
      translate: vi.fn((key: string) => {
        if (key === 'rates.title') return 'दरपत्रक व्यवस्थापन';
        if (key === 'milk.cow') return 'गाय दूध';
        if (key === 'milk.buffalo') return 'म्हैस दूध';
        if (key === 'rates.noApprovedWarning') return 'दरपत्रक मंजूर नाही';
        return key;
      }),
    };

    routerMock = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [RatePlansComponent, NoopAnimationsModule],
      providers: [
        { provide: RatePlanStateService, useValue: ratePlanStateMock },
        { provide: AuthStateService, useValue: authStateMock },
        { provide: I18nService, useValue: i18nMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();
  });

  it('renders rate plans list, summary cards, and missing approved rate warning banner', () => {
    const fixture = TestBed.createComponent(RatePlansComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('गाय दरपत्रक');
    expect(compiled.textContent).toContain('rates.missingApprovedRatesTitle');
    expect(ratePlanStateMock.loadPlans).toHaveBeenCalled();
  });

  it('runs rate calculator and displays exact preview result', async () => {
    const fixture = TestBed.createComponent(RatePlansComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.calculatorForm.patchValue({
      milkType: 'COW',
      fatPercent: '4.00',
      snfPercent: '8.50',
      quantityLitres: '10.0',
    });

    await component.runCalculator();

    expect(ratePlanStateMock.calculatePreview).toHaveBeenCalled();
    expect(component.previewResult()?.valid).toBe(true);
    expect(component.previewResult()?.ratePaisePerLitre).toBe(5950);
  });

  it('opens create rate plan dialog', () => {
    const fixture = TestBed.createComponent(RatePlansComponent);
    const component = fixture.componentInstance;
    const dialog = (component as any).dialog;
    const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({
      afterClosed: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    } as any);

    component.openCreateDialog();

    expect(openSpy).toHaveBeenCalled();
  });

  it('opens edit dialog for DRAFT plan', () => {
    const fixture = TestBed.createComponent(RatePlansComponent);
    const component = fixture.componentInstance;
    const dialog = (component as any).dialog;
    const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({
      afterClosed: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    } as any);

    component.openEditDialog(mockDraftCowPlan);

    expect(openSpy).toHaveBeenCalled();
  });

  it('opens clone dialog for plan', () => {
    const fixture = TestBed.createComponent(RatePlansComponent);
    const component = fixture.componentInstance;
    const dialog = (component as any).dialog;
    const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({
      afterClosed: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    } as any);

    component.openCloneDialog(mockApprovedCowPlan);

    expect(openSpy).toHaveBeenCalled();
  });
});
