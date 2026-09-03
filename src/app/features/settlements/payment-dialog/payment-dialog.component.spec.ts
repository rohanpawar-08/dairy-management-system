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

  it('should not require externalReference when paymentMethod is CASH', () => {
    component.form.patchValue({
      amountRupees: '1000.00',
      paymentMethod: 'CASH',
      businessDate: '2026-09-15',
      externalReference: '',
    });
    expect(component.form.valid).toBe(true);
    expect(component.isExternalRefRequired()).toBe(false);

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

  it('dynamically requires externalReference when method changes to UPI or BANK_TRANSFER', () => {
    component.form.patchValue({
      amountRupees: '1000.00',
      paymentMethod: 'CASH',
      businessDate: '2026-09-15',
      externalReference: '',
    });
    expect(component.form.valid).toBe(true);

    // Switch to UPI -> becomes invalid immediately
    component.form.get('paymentMethod')?.setValue('UPI');
    expect(component.isExternalRefRequired()).toBe(true);
    expect(component.form.valid).toBe(false);
    expect(component.form.get('externalReference')?.hasError('required')).toBe(true);

    // Whitespace only is rejected
    component.form.get('externalReference')?.setValue('   ');
    expect(component.form.valid).toBe(false);

    // Valid trimmed reference makes form valid
    component.form.get('externalReference')?.setValue('UPI-REF-9988');
    expect(component.form.valid).toBe(true);

    // Switching to BANK_TRANSFER remains required
    component.form.get('paymentMethod')?.setValue('BANK_TRANSFER');
    expect(component.isExternalRefRequired()).toBe(true);
    expect(component.form.valid).toBe(true);

    // Switching back to CASH makes it optional and valid even without reference
    component.form.get('externalReference')?.setValue('');
    expect(component.form.valid).toBe(false); // was invalid before switch
    component.form.get('paymentMethod')?.setValue('CASH');
    expect(component.isExternalRefRequired()).toBe(false);
    expect(component.form.valid).toBe(true);
  });

  it('requires externalReference for CHEQUE', () => {
    component.form.patchValue({
      amountRupees: '5000.00',
      paymentMethod: 'CHEQUE',
      businessDate: '2026-09-15',
      externalReference: '',
    });
    expect(component.form.valid).toBe(false);

    component.form.get('externalReference')?.setValue('CHQ-123456');
    expect(component.form.valid).toBe(true);
  });

  it('should close with null on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(null);
  });
});
