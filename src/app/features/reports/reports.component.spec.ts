import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { ReportsComponent } from './reports.component';
import { ReportStateService } from '../../core/services/report-state.service';
import { ElectronBridgeService } from '../../core/services/electron-bridge.service';

describe('ReportsComponent', () => {
  let component: ReportsComponent;
  let fixture: ComponentFixture<ReportsComponent>;
  let mockReportState: any;
  let mockBridge: any;

  beforeEach(async () => {
    mockReportState = {
      isGeneratingPdf: signal(false),
      previewData: signal<any | null>(null),
      previewReport: vi.fn().mockResolvedValue(undefined),
      exportPdf: vi.fn().mockResolvedValue(undefined),
    };

    mockBridge = {
      isElectron: true,
      farmers: {
        list: vi.fn().mockResolvedValue({
          success: true,
          data: [
            { id: 42, memberCode: 'F042', nameMr: 'तुकाराम पाटील', nameEn: 'Tukaram Patil' },
            { id: 99, memberCode: 'F099', nameMr: 'बाळू शिंदे', nameEn: 'Balu Shinde' },
          ],
        }),
      },
      settlements: {
        listPeriods: vi.fn().mockResolvedValue({
          success: true,
          data: [
            { id: 77, settlementNumber: 'SETT-2026-001', periodStart: '2026-08-25', periodEnd: '2026-08-31', status: 'FINALIZED' },
          ],
        }),
      },
      shifts: {
        getCurrent: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 15, shiftType: 'EVENING', businessDate: '2026-09-03', status: 'OPEN' },
        }),
      },
    };

    await TestBed.configureTestingModule({
      imports: [ReportsComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: ReportStateService, useValue: mockReportState },
        { provide: ElectronBridgeService, useValue: mockBridge },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render dashboard back navigation link', () => {
    expect(component).toBeTruthy();
    const backBtn = fixture.nativeElement.querySelector('button[routerLink="/dashboard"]');
    expect(backBtn).toBeTruthy();
    expect(backBtn.getAttribute('aria-label')).toBe(component.i18n.t('reports.backToDashboard'));
  });

  it('should load selectable entities on init from real bridge', async () => {
    await component.loadEntities();
    expect(mockBridge.farmers.list).toHaveBeenCalledWith({ status: 'ACTIVE' });
    expect(mockBridge.settlements.listPeriods).toHaveBeenCalled();
    expect(mockBridge.shifts.getCurrent).toHaveBeenCalled();

    expect(component.farmers().length).toBe(2);
    expect(component.selectedFarmerId()).toBe(42);
    expect(component.settlementPeriods().length).toBe(1);
    expect(component.selectedPeriodId()).toBe(77);
    expect(component.selectedShiftId()).toBe(15);
  });

  it('DAILY_COLLECTION_SUMMARY requires valid date range and preview/pdf use identical request', async () => {
    component.selectedType.set('DAILY_COLLECTION_SUMMARY');
    component.fromDate.set(new Date('2026-09-01'));
    component.toDate.set(new Date('2026-09-03'));

    const req = component.getValidatedRequest();
    expect(req).toEqual({
      reportType: 'DAILY_COLLECTION_SUMMARY',
      fromDate: '2026-09-01',
      toDate: '2026-09-03',
    });

    await component.preview();
    expect(mockReportState.previewReport).toHaveBeenCalledWith(req);

    await component.exportPdf();
    expect(mockReportState.exportPdf).toHaveBeenCalledWith({
      ...req,
      suggestedFilename: 'DAILY_COLLECTION_SUMMARY_2026-09-01.pdf',
    });

    // Inverted date range invalidates request
    component.fromDate.set(new Date('2026-09-10'));
    component.toDate.set(new Date('2026-09-01'));
    expect(component.getValidatedRequest()).toBeNull();
    expect(component.isValidSelection()).toBe(false);
  });

  it('FARMER_LEDGER_STATEMENT requires valid farmerId and never falls back to 1', async () => {
    component.selectedType.set('FARMER_LEDGER_STATEMENT');
    component.selectedFarmerId.set(99); // Farmer 99 selected
    component.fromDate.set(new Date('2026-09-01'));
    component.toDate.set(new Date('2026-09-05'));

    const req = component.getValidatedRequest();
    expect(req).toEqual({
      reportType: 'FARMER_LEDGER_STATEMENT',
      farmerId: 99,
      fromDate: '2026-09-01',
      toDate: '2026-09-05',
    });

    await component.preview();
    expect(mockReportState.previewReport).toHaveBeenCalledWith(req);

    // If farmerId is null or 0, validation fails and preview does nothing
    component.selectedFarmerId.set(null);
    expect(component.getValidatedRequest()).toBeNull();
    expect(component.isValidSelection()).toBe(false);

    mockReportState.previewReport.mockClear();
    await component.preview();
    expect(mockReportState.previewReport).not.toHaveBeenCalled();
  });

  it('SHIFT_COLLECTION_REPORT requires valid shiftId and uses selected shift (not 1)', async () => {
    component.selectedType.set('SHIFT_COLLECTION_REPORT');
    component.selectedShiftId.set(15);

    const req = component.getValidatedRequest();
    expect(req).toEqual({
      reportType: 'SHIFT_COLLECTION_REPORT',
      shiftId: 15,
    });

    await component.preview();
    expect(mockReportState.previewReport).toHaveBeenCalledWith(req);

    // Clearing shiftId makes request invalid
    component.selectedShiftId.set(null);
    expect(component.getValidatedRequest()).toBeNull();
    expect(component.isValidSelection()).toBe(false);
  });

  it('SETTLEMENT_BATCH_REPORT requires valid settlementPeriodId and uses selected period', async () => {
    component.selectedType.set('SETTLEMENT_BATCH_REPORT');
    component.selectedPeriodId.set(77);

    const req = component.getValidatedRequest();
    expect(req).toEqual({
      reportType: 'SETTLEMENT_BATCH_REPORT',
      settlementPeriodId: 77,
    });

    await component.preview();
    expect(mockReportState.previewReport).toHaveBeenCalledWith(req);

    component.selectedPeriodId.set(null);
    expect(component.getValidatedRequest()).toBeNull();
    expect(component.isValidSelection()).toBe(false);
  });

  it('translates report controls and accessibility labels in English and Marathi', () => {
    component.i18n.setLanguage('en');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Report Type');
    expect(fixture.nativeElement.textContent).toContain('From Date');
    expect(fixture.nativeElement.querySelector('button[routerLink="/dashboard"]').getAttribute('aria-label')).toBe('Back to Dashboard');

    component.i18n.setLanguage('mr');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('अहवाल प्रकार');
    expect(fixture.nativeElement.textContent).toContain('पासून दिनांक');
    expect(fixture.nativeElement.querySelector('button[routerLink="/dashboard"]').getAttribute('aria-label')).toBe('डॅशबोर्डवर परत जा');
  });

  it('renders every report preview as accessible structured cards or tables without JSON output', () => {
    component.i18n.setLanguage('en');
    const previews: Array<{ type: any; selector: string; marker: string; data: any }> = [
      {
        type: 'DAILY_COLLECTION_SUMMARY',
        selector: '.daily-report',
        marker: '321.0',
        data: {
          generatedAt: '03/09/2026, 10:00:00', fromDate: '2026-09-01', toDate: '2026-09-03',
          totalCollections: 9, uniqueFarmers: 4, totalLitresFormatted: '321.0', totalAmountFormatted: '₹12345.67',
          cowLitresFormatted: '200.0', cowAmountFormatted: '₹7000.00', cowFatAvg: '4.25', cowSnfAvg: '8.50',
          buffaloLitresFormatted: '121.0', buffaloAmountFormatted: '₹5345.67', buffaloFatAvg: '6.50', buffaloSnfAvg: '9.00',
          morningLitresFormatted: '180.0', morningAmountFormatted: '₹6800.00', eveningLitresFormatted: '141.0', eveningAmountFormatted: '₹5545.67',
        },
      },
      {
        type: 'SHIFT_COLLECTION_REPORT',
        selector: '.shift-report',
        marker: 'MC-20260903-M-000001',
        data: {
          generatedAt: '03/09/2026, 10:00:00',
          shift: { id: 15, business_date: '2026-09-03', shift_type: 'MORNING', status: 'LOCKED' },
          stats: { totalCollections: 1, activeCollections: 1, voidedCollections: 0, cowLitresFormatted: '10.0', cowAmountFormatted: '₹500.00', buffaloLitresFormatted: '0.0', buffaloAmountFormatted: '₹0.00', totalLitresFormatted: '10.0', totalAmountFormatted: '₹500.00' },
          collections: [{ receipt_number: 'MC-20260903-M-000001', farmer_id: 42, milk_type: 'COW', quantity_litres_formatted: '10.0', fat_formatted: '4.00', snf_formatted: '8.50', rate_rupees_formatted: '₹50.00', amount_rupees_formatted: '₹500.00', status: 'ACTIVE', duplicate_reason: null }],
        },
      },
      {
        type: 'FARMER_LEDGER_STATEMENT',
        selector: '.ledger-report',
        marker: 'ADJ-20260903-000001',
        data: {
          generatedAt: '03/09/2026, 10:00:00',
          ledger: { memberCode: 'F042', farmerNameMr: 'तुकाराम पाटील', farmerNameEn: 'Tukaram Patil', isActive: true, fromDate: '2026-09-01', toDate: '2026-09-03', asOfDate: '2026-09-03', openingBalanceFormatted: '₹100.00', milkCreditsFormatted: '₹500.00', adjustmentCreditsFormatted: '₹25.00', deductionsFormatted: '₹50.00', advancesFormatted: '₹0.00', netMovementFormatted: '₹475.00', broughtForwardBalanceFormatted: '₹100.00', currentBalanceFormatted: '₹575.00', items: [{ businessDate: '2026-09-03', referenceNumber: 'ADJ-20260903-000001', description: 'Bonus', sourceType: 'CREDIT', creditPaise: 2500, debitPaise: 0, runningBalancePaise: 57500, status: 'ACTIVE' }] },
        },
      },
      {
        type: 'SETTLEMENT_BATCH_REPORT',
        selector: '.settlement-report',
        marker: 'F077',
        data: {
          generatedAt: '03/09/2026, 10:00:00',
          period: { settlement_number: 'SET-20260901-000001', period_start: '2026-09-01', period_end: '2026-09-07', status: 'FINALIZED' },
          items: [{ member_code_snapshot: 'F077', farmer_name_mr_snapshot: 'सुमन शिंदे', farmer_name_en_snapshot: 'Suman Shinde', opening_balance_paise: 10000, milk_collection_count: 6, milk_litres_formatted: '75.0', milk_amount_formatted: '₹3500.00', credit_amount_formatted: '₹0.00', deduction_amount_formatted: '₹200.00', advance_amount_formatted: '₹0.00', net_amount_formatted: '₹3400.00', allocated_formatted: '₹1000.00', outstanding_formatted: '₹2400.00' }],
        },
      },
      {
        type: 'PAYMENT_REGISTER',
        selector: '.payment-report',
        marker: 'PAY-20260903-000001',
        data: {
          generatedAt: '03/09/2026, 10:00:00', filters: { fromDate: '2026-09-01', toDate: '2026-09-03' }, totalAmountFormatted: '₹1000.00',
          payments: [{ business_date: '2026-09-03', payment_number: 'PAY-20260903-000001', farmer_id: 42, payment_method: 'CASH', amount_formatted: '₹1000.00', external_reference: null, notes: null, status: 'RECORDED' }],
        },
      },
      {
        type: 'OUTSTANDING_FARMER_REPORT',
        selector: '.outstanding-report',
        marker: 'F088',
        data: {
          generatedAt: '03/09/2026, 10:00:00', totalPayableFormatted: '₹2200.00', totalDebtFormatted: '₹0.00',
          items: [{ member_code: 'F088', name_mr: 'माया जाधव', name_en: 'Maya Jadhav', is_active: 1, total_net_formatted: '₹3000.00', total_paid_formatted: '₹800.00', outstanding_formatted: '₹2200.00' }],
        },
      },
    ];

    for (const preview of previews) {
      component.previewType.set(preview.type);
      mockReportState.previewData.set(preview.data);
      fixture.detectChanges();

      const section = fixture.nativeElement.querySelector(preview.selector) as HTMLElement;
      expect(section).toBeTruthy();
      expect(section.textContent).toContain(preview.marker);
      expect(section.querySelector('table caption')).toBeTruthy();
      expect(section.querySelector('th[scope="col"]')).toBeTruthy();
      expect(section.querySelector('th[scope="row"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('pre')).toBeNull();
      expect(fixture.nativeElement.querySelector('.debug-preview')).toBeNull();
    }
  });
});
