import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/services/i18n.service';
import { SettlementPeriodDto } from '../../../../../shared/ipc-contracts';

export interface FinalizeDialogData {
  period: SettlementPeriodDto;
  eligibleFarmerCount: number;
  totalNetPaise: number;
}

@Component({
  selector: 'app-finalize-settlement-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="dialog-container">
      <h2 mat-dialog-title class="dialog-header">
        <mat-icon color="warn">lock</mat-icon>
        <span>{{ i18n.t('settlements.finalizeConfirmTitle') }}</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <p class="warning-text">
          {{ i18n.t('settlements.finalizeWarningMessage') }}
        </p>

        <div class="summary-card">
          <div class="row">
            <span>{{ i18n.t('settlements.periodNumber') }}:</span>
            <strong>{{ data.period.settlementNumber }}</strong>
          </div>
          <div class="row">
            <span>{{ i18n.t('settlements.periodDates') }}:</span>
            <strong>{{ data.period.periodStart }} {{ i18n.t('common.to') }} {{ data.period.periodEnd }}</strong>
          </div>
          <div class="row">
            <span>{{ i18n.t('settlements.eligibleFarmers') }}:</span>
            <strong>{{ data.eligibleFarmerCount }}</strong>
          </div>
          <div class="row">
            <span>{{ i18n.t('settlements.netBatchAmount') }}:</span>
            <strong class="amount">₹{{ (data.totalNetPaise / 100).toFixed(2) }}</strong>
          </div>
        </div>

        <p class="immutable-notice">
          <mat-icon color="primary">verified_user</mat-icon>
          <span>{{ i18n.t('settlements.immutableNotice') }}</span>
        </p>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="onCancel()">
          {{ i18n.t('common.cancel') }}
        </button>
        <button
          mat-raised-button
          color="warn"
          type="button"
          (click)="onConfirm()"
        >
          <mat-icon>lock</mat-icon>
          <span>{{ i18n.t('settlements.finalizeAction') }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      min-width: 440px;
      max-width: 520px;
      padding: 8px;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 18px;
      font-weight: 600;
    }
    .warning-text {
      color: #d32f2f;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 16px;
    }
    .summary-card {
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 14px;
    }
    .row {
      display: flex;
      justify-content: space-between;
    }
    .amount {
      color: #2e7d32;
      font-size: 16px;
    }
    .immutable-notice {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #1976d2;
      font-size: 13px;
      margin: 0;
    }
  `],
})
export class FinalizeSettlementDialogComponent {
  public readonly i18n = inject(I18nService);

  constructor(
    public dialogRef: MatDialogRef<FinalizeSettlementDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: FinalizeDialogData
  ) {}

  public onConfirm(): void {
    this.dialogRef.close(true);
  }

  public onCancel(): void {
    this.dialogRef.close(false);
  }
}
