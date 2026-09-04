import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdjustmentFormDialogComponent,
  AdjustmentFormDialogData,
} from './adjustment-form-dialog.component';

describe('AdjustmentFormDialogComponent', () => {
  let component: AdjustmentFormDialogComponent;
  let fixture: ComponentFixture<AdjustmentFormDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const data: AdjustmentFormDialogData = {
    farmerId: 7,
    memberCode: 'F007',
    farmerNameMr: 'सुनंदा पाटील',
    farmerNameEn: 'Sunanda Patil',
  };

  beforeEach(async () => {
    dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [AdjustmentFormDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdjustmentFormDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it.each(['0', '0.00'])('rejects a zero ledger adjustment after paise parsing: %s', (amountRupees) => {
    component.form.patchValue({
      amountRupees,
      reason: 'Correction',
      businessDate: '2026-09-15',
    });

    expect(component.form.get('amountRupees')?.hasError('positivePaise')).toBe(true);
    expect(component.form.invalid).toBe(true);
    component.onConfirm();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('accepts the smallest positive paise ledger adjustment', () => {
    component.form.patchValue({
      amountRupees: '0.01',
      reason: 'Correction',
      businessDate: '2026-09-15',
    });

    expect(component.form.get('amountRupees')?.hasError('positivePaise')).toBe(false);
    expect(component.form.valid).toBe(true);
  });
});
