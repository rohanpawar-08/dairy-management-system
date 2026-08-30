import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { VoidPaymentDialogComponent, VoidPaymentDialogData } from './void-payment-dialog.component';

describe('VoidPaymentDialogComponent', () => {
  let component: VoidPaymentDialogComponent;
  let fixture: ComponentFixture<VoidPaymentDialogComponent>;
  let mockDialogRef: any;

  const mockData: VoidPaymentDialogData = {
    payment: {
      id: 1,
      paymentNumber: 'PAY-20260915-000001',
      farmerId: 1,
      farmerMemberCode: 'F001',
      farmerNameMr: 'आनंदराव पाटील',
      farmerNameEn: 'Anandrao Patil',
      businessDate: '2026-09-15',
      amountPaise: 100000,
      paymentMethod: 'CASH',
      externalReference: null,
      notes: null,
      status: 'RECORDED',
      createdByUserId: 1,
      createdByName: 'Owner',
      createdAt: '2026-09-15T00:00:00Z',
      voidedByUserId: null,
      voidedByName: null,
      voidedAt: null,
      voidReason: null,
      updatedAt: '2026-09-15T00:00:00Z',
    },
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [VoidPaymentDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VoidPaymentDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should close with payload on confirm', () => {
    component.form.patchValue({ reason: 'Incorrect payment entry' });
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      paymentId: 1,
      reason: 'Incorrect payment entry',
    });
  });

  it('should close with null on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(null);
  });
});
