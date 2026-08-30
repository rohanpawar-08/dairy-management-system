import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/services/i18n.service';
import { PaymentDto, VoidPaymentPayload } from '../../../../../shared/ipc-contracts';

export interface VoidPaymentDialogData {
  payment: PaymentDto;
}

@Component({
  selector: 'app-void-payment-dialog',
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
        <mat-icon color="warn">undo</mat-icon>
        <span>{{ i18n.t('settlements.voidPaymentTitle') }}</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <p class="subtitle">
          {{ i18n.t('settlements.voidPaymentSubtitle') }}: <strong>{{ data.payment.paymentNumber }}</strong>
          (₹{{ (data.payment.amountPaise / 100).toFixed(2) }} - {{ data.payment.farmerMemberCode }} {{ data.payment.farmerNameMr }})
        </p>

        <form [formGroup]="form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ i18n.t('settlements.voidReason') }} *</mat-label>
            <input
              matInput
              type="text"
              formControlName="reason"
              placeholder="उदा. चुकीची रक्कम नोंदवली / धनादेश अनादरित (Bounce) झाला"
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
          <mat-icon>undo</mat-icon>
          <span>{{ i18n.t('settlements.voidPaymentAction') }}</span>
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
export class VoidPaymentDialogComponent {
  public readonly i18n = inject(I18nService);
  private readonly fb = inject(FormBuilder);

  public readonly form: FormGroup = this.fb.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor(
    public dialogRef: MatDialogRef<VoidPaymentDialogComponent, VoidPaymentPayload | null>,
    @Inject(MAT_DIALOG_DATA) public data: VoidPaymentDialogData
  ) {}

  public onConfirm(): void {
    if (this.form.invalid) return;

    const payload: VoidPaymentPayload = {
      paymentId: this.data.payment.id,
      reason: this.form.value.reason.trim(),
    };

    this.dialogRef.close(payload);
  }

  public onCancel(): void {
    this.dialogRef.close(null);
  }
}
