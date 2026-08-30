import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CloseShiftDialogComponent, CloseShiftDialogData } from './close-shift-dialog.component';
import { I18nService } from '../../../core/services/i18n.service';
import { ShiftDto, ShiftSummaryDto } from '../../../../../shared/ipc-contracts';

describe('CloseShiftDialogComponent (Angular Unit)', () => {
  let dialogRefMock: any;

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
    totalActiveCollections: 10,
    uniqueFarmersCount: 8,
    cowQuantityMl: 500000,
    cowAmountPaise: 2975000,
    buffaloQuantityMl: 300000,
    buffaloAmountPaise: 2700000,
    totalQuantityMl: 800000,
    totalAmountPaise: 5675000,
    totalVoidedCollections: 1,
    cowLitresFormatted: '500.000',
    cowAmountFormatted: '₹29,750.00',
    buffaloLitresFormatted: '300.000',
    buffaloAmountFormatted: '₹27,000.00',
    totalLitresFormatted: '800.000',
    totalAmountFormatted: '₹56,750.00',
  };

  beforeEach(() => {
    dialogRefMock = {
      close: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [CloseShiftDialogComponent, NoopAnimationsModule],
      providers: [
        I18nService,
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: { shift: mockShift, summary: mockSummary } },
      ],
    });
  });

  it('1. Renders shift metrics and returns true on confirm', () => {
    const fixture = TestBed.createComponent(CloseShiftDialogComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.onConfirm();
    expect(dialogRefMock.close).toHaveBeenCalledWith(true);
  });
});
