import { TestBed } from '@angular/core/testing';
import { FarmerStateService } from './farmer-state.service';
import { ElectronBridgeService } from './electron-bridge.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FarmerListDto } from '../../../../shared/ipc-contracts';

describe('FarmerStateService (Angular Unit)', () => {
  let service: FarmerStateService;
  let mockBridge: any;

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

  beforeEach(() => {
    mockBridge = {
      farmers: {
        list: vi.fn().mockResolvedValue({ success: true, data: [sampleFarmer] }),
        create: vi.fn().mockResolvedValue({ success: true, data: sampleFarmer }),
        update: vi.fn().mockResolvedValue({ success: true, data: sampleFarmer }),
        deactivate: vi.fn().mockResolvedValue({
          success: true,
          data: { ...sampleFarmer, isActive: false },
        }),
        reactivate: vi.fn().mockResolvedValue({ success: true, data: sampleFarmer }),
        getEditDetail: vi.fn().mockResolvedValue({
          success: true,
          data: {
            ...sampleFarmer,
            bankAccountNumber: '123456789012',
            upiId: 'tuka@oksbi',
            hasFinancialActivity: false,
          },
        }),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ElectronBridgeService, useValue: mockBridge }],
    });

    service = TestBed.inject(FarmerStateService);
  });

  it('loads farmers list into signal', async () => {
    const list = await service.loadFarmers();
    expect(list.length).toBe(1);
    expect(service.farmers().length).toBe(1);
    expect(service.farmers()[0].memberCode).toBe('001');
  });

  it('creates farmer and reloads list', async () => {
    await service.createFarmer({
      memberCode: '002',
      nameMr: 'गणेश पवार',
      defaultMilkType: 'BUFFALO',
      openingBalancePaise: 0,
    });

    expect(mockBridge.farmers.create).toHaveBeenCalled();
    expect(mockBridge.farmers.list).toHaveBeenCalled();
  });

  it('soft-deactivates and reactivates farmers', async () => {
    await service.deactivateFarmer(1, 'Reason');
    expect(mockBridge.farmers.deactivate).toHaveBeenCalledWith(1, { reason: 'Reason' });

    await service.reactivateFarmer(1);
    expect(mockBridge.farmers.reactivate).toHaveBeenCalledWith(1);
  });
});
