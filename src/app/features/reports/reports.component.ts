import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { I18nService } from '../../core/services/i18n.service';
import { ReportStateService } from '../../core/services/report-state.service';
import { ReportType } from '../../../../shared/ipc-contracts';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss']
})
export class ReportsComponent {
  public i18n = inject(I18nService);
  public state = inject(ReportStateService);

  public selectedType = signal<ReportType>('DAILY_COLLECTION_SUMMARY');
  public fromDate = signal<Date>(new Date());
  public toDate = signal<Date>(new Date());

  public reportTypes = [
    { value: 'DAILY_COLLECTION_SUMMARY', labelKey: 'reports.dailySummary' },
    { value: 'SHIFT_COLLECTION_REPORT', labelKey: 'reports.shiftReport' },
    { value: 'FARMER_LEDGER_STATEMENT', labelKey: 'reports.ledgerStatement' },
    { value: 'SETTLEMENT_BATCH_REPORT', labelKey: 'reports.settlementBatch' },
    { value: 'PAYMENT_REGISTER', labelKey: 'reports.paymentRegister' },
    { value: 'OUTSTANDING_FARMER_REPORT', labelKey: 'reports.outstandingReport' },
  ];

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async preview() {
    await this.state.previewReport({
      reportType: this.selectedType(),
      fromDate: this.formatDate(this.fromDate()),
      toDate: this.formatDate(this.toDate()),
      // Note: for production these would come from extra UI fields depending on report type
      shiftId: 1, 
      farmerId: 1,
      settlementPeriodId: 1
    });
  }

  async exportPdf() {
    await this.state.exportPdf({
      reportType: this.selectedType(),
      fromDate: this.formatDate(this.fromDate()),
      toDate: this.formatDate(this.toDate()),
      shiftId: 1,
      farmerId: 1,
      settlementPeriodId: 1,
      suggestedFilename: `${this.selectedType()}_${this.formatDate(this.fromDate())}.pdf`
    });
  }
}
