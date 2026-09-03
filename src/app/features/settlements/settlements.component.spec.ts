import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { SettlementsComponent } from './settlements.component';
import { SettlementStateService } from '../../core/services/settlement-state.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { I18nService } from '../../core/services/i18n.service';

describe('SettlementsComponent', () => {
  let component: SettlementsComponent;
  let fixture: ComponentFixture<SettlementsComponent>;
  let mockState: any;
  let mockAuth: any;
  let mockDialog: any;

  beforeEach(async () => {
    mockState = {
      loadPeriods: vi.fn().mockResolvedValue([]),
      loadPayments: vi.fn().mockResolvedValue([]),
      selectPeriod: vi.fn(),
      createDraft: vi.fn(),
      finalizePeriod: vi.fn(),
      cancelDraft: vi.fn(),
      recordPayment: vi.fn(),
      voidPayment: vi.fn(),
      loadOutstanding: vi.fn(),
      periods: vi.fn().mockReturnValue([]),
      activeDraftPeriod: vi.fn().mockReturnValue(null),
      selectedPeriod: vi.fn().mockReturnValue(null),
      previewData: vi.fn().mockReturnValue(null),
      farmerSettlements: vi.fn().mockReturnValue([]),
      payments: vi.fn().mockReturnValue([]),
      error: vi.fn().mockReturnValue(null),
      loading: vi.fn().mockReturnValue(false),
    };

    mockAuth = {
      isOwner: vi.fn().mockReturnValue(true),
      isOperator: vi.fn().mockReturnValue(false),
    };

    mockDialog = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SettlementsComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: SettlementStateService, useValue: mockState },
        { provide: AuthStateService, useValue: mockAuth },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettlementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render dashboard back button', () => {
    expect(component).toBeTruthy();
    const backBtn = fixture.nativeElement.querySelector('button[routerLink="/dashboard"]');
    expect(backBtn).toBeTruthy();
  });

  it('should load periods and payments on init', () => {
    expect(mockState.loadPeriods).toHaveBeenCalled();
    expect(mockState.loadPayments).toHaveBeenCalled();
  });

  it('should format rupees correctly from paise', () => {
    expect(component.formatRupees(15050)).toBe('150.50');
    expect(component.formatRupees(0)).toBe('0.00');
  });
});
