import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { DuplicateReason, ExistingCollectionSummary, RatePlanMilkType } from '../../../../../shared/ipc-contracts';
import { I18nService } from '../../../core/services/i18n.service';

export interface DuplicateConfirmDialogData {
  memberCode: string;
  farmerNameMr: string;
  farmerNameEn?: string | null;
  milkType: RatePlanMilkType;
  existingCollections: ExistingCollectionSummary[];
}

export interface DuplicateConfirmDialogResult {
  confirmed: boolean;
  duplicateReason: string;
}

@Component({
  selector: 'app-duplicate-confirm-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <div class="dialog-container">
      <h2 mat-dialog-title class="dialog-header warning-title">
        <mat-icon color="warn">warning</mat-icon>
        <span>{{ i18n.t('collection.duplicateWarningTitle') }}</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <div class="farmer-summary-banner">
          <div class="farmer-id-badge">{{ data.memberCode }}</div>
          <div class="farmer-info">
            <span class="farmer-name">{{ data.farmerNameMr }}</span>
            <span class="milk-type-tag" [class.cow]="data.milkType === 'COW'" [class.buffalo]="data.milkType === 'BUFFALO'">
              {{ data.milkType === 'COW' ? i18n.t('ratePlans.cow') : i18n.t('ratePlans.buffalo') }}
            </span>
          </div>
        </div>

        <p class="warning-text">
          {{ i18n.t('collection.duplicateWarningMsg') }}
        </p>

        <div class="existing-records-box">
          <h4>{{ i18n.t('collection.existingRecords') }} ({{ data.existingCollections.length }}):</h4>
          <table class="existing-table">
            <thead>
              <tr>
                <th>{{ i18n.t('collection.receiptNo') }}</th>
                <th>{{ i18n.t('collection.quantity') }}</th>
                <th>FAT / SNF</th>
                <th>{{ i18n.t('collection.time') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let col of data.existingCollections">
                <td class="mono font-bold">{{ col.receiptNumber }}</td>
                <td>{{ col.quantityLitresFormatted }} L</td>
                <td>{{ (col.fatX100 / 100).toFixed(2) }}% / {{ (col.snfX100 / 100).toFixed(2) }}%</td>
                <td>{{ col.createdAt | date:'HH:mm:ss' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <form [formGroup]="form" class="reason-form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ i18n.t('collection.duplicateReasonLabel') }} *</mat-label>
            <mat-select formControlName="reasonCode" (selectionChange)="onReasonCodeChange()">
              <mat-option value="SECOND_CAN">{{ i18n.t('collection.reasonSecondCan') }}</mat-option>
              <mat-option value="RETEST">{{ i18n.t('collection.reasonRetest') }}</mat-option>
              <mat-option value="CORRECTION">{{ i18n.t('collection.reasonCorrection') }}</mat-option>
              <mat-option value="OTHER">{{ i18n.t('collection.reasonOther') }}</mat-option>
            </mat-select>
            <mat-error *ngIf="form.get('reasonCode')?.hasError('required')">
              {{ i18n.t('collection.reasonRequired') }}
            </mat-error>
          </mat-form-field>

          <mat-form-field *ngIf="showOtherReason" appearance="outline" class="full-width">
            <mat-label>{{ i18n.t('collection.otherReasonExplanation') }} *</mat-label>
            <input matInput formControlName="otherReasonText" placeholder="उदा. दुसरा खेप / वेगळे भांडे" />
            <mat-error *ngIf="form.get('otherReasonText')?.hasError('required')">
              {{ i18n.t('collection.explanationRequired') }}
            </mat-error>
          </mat-form-field>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="onCancel()">
          {{ i18n.t('common.cancel') }}
        </button>
        <button
          mat-raised-button
          color="warn"
          type="button"
          [disabled]="form.invalid"
          (click)="onConfirm()"
        >
          <mat-icon>check_circle</mat-icon>
          <span>{{ i18n.t('collection.confirmDuplicateSave') }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      min-width: 480px;
      max-width: 600px;
      padding: 8px;
    }
    .warning-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #c62828;
    }
    .farmer-summary-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #fff8e1;
      border: 1px solid #ffe082;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 12px;
    }
    .farmer-id-badge {
      font-weight: 700;
      font-family: monospace;
      font-size: 16px;
      background: #e65100;
      color: #fff;
      padding: 4px 10px;
      border-radius: 6px;
    }
    .farmer-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .farmer-name {
      font-size: 16px;
      font-weight: 600;
    }
    .milk-type-tag {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .milk-type-tag.cow {
      background: #e8f5e9;
      color: #2e7d32;
    }
    .milk-type-tag.buffalo {
      background: #ede7f6;
      color: #512da8;
    }
    .warning-text {
      color: #d32f2f;
      font-size: 14px;
      font-weight: 500;
      margin: 8px 0 12px 0;
    }
    .existing-records-box {
      background: #f5f5f5;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 16px;
    }
    .existing-records-box h4 {
      margin: 0 0 6px 0;
      font-size: 13px;
      color: #616161;
    }
    .existing-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .existing-table th, .existing-table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }
    .existing-table th {
      font-size: 11px;
      color: #757575;
      text-transform: uppercase;
    }
    .full-width {
      width: 100%;
    }
    .mono {
      font-family: monospace;
    }
    .font-bold {
      font-weight: 700;
    }
  `],
})
export class DuplicateConfirmDialogComponent {
  public readonly i18n = inject(I18nService);
  private readonly fb = inject(FormBuilder);

  public readonly form: FormGroup = this.fb.group({
    reasonCode: ['SECOND_CAN', [Validators.required]],
    otherReasonText: [''],
  });

  public get showOtherReason(): boolean {
    return this.form.get('reasonCode')?.value === 'OTHER';
  }

  constructor(
    public dialogRef: MatDialogRef<DuplicateConfirmDialogComponent, DuplicateConfirmDialogResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: DuplicateConfirmDialogData
  ) {
    this.onReasonCodeChange();
  }

  public onReasonCodeChange(): void {
    const code = this.form.get('reasonCode')?.value;
    const otherCtrl = this.form.get('otherReasonText');
    if (code === 'OTHER') {
      otherCtrl?.setValidators([Validators.required, Validators.minLength(2)]);
    } else {
      otherCtrl?.clearValidators();
      otherCtrl?.setValue('');
    }
    otherCtrl?.updateValueAndValidity();
  }

  public onConfirm(): void {
    if (this.form.invalid) return;

    const code = this.form.get('reasonCode')?.value as DuplicateReason;
    let finalReason: string = code;
    if (code === 'OTHER') {
      finalReason = `OTHER: ${this.form.get('otherReasonText')?.value?.trim()}`;
    }

    this.dialogRef.close({
      confirmed: true,
      duplicateReason: finalReason,
    });
  }

  public onCancel(): void {
    this.dialogRef.close(null);
  }
}
