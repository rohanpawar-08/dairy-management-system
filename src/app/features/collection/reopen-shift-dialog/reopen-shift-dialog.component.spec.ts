import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReopenShiftDialogComponent, ReopenShiftDialogData } from './reopen-shift-dialog.component';
import { I18nService } from '../../../core/services/i18n.service';
import { ShiftDto } from '../../../../../shared/ipc-contracts';

describe('ReopenShiftDialogComponent (Angular Unit)', () => {
  let dialogRefMock: any;

  const mockShift: ShiftDto = {
    id: 1,
    businessDate: '2026-09-01',
    shiftType: 'MORNING',
    status: 'LOCKED',
    openedByUserId: 1,
    openedByName: 'Admin',
    openedAt: '2026-09-01T06:00:00Z',
    closedByUserId: 1,
    closedByName: 'Admin',
    closedAt: '2026-09-01T10:00:00Z',
    reopenedByUserId: null,
    reopenedByName: null,
    reopenedAt: null,
    reopenReason: null,
    reopenCount: 0,
    notes: null,
    createdAt: '2026-09-01T06:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  };

  beforeEach(() => {
    dialogRefMock = {
      close: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ReopenShiftDialogComponent, NoopAnimationsModule],
      providers: [
        I18nService,
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: { shift: mockShift } },
      ],
    });
  });

  it('1. Requires non-empty reopen reason and returns reason on confirm', () => {
    const fixture = TestBed.createComponent(ReopenShiftDialogComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    expect(comp.form.valid).toBe(false);

    comp.form.patchValue({ reason: 'उशिरा आलेले शेतकरी' });
    expect(comp.form.valid).toBe(true);

    comp.onConfirm();
    expect(dialogRefMock.close).toHaveBeenCalledWith('उशिरा आलेले शेतकरी');
  });
});
