import { Injectable, signal, WritableSignal } from '@angular/core';
import { ElectronBridgeService } from './electron-bridge.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { I18nService } from './i18n.service';
import { PdfExportRequest, ReportPreviewRequest, DashboardSummaryDto } from '../../../../shared/ipc-contracts';

@Injectable({
  providedIn: 'root'
})
export class ReportStateService {
  public dashboardSummary: WritableSignal<DashboardSummaryDto | null> = signal(null);
  public isGeneratingPdf: WritableSignal<boolean> = signal(false);
  public previewData: WritableSignal<any | null> = signal(null);

  constructor(
    private bridge: ElectronBridgeService,
    private snackBar: MatSnackBar,
    private i18n: I18nService
  ) {}

  async loadDashboardSummary() {
    if (!this.bridge.isElectron) return;
    const res = await this.bridge.reports.getDashboardSummary();
    if (res.success && res.data) {
      this.dashboardSummary.set(res.data);
    }
  }

  async previewReport(payload: ReportPreviewRequest): Promise<void> {
    if (!this.bridge.isElectron) return;
    this.previewData.set(null);
    const res = await this.bridge.reports.preview(payload);
    if (res.success) {
      this.previewData.set(res.data);
    } else {
      this.showError(res.error?.messageEn || 'Preview failed');
    }
  }

  async exportPdf(payload: PdfExportRequest): Promise<void> {
    if (!this.bridge.isElectron) return;
    
    this.isGeneratingPdf.set(true);
    this.snackBar.open(this.i18n.t('reports.generating'), '', { duration: 2000 });
    
    try {
      const res = await this.bridge.reports.exportPdf(payload);
      if (res.success) {
        if (!res.data.cancelled) {
          this.snackBar.open(this.i18n.t('reports.generated'), 'OK', { duration: 3000 });
        } else {
          this.snackBar.open(this.i18n.t('reports.cancelled'), 'OK', { duration: 2000 });
        }
      } else {
        this.showError(res.error?.messageEn || 'Export failed');
      }
    } finally {
      this.isGeneratingPdf.set(false);
    }
  }

  private showError(msg: string) {
    this.snackBar.open(msg, 'OK', { duration: 5000, panelClass: 'error-snackbar' });
  }
}
