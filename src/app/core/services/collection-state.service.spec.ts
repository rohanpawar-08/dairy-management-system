import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollectionStateService } from './collection-state.service';
import { ElectronBridgeService } from './electron-bridge.service';
import { MilkCollectionDto, SetupStatusResult, ShiftDto, ShiftSummaryDto } from '../../../../shared/ipc-contracts';

describe('CollectionStateService (Angular Unit)', () => {
  let service: CollectionStateService;
  let bridgeMock: any;

  const mockShift: ShiftDto = {
    id: 1,
    businessDate: '2026-09-01',
    shiftType: 'MORNING',
    status: 'OPEN',
    openedByUserId: 1,
    openedByName: 'Admin',
    openedAt: '2026-09-01T06:00:00Z',
    closedByUserId: null,
    closedByName: null,
    closedAt: null,
    reopenedByUserId: null,
    reopenedByName: null,
    reopenedAt: null,
    reopenReason: null,
    reopenCount: 0,
    notes: null,
    createdAt: '2026-09-01T06:00:00Z',
    updatedAt: '2026-09-01T06:00:00Z',
  };

  const mockSummary: ShiftSummaryDto = {
    shiftId: 1,
    businessDate: '2026-09-01',
    shiftType: 'MORNING',
    status: 'OPEN',
    totalActiveCollections: 1,
    uniqueFarmersCount: 1,
    cowQuantityMl: 50000,
    cowAmountPaise: 297500,
    buffaloQuantityMl: 0,
    buffaloAmountPaise: 0,
    totalQuantityMl: 50000,
    totalAmountPaise: 297500,
    totalVoidedCollections: 0,
    cowLitresFormatted: '50.000',
    cowAmountFormatted: '₹2975.00',
    buffaloLitresFormatted: '0.000',
    buffaloAmountFormatted: '₹0.00',
    totalLitresFormatted: '50.000',
    totalAmountFormatted: '₹2975.00',
  };

  const mockCollection: MilkCollectionDto = {
    id: 101,
    receiptNumber: 'MC-20260901-M-000001',
    shiftId: 1,
    farmerId: 10,
    farmerMemberCode: '001',
    farmerNameMr: 'गणेश पवार',
    farmerNameEn: 'Ganesh Pawar',
    businessDate: '2026-09-01',
    shiftType: 'MORNING',
    milkType: 'COW',
    quantityMl: 50000,
    quantityLitresFormatted: '50.000',
    fatX100: 400,
    fatFormatted: '4.00%',
    snfX100: 850,
    snfFormatted: '8.50%',
    ratePlanId: 5,
    ratePlanName: 'गाय दर',
    rateAppliedPaise: 5950,
    rateRupeesFormatted: '₹59.50/L',
    amountPaise: 297500,
    amountRupeesFormatted: '₹2975.00',
    duplicateConfirmed: false,
    duplicateReason: null,
    status: 'ACTIVE',
    voidedAt: null,
    voidedByUserId: null,
    voidedByName: null,
    voidReason: null,
    createdByUserId: 1,
    createdByName: 'Admin',
    createdAt: '2026-09-01T06:30:00Z',
    updatedAt: '2026-09-01T06:30:00Z',
  };

  /** Build a fresh mock bridge that matches the current ElectronBridgeService API. */
  function buildBridgeMock() {
    const setupStatus: SetupStatusResult = {
      state: 'READY',
      dairyProfile: {
        centreName: 'Test Dairy',
        registrationCode: 'REG001',
        addressLine: 'Test Address',
        ownerName: 'Test Owner',
        phonePrimary: '9999999999',
        defaultLanguage: 'mr',
        settlementStartDay: 'MONDAY',
        enabledMilkTypes: 'BOTH',
      },
      hasOwner: true,
    };

    return {
      // top-level method used by loadCurrentShift()
      getSetupStatus: vi.fn().mockResolvedValue({ success: true, data: setupStatus }),

      shifts: {
        getCurrent: vi.fn().mockResolvedValue({ success: true, data: mockShift }),
        getSummary: vi.fn().mockResolvedValue({ success: true, data: mockSummary }),
        open: vi.fn().mockResolvedValue({ success: true, data: mockShift }),
        close: vi.fn().mockResolvedValue({ success: true, data: { ...mockShift, status: 'LOCKED' } }),
        reopen: vi.fn().mockResolvedValue({ success: true, data: mockShift }),
      },
      collections: {
        create: vi.fn().mockResolvedValue({ success: true, data: mockCollection }),
        listByShift: vi.fn().mockResolvedValue({ success: true, data: [mockCollection] }),
        void: vi.fn().mockResolvedValue({ success: true, data: { ...mockCollection, status: 'VOIDED' } }),
        checkDuplicate: vi.fn().mockResolvedValue({ success: true, data: { isDuplicate: false, existingCollections: [] } }),
      },
      ratePlans: {
        calculatePreview: vi.fn().mockResolvedValue({
          success: true,
          data: {
            ratePlanId: 5,
            ratePlanName: 'गाय दर',
            milkType: 'COW',
            fatRatePaisePerPoint: 850,
            snfRatePaisePerPoint: 300,
            ratePaisePerLitre: 5950,
            ratePerLitreFormatted: '59.50',
            amountPaise: 297500,
            amountFormatted: '2975.00',
          },
        }),
        resolveApprovedRate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            ratePlanId: 5,
            planName: 'गाय दर',
            milkType: 'COW',
            effectiveFrom: '2026-09-01',
            effectiveTo: null,
            ratePaisePerLitre: 5950,
            ratePerLitreFormatted: '59.50',
            amountPaise: 297500,
            amountFormatted: '2975.00',
          },
        }),
      },
    };
  }

  beforeEach(() => {
    bridgeMock = buildBridgeMock();

    TestBed.configureTestingModule({
      providers: [
        CollectionStateService,
        { provide: ElectronBridgeService, useValue: bridgeMock },
      ],
    });

    service = TestBed.inject(CollectionStateService);
  });

  it('1. Loads current shift, summary, and recent collections into reactive signals', async () => {
    const shift = await service.loadCurrentShift();

    expect(shift).toEqual(mockShift);
    expect(service.currentShift()).toEqual(mockShift);
    expect(service.shiftSummary()).toEqual(mockSummary);
    expect(service.recentCollections().length).toBe(1);
    expect(service.recentCollections()[0].receiptNumber).toBe('MC-20260901-M-000001');
  });

  it('2. Records new collection with in-flight protection and updates recent collections', async () => {
    // First load shift so recentCollections has [mockCollection]
    await service.loadCurrentShift();
    expect(service.recentCollections().length).toBe(1);

    const newCol: MilkCollectionDto = {
      ...mockCollection,
      id: 102,
      receiptNumber: 'MC-20260901-M-000002',
    };
    bridgeMock.collections.create.mockResolvedValueOnce({ success: true, data: newCol });

    const created = await service.recordCollection({
      shiftId: 1,
      farmerId: 10,
      milkType: 'COW',
      quantityLitres: '25.000',
      fatPercent: '4.00',
      snfPercent: '8.50',
    });

    expect(created.receiptNumber).toBe('MC-20260901-M-000002');
    // Should be prepended: [new, old]
    expect(service.recentCollections().length).toBe(2);
    expect(service.recentCollections()[0].receiptNumber).toBe('MC-20260901-M-000002');
  });

  it('3. Voids collection and updates signal state', async () => {
    // First load shift so recentCollections has [mockCollection]
    await service.loadCurrentShift();
    expect(service.recentCollections()[0].id).toBe(101);

    const voided = await service.voidCollection({ collectionId: 101, reason: 'Test void' });
    expect(voided.status).toBe('VOIDED');

    // The item at id=101 should be updated in-place
    const updated = service.recentCollections().find((c) => c.id === 101);
    expect(updated?.status).toBe('VOIDED');
  });

  it('4. In-flight protection prevents concurrent saves', async () => {
    await service.loadCurrentShift();

    // Start first save - don't await yet
    const first = service.recordCollection({
      shiftId: 1,
      farmerId: 10,
      milkType: 'COW',
      quantityLitres: '10.000',
      fatPercent: '4.00',
      snfPercent: '8.50',
    });

    // Second save while first is in flight must throw
    await expect(
      service.recordCollection({
        shiftId: 1,
        farmerId: 10,
        milkType: 'COW',
        quantityLitres: '10.000',
        fatPercent: '4.00',
        snfPercent: '8.50',
      })
    ).rejects.toThrow('Save already in flight');

    await first;
  });

  it('5. loadCurrentShift with no open shift sets currentShift to null and clears lists', async () => {
    bridgeMock.shifts.getCurrent.mockResolvedValueOnce({ success: true, data: null });

    const shift = await service.loadCurrentShift();
    expect(shift).toBeNull();
    expect(service.currentShift()).toBeNull();
    expect(service.shiftSummary()).toBeNull();
    expect(service.recentCollections().length).toBe(0);
  });

  it('6. loadCurrentShift error sets errorMessage', async () => {
    bridgeMock.shifts.getCurrent.mockResolvedValueOnce({
      success: false,
      error: { code: 'ERR', messageEn: 'Shift load failed', messageMr: 'शिफ्ट लोड अयशस्वी' },
    });

    const shift = await service.loadCurrentShift();
    expect(shift).toBeNull();
    expect(service.errorMessage()).toBeTruthy();
  });

  it('7. enabledMilkTypes signal is populated from dairy setup profile', async () => {
    bridgeMock.getSetupStatus.mockResolvedValueOnce({
      success: true,
      data: {
        state: 'READY',
        dairyProfile: { enabledMilkTypes: 'COW' },
        hasOwner: true,
      },
    });

    await service.loadCurrentShift();
    expect(service.enabledMilkTypes()).toBe('COW');
  });
});
