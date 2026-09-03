import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { I18nService } from '../../core/services/i18n.service';
import { ReportStateService } from '../../core/services/report-state.service';
import { ElectronBridgeService } from '../../core/services/electron-bridge.service';
import {
  FarmerListDto,
  ReportPreviewRequest,
  ReportType,
  SettlementPeriodDto,
  ShiftDto,
} from '../../../../shared/ipc-contracts';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    FormsModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
})
export class ReportsComponent implements OnInit {
  public i18n = inject(I18nService);
  public state = inject(ReportStateService);
  private bridge = inject(ElectronBridgeService);

  public selectedType = signal<ReportType>('DAILY_COLLECTION_SUMMARY');
  public fromDate = signal<Date>(new Date());
  public toDate = signal<Date>(new Date());

  // Entity lists loaded from real bridge
  public farmers = signal<FarmerListDto[]>([]);
  public settlementPeriods = signal<SettlementPeriodDto[]>([]);
  public currentShift = signal<ShiftDto | null>(null);

  // Selected entity IDs
  public selectedFarmerId = signal<number | null>(null);
  public selectedPeriodId = signal<number | null>(null);
  public selectedShiftId = signal<number | null>(null);

  // Feedback states
  public isLoadingEntities = signal<boolean>(false);
  public isPreviewLoading = signal<boolean>(false);
  public entityError = signal<string | null>(null);

  public reportTypes = [
    { value: 'DAILY_COLLECTION_SUMMARY', labelKey: 'reports.dailySummary' },
    { value: 'SHIFT_COLLECTION_REPORT', labelKey: 'reports.shiftReport' },
    { value: 'FARMER_LEDGER_STATEMENT', labelKey: 'reports.ledgerStatement' },
    { value: 'SETTLEMENT_BATCH_REPORT', labelKey: 'reports.settlementBatch' },
    { value: 'PAYMENT_REGISTER', labelKey: 'reports.paymentRegister' },
    { value: 'OUTSTANDING_FARMER_REPORT', labelKey: 'reports.outstandingReport' },
  ];

  async ngOnInit(): Promise<void> {
    await this.loadEntities();
  }

  async loadEntities(): Promise<void> {
    this.isLoadingEntities.set(true);
    this.entityError.set(null);
    try {
      if (this.bridge.isElectron) {
        const [farmersRes, periodsRes, shiftRes] = await Promise.all([
          this.bridge.farmers.list({ status: 'ACTIVE' }),
          this.bridge.settlements.listPeriods(),
          this.bridge.shifts.getCurrent(),
        ]);

        if (farmersRes.success && farmersRes.data) {
          this.farmers.set(farmersRes.data);
          if (farmersRes.data.length > 0 && !this.selectedFarmerId()) {
            this.selectedFarmerId.set(farmersRes.data[0].id);
          }
        }
        if (periodsRes.success && periodsRes.data) {
          this.settlementPeriods.set(periodsRes.data);
          if (periodsRes.data.length > 0 && !this.selectedPeriodId()) {
            this.selectedPeriodId.set(periodsRes.data[0].id);
          }
        }
        if (shiftRes.success && shiftRes.data) {
          this.currentShift.set(shiftRes.data);
          if (!this.selectedShiftId()) {
            this.selectedShiftId.set(shiftRes.data.id);
          }
        }
      }
    } catch (err: unknown) {
      this.entityError.set(err instanceof Error ? err.message : 'Failed to load report entities');
    } finally {
      this.isLoadingEntities.set(false);
    }
  }

  public formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  public getValidatedRequest(): ReportPreviewRequest | null {
    const type = this.selectedType();
    const from = this.formatDate(this.fromDate());
    const to = this.formatDate(this.toDate());

    if (type === 'DAILY_COLLECTION_SUMMARY') {
      if (!from || !to || from > to) return null;
      return { reportType: type, fromDate: from, toDate: to };
    }

    if (type === 'SHIFT_COLLECTION_REPORT') {
      const shiftId = this.selectedShiftId();
      if (!shiftId || shiftId <= 0) return null;
      return { reportType: type, shiftId };
    }

    if (type === 'FARMER_LEDGER_STATEMENT') {
      const farmerId = this.selectedFarmerId();
      if (!farmerId || farmerId <= 0) return null;
      if (from && to && from > to) return null;
      return { reportType: type, farmerId, fromDate: from, toDate: to };
    }

    if (type === 'SETTLEMENT_BATCH_REPORT') {
      const settlementPeriodId = this.selectedPeriodId();
      if (!settlementPeriodId || settlementPeriodId <= 0) return null;
      return { reportType: type, settlementPeriodId };
    }

    if (type === 'PAYMENT_REGISTER') {
      if (from && to && from > to) return null;
      const farmerId = this.selectedFarmerId() ? Number(this.selectedFarmerId()) : undefined;
      return { reportType: type, fromDate: from, toDate: to, farmerId };
    }

    if (type === 'OUTSTANDING_FARMER_REPORT') {
      return { reportType: type };
    }

    return null;
  }

  public isValidSelection = computed(() => {
    return this.getValidatedRequest() !== null;
  });

  public validationError = computed<string | null>(() => {
    const type = this.selectedType();
    const from = this.formatDate(this.fromDate());
    const to = this.formatDate(this.toDate());

    if (
      (type === 'DAILY_COLLECTION_SUMMARY' ||
        type === 'FARMER_LEDGER_STATEMENT' ||
        type === 'PAYMENT_REGISTER') &&
      from &&
      to &&
      from > to
    ) {
      return this.i18n.t('reports.invalidDateRange');
    }
    if (type === 'SHIFT_COLLECTION_REPORT' && (!this.selectedShiftId() || this.selectedShiftId()! <= 0)) {
      return this.i18n.t('reports.validationRequired');
    }
    if (type === 'FARMER_LEDGER_STATEMENT' && (!this.selectedFarmerId() || this.selectedFarmerId()! <= 0)) {
      return this.i18n.t('reports.validationRequired');
    }
    if (type === 'SETTLEMENT_BATCH_REPORT' && (!this.selectedPeriodId() || this.selectedPeriodId()! <= 0)) {
      return this.i18n.t('reports.validationRequired');
    }
    return null;
  });

  async preview(): Promise<void> {
    const req = this.getValidatedRequest();
    if (!req) return;
    this.isPreviewLoading.set(true);
    try {
      await this.state.previewReport(req);
    } finally {
      this.isPreviewLoading.set(false);
    }
  }

  async exportPdf(): Promise<void> {
    const req = this.getValidatedRequest();
    if (!req) return;
    const datePart = req.fromDate ? `_${req.fromDate}` : '';
    await this.state.exportPdf({
      ...req,
      suggestedFilename: `${req.reportType}${datePart}.pdf`,
    });
  }
}
