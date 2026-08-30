import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FinalizeSettlementDialogComponent, FinalizeDialogData } from './finalize-settlement-dialog.component';

describe('FinalizeSettlementDialogComponent', () => {
  let component: FinalizeSettlementDialogComponent;
  let fixture: ComponentFixture<FinalizeSettlementDialogComponent>;
  let mockDialogRef: any;

  const mockData: FinalizeDialogData = {
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
    eligibleFarmerCount: 5,
    totalNetPaise: 150000,
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [FinalizeSettlementDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FinalizeSettlementDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should close with true on confirm', () => {
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });

  it('should close with false on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });
});
