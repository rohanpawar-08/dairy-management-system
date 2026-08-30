import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DuplicateConfirmDialogComponent, DuplicateConfirmDialogData } from './duplicate-confirm-dialog.component';
import { I18nService } from '../../../core/services/i18n.service';

describe('DuplicateConfirmDialogComponent (Angular Unit)', () => {
  let dialogRefMock: any;

  const mockData: DuplicateConfirmDialogData = {
    memberCode: '001',
    farmerNameMr: 'गणेश पवार',
    farmerNameEn: 'Ganesh Pawar',
    milkType: 'COW',
    existingCollections: [
      {
        id: 1,
        receiptNumber: 'MC-20260901-M-000001',
        milkType: 'COW',
        quantityMl: 50000,
        quantityLitresFormatted: '50.000',
        fatX100: 400,
        snfX100: 850,
        amountPaise: 297500,
        createdAt: '2026-09-01T06:30:00Z',
      },
    ],
  };

  beforeEach(() => {
    dialogRefMock = {
      close: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [DuplicateConfirmDialogComponent, NoopAnimationsModule],
      providers: [
        I18nService,
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    });
  });

  it('1. Initializes form with SECOND_CAN default and submits confirmation payload', () => {
    const fixture = TestBed.createComponent(DuplicateConfirmDialogComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    expect(comp.form.get('reasonCode')?.value).toBe('SECOND_CAN');
    expect(comp.form.valid).toBe(true);

    comp.onConfirm();
    expect(dialogRefMock.close).toHaveBeenCalledWith({
      confirmed: true,
      duplicateReason: 'SECOND_CAN',
    });
  });

  it('2. Requires explanation when OTHER reason is selected', () => {
    const fixture = TestBed.createComponent(DuplicateConfirmDialogComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.form.patchValue({ reasonCode: 'OTHER' });
    comp.onReasonCodeChange();

    expect(comp.form.valid).toBe(false);

    comp.form.patchValue({ otherReasonText: 'संध्याकाळचा शिल्लक कॅन' });
    expect(comp.form.valid).toBe(true);

    comp.onConfirm();
    expect(dialogRefMock.close).toHaveBeenCalledWith({
      confirmed: true,
      duplicateReason: 'OTHER: संध्याकाळचा शिल्लक कॅन',
    });
  });
});
