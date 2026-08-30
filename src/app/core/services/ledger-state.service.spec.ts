import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LedgerStateService } from './ledger-state.service';
import { ElectronBridgeService } from './electron-bridge.service';

describe('LedgerStateService Unit Tests', () => {
  let stateService: LedgerStateService;
  let mockBridge: any;

  beforeEach(() => {
    mockBridge = {
      ledger: {
        getFarmerLedger: vi.fn(),
      },
      adjustments: {
        create: vi.fn(),
        void: vi.fn(),
      },
    };

    stateService = new LedgerStateService(mockBridge as unknown as ElectronBridgeService);
  });

  it('should initialize with null summary and false loading', () => {
    expect(stateService.summary()).toBeNull();
    expect(stateService.loading()).toBe(false);
    expect(stateService.error()).toBeNull();
    expect(stateService.hasSummary()).toBe(false);
  });

  it('should load farmer ledger successfully and update signal state', async () => {
    const mockSummary = {
      farmerId: 1,
      memberCode: '101',
      farmerNameMr: 'रमेश पवार',
      openingBalancePaise: 0,
      currentBalancePaise: 50000,
      currentBalanceFormatted: '₹500.00',
      balanceDirection: 'PAYABLE_TO_FARMER',
      items: [],
    };

    mockBridge.ledger.getFarmerLedger.mockResolvedValue({
      success: true,
      data: mockSummary,
    });

    const result = await stateService.loadLedger({ memberCode: '101' });

    expect(result).toEqual(mockSummary);
    expect(stateService.summary()).toEqual(mockSummary);
    expect(stateService.hasSummary()).toBe(true);
    expect(stateService.loading()).toBe(false);
  });

  it('should handle error when searching farmer ledger', async () => {
    mockBridge.ledger.getFarmerLedger.mockResolvedValue({
      success: false,
      error: { code: 'FARMER_NOT_FOUND', messageMr: 'सभासद सापडला नाही' },
    });

    const result = await stateService.loadLedger({ memberCode: '999' });

    expect(result).toBeNull();
    expect(stateService.summary()).toBeNull();
    expect(stateService.error()).toBe('सभासद सापडला नाही');
    expect(stateService.loading()).toBe(false);
  });
});
