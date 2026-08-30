import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { PaymentDialogComponent, PaymentDialogData } from './payment-dialog.component';

describe('PaymentDialogComponent', () => {
  let component: PaymentDialogComponent;
  let fixture: ComponentFixture<PaymentDialogComponent>;
  let mockDialogRef: any;

  const mockData: PaymentDialogData = {
    farmerId: 1,
    memberCode: 'F001',
    farmerNameMr: 'आनंदराव पाटील',
    outstandingBalancePaise: 500000,
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PaymentDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should close with payload on confirm', () => {
    component.form.patchValue({
      amountRupees: '1000.00',
      paymentMethod: 'CASH',
      businessDate: '2026-09-15',
    });
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      farmerId: 1,
      businessDate: '2026-09-15',
      amountRupees: '1000.00',
      paymentMethod: 'CASH',
      externalReference: undefined,
      notes: undefined,
    });
  });

  it('should close with null on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(null);
  });
});
