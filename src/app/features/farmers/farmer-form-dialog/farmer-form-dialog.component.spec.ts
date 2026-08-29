import { TestBed } from '@angular/core/testing';
import { FarmerFormDialogComponent } from './farmer-form-dialog.component';
import { FarmerStateService } from '../../../core/services/farmer-state.service';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('FarmerFormDialogComponent (Angular Unit)', () => {
  let mockDialogRef: any;
  let mockFarmerState: any;

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockFarmerState = {
      createFarmer: vi.fn().mockResolvedValue({ id: 1 }),
      updateFarmer: vi.fn().mockResolvedValue({ id: 1 }),
      getFarmerEditDetail: vi.fn().mockResolvedValue({
        id: 1,
        memberCode: '001',
        nameMr: 'तुकाराम शिंदे',
        defaultMilkType: 'COW',
        openingBalancePaise: 150000,
        hasFinancialActivity: false,
        isActive: true,
      }),
    };

    await TestBed.configureTestingModule({
      imports: [FarmerFormDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { mode: 'create' } },
        { provide: FarmerStateService, useValue: mockFarmerState },
      ],
    }).compileComponents();
  });

  it('initializes form with validation constraints', () => {
    const fixture = TestBed.createComponent(FarmerFormDialogComponent);
    const component = fixture.componentInstance;

    expect(component.farmerForm.valid).toBe(false);

    component.farmerForm.patchValue({
      memberCode: '001',
      nameMr: 'तुकाराम शिंदे',
      defaultMilkType: 'COW',
      balanceDirection: 'NONE',
    });

    expect(component.farmerForm.valid).toBe(true);
  });

  it('correctly calculates signed paise from direction and rupee input without float drift', () => {
    const fixture = TestBed.createComponent(FarmerFormDialogComponent);
    const component = fixture.componentInstance;

    // Payable to farmer (positive)
    component.farmerForm.patchValue({
      balanceDirection: 'PAYABLE_TO_FARMER',
      balanceRupees: '1500.50',
    });
    expect(component.calculateSignedPaise()).toBe(150050);

    // Debt to dairy (negative)
    component.farmerForm.patchValue({
      balanceDirection: 'FARMER_DEBT_TO_DAIRY',
      balanceRupees: '500.25',
    });
    expect(component.calculateSignedPaise()).toBe(-50025);

    // None (zero)
    component.farmerForm.patchValue({
      balanceDirection: 'NONE',
      balanceRupees: '1000',
    });
    expect(component.calculateSignedPaise()).toBe(0);
  });

  it('submits valid farmer creation payload', async () => {
    const fixture = TestBed.createComponent(FarmerFormDialogComponent);
    const component = fixture.componentInstance;

    component.farmerForm.patchValue({
      memberCode: '001',
      nameMr: 'तुकाराम शिंदे',
      defaultMilkType: 'COW',
      balanceDirection: 'PAYABLE_TO_FARMER',
      balanceRupees: '1500',
    });

    await component.saveFarmer();

    expect(mockFarmerState.createFarmer).toHaveBeenCalledWith(
      expect.objectContaining({
        memberCode: '001',
        nameMr: 'तुकाराम शिंदे',
        openingBalancePaise: 150000,
      })
    );
    expect(mockDialogRef.close).toHaveBeenCalled();
  });
});
