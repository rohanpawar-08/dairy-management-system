import { TestBed } from '@angular/core/testing';
import { ReportStateService } from './report-state.service';
import { ElectronBridgeService } from './electron-bridge.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatSnackBar } from '@angular/material/snack-bar';
import { I18nService } from './i18n.service';

describe('ReportStateService', () => {
  let service: ReportStateService;
  let mockBridge: any;
  let mockSnackBar: any;
  let mockI18n: any;

  beforeEach(() => {
    mockBridge = {
      isElectron: true,
      reports: {
        getDashboardSummary: vi.fn().mockResolvedValue({ success: true, data: {} }),
        preview: vi.fn().mockResolvedValue({ success: true, data: {} }),
        exportPdf: vi.fn().mockResolvedValue({ success: true, data: { cancelled: false, fileName: 'test.pdf' } })
      }
    };
    mockSnackBar = { open: vi.fn() };
    mockI18n = {
      currentLanguage: vi.fn().mockReturnValue('en'),
      t: vi.fn().mockImplementation((key: any) => key),
    };

    TestBed.configureTestingModule({
      providers: [
        ReportStateService,
        { provide: ElectronBridgeService, useValue: mockBridge },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: I18nService, useValue: mockI18n }
      ]
    });
    service = TestBed.inject(ReportStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch dashboard summary', async () => {
    await service.loadDashboardSummary();
    expect(mockBridge.reports.getDashboardSummary).toHaveBeenCalled();
  });

  it('should preview report', async () => {
    await service.previewReport({ reportType: 'DAILY_COLLECTION_SUMMARY' } as any);
    expect(mockBridge.reports.preview).toHaveBeenCalled();
  });

  it('should export pdf', async () => {
    await service.exportPdf({ reportType: 'DAILY_COLLECTION_SUMMARY', suggestedFilename: 'test' } as any);
    expect(mockBridge.reports.exportPdf).toHaveBeenCalled();
    expect(mockSnackBar.open).toHaveBeenCalled();
  });

  it('shows the backend error in the active report language', async () => {
    mockI18n.currentLanguage.mockReturnValue('mr');
    mockBridge.reports.preview.mockResolvedValueOnce({
      success: false,
      error: { messageEn: 'Preview failed', messageMr: 'पूर्वावलोकन अयशस्वी' },
    });

    await service.previewReport({ reportType: 'OUTSTANDING_FARMER_REPORT' });

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'पूर्वावलोकन अयशस्वी',
      'common.ok',
      expect.objectContaining({ panelClass: 'error-snackbar' })
    );
  });
});
