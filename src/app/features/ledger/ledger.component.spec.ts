import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LedgerComponent } from './ledger.component';
import { LedgerStateService } from '../../core/services/ledger-state.service';
import { I18nService } from '../../core/services/i18n.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { ElectronBridgeService } from '../../core/services/electron-bridge.service';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('LedgerComponent Unit Tests', () => {
  let component: LedgerComponent;
  let fixture: ComponentFixture<LedgerComponent>;

  let mockLedgerState: any;
  let mockI18n: any;
  let mockAuth: any;
  let mockBridge: any;
  let mockDialog: any;

  beforeEach(async () => {
    mockLedgerState = {
      summary: vi.fn().mockReturnValue(null),
      loading: vi.fn().mockReturnValue(false),
      error: vi.fn().mockReturnValue(null),
      hasSummary: vi.fn().mockReturnValue(false),
      searchByMemberCode: vi.fn(),
      setFilters: vi.fn(),
      createAdjustment: vi.fn(),
      voidAdjustment: vi.fn(),
    };

    mockI18n = {
      t: vi.fn((key: string) => key),
      isMarathi: vi.fn().mockReturnValue(true),
      currentLanguage: vi.fn().mockReturnValue('mr'),
    };

    mockAuth = {
      isOwner: vi.fn().mockReturnValue(true),
      isOperator: vi.fn().mockReturnValue(false),
    };

    mockBridge = {
      adjustments: {
        getById: vi.fn(),
      },
    };

    mockDialog = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LedgerComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: LedgerStateService, useValue: mockLedgerState },
        { provide: I18nService, useValue: mockI18n },
        { provide: AuthStateService, useValue: mockAuth },
        { provide: ElectronBridgeService, useValue: mockBridge },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LedgerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create LedgerComponent instance and render dashboard back button', () => {
    expect(component).toBeTruthy();
    const backBtn = fixture.nativeElement.querySelector('button[routerLink="/dashboard"]');
    expect(backBtn).toBeTruthy();
  });

  it('should call state.searchByMemberCode when searching', async () => {
    component.searchControl.setValue('101');
    await component.onSearch();
    expect(mockLedgerState.searchByMemberCode).toHaveBeenCalledWith('101');
  });

  it('should format source types correctly in Marathi', () => {
    expect(component.formatSourceType('OPENING_BALANCE')).toBe('आरंभीची शिल्लक');
    expect(component.formatSourceType('MILK_COLLECTION')).toBe('दूध संकलन');
    expect(component.formatSourceType('CREDIT')).toBe('जमा (Credit)');
    expect(component.formatSourceType('DEDUCTION')).toBe('कपात (Deduction)');
    expect(component.formatSourceType('ADVANCE')).toBe('उचल (Advance)');
  });
});
