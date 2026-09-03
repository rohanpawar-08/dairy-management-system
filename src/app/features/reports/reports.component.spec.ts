import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
      isGeneratingPdf: () => false,
      previewData: () => null,
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
    expect(backBtn.getAttribute('aria-label')).toBe('Back to Dashboard');
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
});
