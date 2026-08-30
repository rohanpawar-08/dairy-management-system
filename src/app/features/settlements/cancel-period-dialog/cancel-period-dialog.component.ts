import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/services/i18n.service';
import { CancelSettlementDraftPayload, SettlementPeriodDto } from '../../../../../shared/ipc-contracts';

export interface CancelPeriodDialogData {
  period: SettlementPeriodDto;
}

@Component({
  selector: 'app-cancel-period-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <div class="dialog-container">
      <h2 mat-dialog-title class="dialog-header">
        <mat-icon color="warn">cancel</mat-icon>
        <span>{{ i18n.t('settlements.cancelDraftTitle') }}</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <p class="subtitle">
          {{ i18n.t('settlements.cancelDraftSubtitle') }}: <strong>{{ data.period.settlementNumber }}</strong> ({{ data.period.periodStart }} - {{ data.period.periodEnd }})
        </p>

        <form [formGroup]="form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ i18n.t('settlements.cancellationReason') }} *</mat-label>
            <input
              matInput
              type="text"
              formControlName="reason"
              placeholder="उदा. चुकीचा कालावधी / पुन्हा नवीन ड्राफ्ट तयार करायचा आहे"
            />
            <mat-error *ngIf="form.get('reason')?.hasError('required')">
              {{ i18n.t('settlements.reasonRequired') }}
            </mat-error>
            <mat-error *ngIf="form.get('reason')?.hasError('minlength')">
              {{ i18n.t('settlements.reasonMinLength') }}
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
          <mat-icon>cancel</mat-icon>
          <span>{{ i18n.t('settlements.cancelDraftAction') }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      min-width: 420px;
      max-width: 500px;
      padding: 8px;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 18px;
      font-weight: 600;
    }
    .subtitle {
      color: #555;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .full-width {
      width: 100%;
    }
  `],
})
export class CancelPeriodDialogComponent {
  public readonly i18n = inject(I18nService);
  private readonly fb = inject(FormBuilder);

  public readonly form: FormGroup = this.fb.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor(
    public dialogRef: MatDialogRef<CancelPeriodDialogComponent, CancelSettlementDraftPayload | null>,
    @Inject(MAT_DIALOG_DATA) public data: CancelPeriodDialogData
  ) {}

  public onConfirm(): void {
    if (this.form.invalid) return;

    const payload: CancelSettlementDraftPayload = {
      periodId: this.data.period.id,
      reason: this.form.value.reason.trim(),
    };

    this.dialogRef.close(payload);
  }

  public onCancel(): void {
    this.dialogRef.close(null);
  }
}
