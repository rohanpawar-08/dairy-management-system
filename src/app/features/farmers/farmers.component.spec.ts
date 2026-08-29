import { TestBed } from '@angular/core/testing';
import { FarmersComponent } from './farmers.component';
import { FarmerStateService } from '../../core/services/farmer-state.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { FarmerListDto } from '../../../../shared/ipc-contracts';

describe('FarmersComponent (Angular Unit)', () => {
  let mockFarmerState: any;
  let mockAuthState: any;
  let mockDialog: any;

  const sampleFarmer: FarmerListDto = {
    id: 1,
    memberCode: '001',
    nameMr: 'तुकाराम शिंदे',
    nameEn: 'Tukaram Shinde',
    phone: '9876543210',
    village: 'वारजे',
    maskedBankAccount: '••••••••9012',
    bankIfsc: 'SBIN0001234',
    bankName: 'SBI',
    maskedUpiId: 't••a@oksbi',
    defaultMilkType: 'COW',
    openingBalancePaise: 150000,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    mockFarmerState = {
      farmers: signal<FarmerListDto[]>([sampleFarmer]),
      isLoading: signal<boolean>(false),
      errorMessage: signal<string | null>(null),
      searchQuery: signal<string>(''),
      statusFilter: signal('ACTIVE'),
      milkTypeFilter: signal('ALL'),
      loadFarmers: vi.fn().mockResolvedValue([sampleFarmer]),
      deactivateFarmer: vi.fn().mockResolvedValue(sampleFarmer),
      reactivateFarmer: vi.fn().mockResolvedValue(sampleFarmer),
    };

    mockAuthState = {
      isOwner: signal<boolean>(true),
      isOperator: signal<boolean>(false),
    };

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: vi.fn().mockReturnValue({
          subscribe: vi.fn((cb) => cb({ confirmed: true })),
        }),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [FarmersComponent, NoopAnimationsModule],
      providers: [
        { provide: FarmerStateService, useValue: mockFarmerState },
        { provide: AuthStateService, useValue: mockAuthState },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();
  });

  it('renders farmer list with member code and masked bank account', () => {
    const fixture = TestBed.createComponent(FarmersComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('001');
    expect(compiled.textContent).toContain('तुकाराम शिंदे');
    expect(compiled.textContent).toContain('••••••••9012');
  });

  it('formats opening balance properly with + sign for payable and - sign for debt', () => {
    const fixture = TestBed.createComponent(FarmersComponent);
    const component = fixture.componentInstance;

    expect(component.formatBalance(150000)).toBe('+ ₹1500.00');
    expect(component.formatBalance(-5000)).toBe('- ₹50.00');
    expect(component.formatBalance(0)).toBe('₹0.00');
  });

  it('triggers search and filters on input change', () => {
    const fixture = TestBed.createComponent(FarmersComponent);
    const component = fixture.componentInstance;

    component.onSearchChange('001');
    expect(mockFarmerState.searchQuery()).toBe('001');
    expect(mockFarmerState.loadFarmers).toHaveBeenCalled();

    component.onStatusFilterChange('INACTIVE');
    expect(mockFarmerState.statusFilter()).toBe('INACTIVE');
  });
});
