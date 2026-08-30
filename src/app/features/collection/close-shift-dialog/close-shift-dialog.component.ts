import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ShiftDto, ShiftSummaryDto } from '../../../../../shared/ipc-contracts';
import { I18nService } from '../../../core/services/i18n.service';

export interface CloseShiftDialogData {
  shift: ShiftDto;
  summary: ShiftSummaryDto | null;
}

@Component({
  selector: 'app-close-shift-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <div class="dialog-container">
      <h2 mat-dialog-title class="dialog-header">
        <mat-icon color="primary">lock</mat-icon>
        <span>{{ i18n.t('collection.closeShiftTitle') }}</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <div class="shift-meta-box">
          <span class="meta-item">
            <strong>{{ i18n.t('collection.businessDate') }}:</strong> {{ data.shift.businessDate }}
          </span>
          <span class="meta-item">
            <strong>{{ i18n.t('collection.shiftType') }}:</strong>
            {{ data.shift.shiftType === 'MORNING' ? i18n.t('collection.morningShift') : i18n.t('collection.eveningShift') }}
          </span>
        </div>

        <div *ngIf="data.summary" class="summary-metrics-grid">
          <div class="metric-card">
            <span class="metric-val">{{ data.summary.totalActiveCollections }}</span>
            <span class="metric-label">{{ i18n.t('collection.totalCollections') }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-val">{{ data.summary.uniqueFarmersCount }}</span>
            <span class="metric-label">{{ i18n.t('collection.uniqueFarmers') }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-val">{{ data.summary.cowLitresFormatted }} L</span>
            <span class="metric-label">{{ i18n.t('ratePlans.cow') }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-val">{{ data.summary.buffaloLitresFormatted }} L</span>
            <span class="metric-label">{{ i18n.t('ratePlans.buffalo') }}</span>
          </div>
          <div class="metric-card highlight-metric">
            <span class="metric-val">{{ data.summary.totalLitresFormatted }} L</span>
            <span class="metric-label">{{ i18n.t('collection.totalMilk') }}</span>
          </div>
          <div class="metric-card highlight-metric">
            <span class="metric-val amount">{{ data.summary.totalAmountFormatted }}</span>
            <span class="metric-label">{{ i18n.t('collection.totalAmount') }}</span>
          </div>
        </div>

        <p class="lock-notice">
          <mat-icon>info</mat-icon>
          <span>{{ i18n.t('collection.closeShiftWarning') }}</span>
        </p>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="onCancel()">
          {{ i18n.t('common.cancel') }}
        </button>
        <button
          mat-raised-button
          color="primary"
          type="button"
          (click)="onConfirm()"
        >
          <mat-icon>lock</mat-icon>
          <span>{{ i18n.t('collection.confirmCloseShiftBtn') }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      min-width: 480px;
      max-width: 560px;
      padding: 8px;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .shift-meta-box {
      display: flex;
      justify-content: space-between;
      background: #f5f5f5;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .summary-metrics-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .metric-card {
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 10px;
      text-align: center;
    }
    .metric-card.highlight-metric {
      background: #e8f5e9;
      border-color: #a5d6a7;
    }
    .metric-val {
      display: block;
      font-size: 18px;
      font-weight: 700;
    }
    .metric-val.amount {
      color: #2e7d32;
    }
    .metric-label {
      font-size: 12px;
      color: #616161;
    }
    .lock-notice {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #555;
      font-size: 13px;
      margin: 8px 0;
    }
  `],
})
export class CloseShiftDialogComponent {
  public readonly i18n = inject(I18nService);

  constructor(
    public dialogRef: MatDialogRef<CloseShiftDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: CloseShiftDialogData
  ) {}

  public onConfirm(): void {
    this.dialogRef.close(true);
  }

  public onCancel(): void {
    this.dialogRef.close(false);
  }
}
