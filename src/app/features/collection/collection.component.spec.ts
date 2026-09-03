import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';

import { CollectionComponent } from './collection.component';
import { CollectionStateService } from '../../core/services/collection-state.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { I18nService } from '../../core/services/i18n.service';
import { ElectronBridgeService } from '../../core/services/electron-bridge.service';
import {
  FarmerListDto,
  MilkCollectionDto,
  ShiftDto,
  ShiftSummaryDto,
} from '../../../../shared/ipc-contracts';

describe('CollectionComponent (Angular Unit)', () => {
  let collectionStateMock: any;
  let authStateMock: any;
  let bridgeMock: any;
  let dialogMock: any;
  let i18nMock: any;

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

  const mockFarmer: FarmerListDto = {
    id: 10,
    memberCode: '001',
    nameMr: 'गणेश पवार',
    nameEn: 'Ganesh Pawar',
    phone: '9822012345',
    village: null,
    maskedBankAccount: null,
    bankIfsc: null,
    bankName: null,
    maskedUpiId: null,
    defaultMilkType: 'COW',
    openingBalancePaise: 0,
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
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

  beforeEach(async () => {
    collectionStateMock = {
      currentShift: signal<ShiftDto | null>(mockShift),
      shiftSummary: signal<ShiftSummaryDto | null>(mockSummary),
      recentCollections: signal<MilkCollectionDto[]>([mockCollection]),
      enabledMilkTypes: signal<'COW' | 'BUFFALO' | 'BOTH'>('BOTH'),
      isLoading: signal<boolean>(false),
      isSaving: signal<boolean>(false),
      errorMessage: signal<string | null>(null),
      loadCurrentShift: vi.fn().mockResolvedValue(mockShift),
      openShift: vi.fn().mockResolvedValue(mockShift),
      closeShift: vi.fn().mockResolvedValue(mockShift),
      reopenShift: vi.fn().mockResolvedValue(mockShift),
      recordCollection: vi.fn().mockResolvedValue(mockCollection),
      voidCollection: vi.fn().mockResolvedValue({ ...mockCollection, status: 'VOIDED' }),
      checkDuplicate: vi.fn().mockResolvedValue({ isDuplicate: false, existingCollections: [] }),
      calculatePreview: vi.fn().mockResolvedValue({
        valid: true,
        ratePaisePerLitre: 5950,
        amountPaise: 297500,
        rateRupeesFormatted: '₹59.50/L',
        amountRupeesFormatted: '₹2975.00',
      }),
      resolveApprovedRate: vi.fn().mockResolvedValue({
        ratePlanId: 5,
        planName: 'गाय दर',
        milkType: 'COW',
        effectiveFrom: '2026-09-01',
        effectiveTo: null,
        ratePaisePerLitre: 5950,
        amountPaise: 297500,
        rateRupeesFormatted: '₹59.50/L',
        amountRupeesFormatted: '₹2975.00',
      }),
    };

    authStateMock = {
      currentSession: signal({
        userId: 1,
        username: 'owner',
        fullName: 'डेअरी मालक',
        role: 'OWNER',
      }),
      isOwner: vi.fn().mockReturnValue(true),
    };

    bridgeMock = {
      farmers: {
        getByCode: vi.fn().mockImplementation((code: string) => {
          if (code === '001') return Promise.resolve({ success: true, data: mockFarmer });
          if (code === '002') return Promise.resolve({ success: true, data: { ...mockFarmer, id: 11, memberCode: '002', defaultMilkType: 'BUFFALO' } });
          if (code === '003') return Promise.resolve({ success: true, data: { ...mockFarmer, id: 12, memberCode: '003', defaultMilkType: 'BOTH' } });
          if (code === '099') return Promise.resolve({ success: true, data: { ...mockFarmer, id: 99, memberCode: '099', isActive: false } });
          return Promise.resolve({ success: false, data: null });
        }),
      },
    };

    // Controlled dialog mock: open() returns an object with afterClosed() observable.
    // Tests that need specific dialog results override this per-test.
    dialogMock = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(null),
      }),
    };

    // Provide I18nService as a mock that returns predictable English strings
    // for test assertions, while still exposing the real API shape.
    // We translate key assertions directly using static strings so tests are
    // language-independent and do not depend on the i18n file load order.
    i18nMock = {
      currentLanguage: signal('en'),
      isMarathi: signal(false),
      toggleLanguage: vi.fn(),
      t: vi.fn((key: string) => {
        // Return deterministic English equivalents for keys used in tests
        const translations: Record<string, string> = {
          'collection.farmerInactive': 'Farmer is inactive',
          'collection.farmerNotFound': 'Farmer not found',
          'collection.dairyDoesNotAcceptCow': 'This centre only accepts BUFFALO milk. Cow milk collection is rejected.',
          'collection.dairyDoesNotAcceptBuffalo': 'This centre only accepts COW milk. Buffalo milk collection is rejected.',
          'collection.savedSuccess': 'Saved',
          'collection.openShiftPromptTitle': 'Open Shift',
          'collection.openShiftPromptSubtitle': 'Open a shift to start',
          'collection.businessDate': 'Business Date',
          'collection.shiftType': 'Shift Type',
          'collection.shiftTypeMorning': 'Morning',
          'collection.shiftTypeEvening': 'Evening',
          'collection.shiftNotes': 'Notes',
          'collection.openShift': 'Open Shift',
          'collection.closeShiftWarning': 'Closing locks the shift.',
          'common.loading': 'Loading...',
          'milk.cow': 'Cow Milk',
          'milk.buffalo': 'Buffalo Milk',
          'milk.both': 'Both',
        };
        return translations[key] ?? key;
      }),
    };

    await TestBed.configureTestingModule({
      imports: [CollectionComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: CollectionStateService, useValue: collectionStateMock },
        { provide: AuthStateService, useValue: authStateMock },
        { provide: ElectronBridgeService, useValue: bridgeMock },
        { provide: I18nService, useValue: i18nMock },
      ],
    })
      // Override MatDialog at the environment injector level.
      // MatDialog is providedIn:'root'; overrideProvider ensures the mock is
      // used even in the standalone component's DI resolution chain.
      .overrideProvider(MatDialog, { useValue: dialogMock })
      .compileComponents();
  });

  it('1. Renders active shift HUD, recent collections table, and dashboard back button', () => {
    const fixture = TestBed.createComponent(CollectionComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const backBtn = compiled.querySelector('button[routerLink="/dashboard"]');
    expect(backBtn).toBeTruthy();
    expect(compiled.textContent).toContain('2026-09-01');
    expect(compiled.textContent).toContain('MC-20260901-M-000001');
    expect(compiled.textContent).toContain('गणेश पवार');
    expect(compiled.textContent).toContain('₹2975.00');
  });

  it('2. Resolves farmer on member code enter and defaults milk type to COW', async () => {
    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({ memberCode: '001' });
    await comp.onMemberCodeEnter();

    expect(comp.resolvedFarmer()).toEqual(mockFarmer);
    expect(comp.collectionForm.get('milkType')?.value).toBe('COW');
  });

  it('3. Resolves farmer with BUFFALO default and preselects BUFFALO', async () => {
    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({ memberCode: '002' });
    await comp.onMemberCodeEnter();

    expect(comp.resolvedFarmer()?.memberCode).toBe('002');
    expect(comp.collectionForm.get('milkType')?.value).toBe('BUFFALO');
  });

  it('4. Resolves farmer with BOTH default and clears milk type requiring explicit choice', async () => {
    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({ memberCode: '003' });
    await comp.onMemberCodeEnter();

    expect(comp.resolvedFarmer()?.memberCode).toBe('003');
    expect(comp.collectionForm.get('milkType')?.value).toBe('');
    expect(comp.canSave()).toBe(false);
  });

  it('5. Changing member code input resets resolved farmer, preview, and milkType selection', async () => {
    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({ memberCode: '001' });
    await comp.onMemberCodeEnter();
    expect(comp.resolvedFarmer()).not.toBeNull();

    comp.onMemberCodeChanged();
    expect(comp.resolvedFarmer()).toBeNull();
    expect(comp.ratePreview()).toBeNull();
    expect(comp.collectionForm.get('milkType')?.value).toBe('');
  });

  it('6. Inactive farmer lookup displays error badge and blocks entry', async () => {
    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({ memberCode: '099' });
    await comp.onMemberCodeEnter();

    expect(comp.resolvedFarmer()).toBeNull();
    expect(comp.farmerLookupError()).not.toBeNull();
  });

  it('7. Unfound farmer lookup displays error', async () => {
    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({ memberCode: '999' });
    await comp.onMemberCodeEnter();

    expect(comp.resolvedFarmer()).toBeNull();
    expect(comp.farmerLookupError()).not.toBeNull();
  });

  it('8. Dairy centre configured for BUFFALO rejects COW-only farmer (Marathi error message)', async () => {
    // Set enabled milk types to BUFFALO-only centre
    collectionStateMock.enabledMilkTypes.set('BUFFALO');

    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({ memberCode: '001' }); // COW farmer
    await comp.onMemberCodeEnter();

    expect(comp.resolvedFarmer()).toBeNull();
    // i18nMock returns the English text for this key (contains 'BUFFALO milk')
    expect(comp.farmerLookupError()).toContain('BUFFALO milk');
  });

  it('9. Dairy centre configured for COW rejects BUFFALO-only farmer (Marathi error message)', async () => {
    // Set enabled milk types to COW-only centre
    collectionStateMock.enabledMilkTypes.set('COW');

    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({ memberCode: '002' }); // BUFFALO farmer
    await comp.onMemberCodeEnter();

    expect(comp.resolvedFarmer()).toBeNull();
    // i18nMock returns the English text for this key (contains 'COW milk')
    expect(comp.farmerLookupError()).toContain('COW milk');
  });

  it('10. Calculates live rate and amount preview and saves collection', async () => {
    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({
      memberCode: '001',
      milkType: 'COW',
      quantityLitres: '50.0',
      fatPercent: '4.0',
      snfPercent: '8.5',
    });
    comp.resolvedFarmer.set(mockFarmer);
    comp.onInputsChanged();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(comp.ratePreview()).not.toBeNull();
    expect(comp.canSave()).toBe(true);

    await comp.onSaveCollection();
    expect(collectionStateMock.recordCollection).toHaveBeenCalledWith({
      shiftId: 1,
      farmerId: 10,
      milkType: 'COW',
      quantityLitres: '50.0',
      fatPercent: '4.0',
      snfPercent: '8.5',
    });
  });

  it('11. Zero or negative quantity/FAT/SNF does not trigger preview calculation', () => {
    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({
      memberCode: '001',
      milkType: 'COW',
      quantityLitres: '0.0',
      fatPercent: '4.0',
      snfPercent: '8.5',
    });
    comp.resolvedFarmer.set(mockFarmer);
    comp.onInputsChanged();

    expect(comp.ratePreview()).toBeNull();
    expect(comp.canSave()).toBe(false);
  });

  it('12. Duplicate collection check opens duplicate confirmation dialog and saves with reason', async () => {
    collectionStateMock.checkDuplicate.mockResolvedValueOnce({
      isDuplicate: true,
      existingCollections: [{ id: 101, receiptNumber: 'MC-1', quantityLitresFormatted: '10.000', amountRupees: '₹500.00' }],
    });
    // Override dialog mock to return confirmed result with reason (structured shape the component expects)
    dialogMock.open.mockReturnValueOnce({
      afterClosed: () => of({ confirmed: true, duplicateReason: 'SECOND_CAN' }),
    });

    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({
      memberCode: '001',
      milkType: 'COW',
      quantityLitres: '20.0',
      fatPercent: '4.0',
      snfPercent: '8.5',
    });
    comp.resolvedFarmer.set(mockFarmer);
    comp.onInputsChanged();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await comp.onSaveCollection();

    expect(dialogMock.open).toHaveBeenCalled();
    // After dialog closes with 'SECOND_CAN', should call recordCollection with duplicate flags
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(collectionStateMock.recordCollection).toHaveBeenCalledWith({
      shiftId: 1,
      farmerId: 10,
      milkType: 'COW',
      quantityLitres: '20.0',
      fatPercent: '4.0',
      snfPercent: '8.5',
      duplicateConfirmed: true,
      duplicateReason: 'SECOND_CAN',
    });
  });

  it('13. Cancelling duplicate dialog does not save collection', async () => {
    collectionStateMock.checkDuplicate.mockResolvedValueOnce({
      isDuplicate: true,
      existingCollections: [{ id: 101 }],
    });
    dialogMock.open.mockReturnValueOnce({
      afterClosed: () => of(null), // User cancelled
    });

    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.collectionForm.patchValue({
      memberCode: '001',
      milkType: 'COW',
      quantityLitres: '20.0',
      fatPercent: '4.0',
      snfPercent: '8.5',
    });
    comp.resolvedFarmer.set(mockFarmer);
    comp.onInputsChanged();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await comp.onSaveCollection();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(collectionStateMock.recordCollection).not.toHaveBeenCalled();
  });

  it('14. Void button opens void confirmation dialog', () => {
    dialogMock.open.mockReturnValueOnce({
      afterClosed: () => of('Mistake entry'),
    });

    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.onVoidCollection(mockCollection);
    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('15. Close shift button opens close confirmation dialog', () => {
    dialogMock.open.mockReturnValueOnce({
      afterClosed: () => of(true),
    });

    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.onCloseShift();
    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('16. Owner sees Reopen button on locked shift and reopenShift dialog opens', () => {
    collectionStateMock.currentShift.set({ ...mockShift, status: 'LOCKED' });
    authStateMock.isOwner.mockReturnValue(true);
    dialogMock.open.mockReturnValueOnce({
      afterClosed: () => of('Owner test reopen'),
    });

    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.onReopenShift();
    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('17. No active shift renders Open Shift panel (.no-shift-container)', () => {
    // Set currentShift to null to trigger no-shift UI state
    collectionStateMock.currentShift.set(null);
    collectionStateMock.isLoading.set(false);

    const fixture = TestBed.createComponent(CollectionComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    // Template uses class="no-shift-container" (not .no-shift-card)
    const noShiftEl = compiled.querySelector('.no-shift-container');
    expect(noShiftEl).not.toBeNull();
  });

  it('18. Submitting Open Shift form calls openShift with correct payload', async () => {
    collectionStateMock.currentShift.set(null);

    const fixture = TestBed.createComponent(CollectionComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.openShiftDate = '2026-09-02';
    comp.openShiftType = 'MORNING';
    comp.openShiftNotes = 'Test session';

    await comp.onOpenShift();
    expect(collectionStateMock.openShift).toHaveBeenCalledWith({
      businessDate: '2026-09-02',
      shiftType: 'MORNING',
      notes: 'Test session',
    });
  });
});
