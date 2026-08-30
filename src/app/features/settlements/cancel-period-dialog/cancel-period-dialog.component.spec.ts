import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CancelPeriodDialogComponent, CancelPeriodDialogData } from './cancel-period-dialog.component';

describe('CancelPeriodDialogComponent', () => {
  let component: CancelPeriodDialogComponent;
  let fixture: ComponentFixture<CancelPeriodDialogComponent>;
  let mockDialogRef: any;

  const mockData: CancelPeriodDialogData = {
    period: {
      id: 1,
      settlementNumber: 'SET-20260907-000001',
      periodStart: '2026-09-07',
      periodEnd: '2026-09-13',
      status: 'DRAFT',
      createdByUserId: 1,
      createdByName: 'Owner',
      createdAt: '2026-09-07T00:00:00Z',
      finalizedByUserId: null,
      finalizedByName: null,
      finalizedAt: null,
      cancelledByUserId: null,
      cancelledByName: null,
      cancelledAt: null,
      cancellationReason: null,
      updatedAt: '2026-09-07T00:00:00Z',
    },
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CancelPeriodDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CancelPeriodDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should close with payload on confirm', () => {
    component.form.patchValue({ reason: 'Draft created by error' });
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      periodId: 1,
      reason: 'Draft created by error',
    });
  });

  it('should close with null on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(null);
  });
});
