import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoidCollectionDialogComponent, VoidCollectionDialogData } from './void-collection-dialog.component';
import { I18nService } from '../../../core/services/i18n.service';
import { MilkCollectionDto } from '../../../../../shared/ipc-contracts';

describe('VoidCollectionDialogComponent (Angular Unit)', () => {
  let dialogRefMock: any;

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

  beforeEach(() => {
    dialogRefMock = {
      close: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [VoidCollectionDialogComponent, NoopAnimationsModule],
      providers: [
        I18nService,
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: { collection: mockCollection } },
      ],
    });
  });

  it('1. Requires mandatory cancellation reason and blocks submission when empty', () => {
    const fixture = TestBed.createComponent(VoidCollectionDialogComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    expect(comp.form.valid).toBe(false);

    comp.form.patchValue({ reason: 'ab' }); // less than 3 chars
    expect(comp.form.valid).toBe(false);

    comp.form.patchValue({ reason: 'चुकीचे वजन टाकले' });
    expect(comp.form.valid).toBe(true);

    comp.onConfirm();
    expect(dialogRefMock.close).toHaveBeenCalledWith({
      collectionId: 101,
      reason: 'चुकीचे वजन टाकले',
    });
  });
});
