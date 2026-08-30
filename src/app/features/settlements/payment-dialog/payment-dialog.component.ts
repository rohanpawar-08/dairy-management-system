import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/services/i18n.service';
import { PaymentMethod, RecordPaymentPayload } from '../../../../../shared/ipc-contracts';

export interface PaymentDialogData {
  farmerId: number;
  memberCode: string;
  farmerNameMr: string;
  farmerNameEn?: string | null;
  outstandingBalancePaise: number;
}

@Component({
  selector: 'app-payment-dialog',
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
      <h2 mat-dialog-title class="dialog-header">
        <mat-icon color="primary">payments</mat-icon>
        <span>{{ i18n.t('settlements.recordPaymentTitle') }}</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <div class="farmer-summary-box">
          <div class="farmer-info">
            <span class="label">{{ i18n.t('farmers.farmerName') }}:</span>
            <span class="val bold">{{ data.memberCode }} - {{ data.farmerNameMr }}</span>
          </div>
          <div class="outstanding-info">
            <span class="label">{{ i18n.t('settlements.outstandingBalance') }}:</span>
            <span class="amount-val">₹{{ (data.outstandingBalancePaise / 100).toFixed(2) }}</span>
          </div>
        </div>

        <form [formGroup]="form">
          <div class="row-2">
            <!-- Amount in Rupees -->
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>{{ i18n.t('settlements.paymentAmount') }} (₹) *</mat-label>
              <input
                matInput
                type="text"
                formControlName="amountRupees"
                placeholder="उदा. 1000.00"
              />
              <mat-error *ngIf="form.get('amountRupees')?.hasError('required')">
                {{ i18n.t('ledger.amountRequired') }}
              </mat-error>
              <mat-error *ngIf="form.get('amountRupees')?.hasError('pattern')">
                {{ i18n.t('ledger.amountInvalid') }}
              </mat-error>
            </mat-form-field>

            <!-- Payment Method -->
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>{{ i18n.t('settlements.paymentMethod') }} *</mat-label>
              <mat-select formControlName="paymentMethod">
                <mat-option value="CASH">{{ i18n.t('settlements.methodCash') }}</mat-option>
                <mat-option value="BANK_TRANSFER">{{ i18n.t('settlements.methodBankTransfer') }}</mat-option>
                <mat-option value="UPI">{{ i18n.t('settlements.methodUpi') }}</mat-option>
                <mat-option value="CHEQUE">{{ i18n.t('settlements.methodCheque') }}</mat-option>
                <mat-option value="OTHER">{{ i18n.t('settlements.methodOther') }}</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <div class="row-2">
            <!-- Business Date -->
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>{{ i18n.t('collection.businessDate') }} *</mat-label>
              <input matInput type="date" formControlName="businessDate" />
            </mat-form-field>

            <!-- External Reference (Txn ID / Cheque No) -->
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>{{ i18n.t('settlements.externalRef') }}</mat-label>
              <input
                matInput
                type="text"
                formControlName="externalReference"
                placeholder="उदा. UPI Txn ID / धनादेश क्र."
              />
            </mat-form-field>
          </div>

          <!-- Notes -->
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ i18n.t('common.notes') }}</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="onCancel()">
          {{ i18n.t('common.cancel') }}
        </button>
        <button
          mat-raised-button
          color="primary"
          type="button"
          [disabled]="form.invalid"
          (click)="onConfirm()"
        >
          <mat-icon>save</mat-icon>
          <span>{{ i18n.t('settlements.recordPaymentAction') }}</span>
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
      font-size: 18px;
      font-weight: 600;
    }
    .farmer-summary-box {
      background: #e8f5e9;
      border: 1px solid #c8e6c9;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      font-size: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .farmer-info, .outstanding-info {
      display: flex;
      justify-content: space-between;
    }
    .label {
      color: #555;
    }
    .bold {
      font-weight: 700;
      color: #1b5e20;
    }
    .amount-val {
      font-weight: 700;
      color: #2e7d32;
      font-size: 15px;
    }
    .row-2 {
      display: flex;
      gap: 12px;
    }
    .half-width {
      flex: 1;
    }
    .full-width {
      width: 100%;
    }
  `],
})
export class PaymentDialogComponent {
  public readonly i18n = inject(I18nService);
  private readonly fb = inject(FormBuilder);

  public readonly form: FormGroup = this.fb.group({
    amountRupees: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    paymentMethod: ['CASH', [Validators.required]],
    businessDate: [new Date().toISOString().substring(0, 10), [Validators.required]],
    externalReference: [''],
    notes: [''],
  });

  constructor(
    public dialogRef: MatDialogRef<PaymentDialogComponent, RecordPaymentPayload | null>,
    @Inject(MAT_DIALOG_DATA) public data: PaymentDialogData
  ) {}

  public onConfirm(): void {
    if (this.form.invalid) return;

    const val = this.form.value;
    const payload: RecordPaymentPayload = {
      farmerId: this.data.farmerId,
      businessDate: val.businessDate,
      amountRupees: val.amountRupees.trim(),
      paymentMethod: val.paymentMethod as PaymentMethod,
      externalReference: val.externalReference?.trim() || undefined,
      notes: val.notes?.trim() || undefined,
    };

    this.dialogRef.close(payload);
  }

  public onCancel(): void {
    this.dialogRef.close(null);
  }
}
