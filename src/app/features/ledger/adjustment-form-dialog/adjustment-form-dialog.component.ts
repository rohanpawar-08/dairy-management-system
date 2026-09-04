import { Component, Inject, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import {
  AdjustmentCategory,
  AdjustmentEntryType,
  CreateAdjustmentPayload,
} from '../../../../../shared/ipc-contracts';
import { I18nService } from '../../../core/services/i18n.service';
import { parseRupeesToPaise } from '../../../../../shared/money';

export function positiveAdjustmentPaiseValidator(
  control: AbstractControl
): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined || String(value).trim() === '') return null;

  try {
    return parseRupeesToPaise(String(value).trim()) > 0
      ? null
      : { positivePaise: true };
  } catch {
    return null;
  }
}

export interface AdjustmentFormDialogData {
  farmerId: number;
  memberCode: string;
  farmerNameMr: string;
  farmerNameEn?: string | null;
}

interface CategoryOption {
  value: AdjustmentCategory;
  labelMr: string;
  labelEn: string;
}

@Component({
  selector: 'app-adjustment-form-dialog',
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
        <mat-icon color="primary">add_card</mat-icon>
        <span>{{ i18n.t('ledger.addAdjustmentTitle') }}</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <div class="farmer-summary-box">
          <span class="label">{{ i18n.t('farmers.farmerName') }}:</span>
          <span class="val bold">{{ data.memberCode }} - {{ data.farmerNameMr }}</span>
        </div>

        <form [formGroup]="form">
          <div class="row-2">
            <!-- Entry Type -->
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>{{ i18n.t('ledger.entryType') }} *</mat-label>
              <mat-select formControlName="entryType">
                <mat-option value="ADVANCE">{{ i18n.t('ledger.typeAdvance') }}</mat-option>
                <mat-option value="DEDUCTION">{{ i18n.t('ledger.typeDeduction') }}</mat-option>
                <mat-option value="CREDIT">{{ i18n.t('ledger.typeCredit') }}</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- Category -->
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>{{ i18n.t('ledger.category') }} *</mat-label>
              <mat-select formControlName="category">
                <mat-option *ngFor="let opt of currentCategories" [value]="opt.value">
                  {{ i18n.currentLanguage() === 'mr' ? opt.labelMr : opt.labelEn }}
                </mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <div class="row-2">
            <!-- Amount in Rupees -->
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>{{ i18n.t('ledger.amountRupees') }} (₹) *</mat-label>
              <input
                matInput
                type="text"
                formControlName="amountRupees"
                placeholder="उदा. 500.00"
              />
              <mat-error *ngIf="form.get('amountRupees')?.hasError('required')">
                {{ i18n.t('ledger.amountRequired') }}
              </mat-error>
              <mat-error *ngIf="form.get('amountRupees')?.hasError('pattern')">
                {{ i18n.t('ledger.amountInvalid') }}
              </mat-error>
              <mat-error *ngIf="form.get('amountRupees')?.hasError('positivePaise')">
                {{ i18n.t('ledger.amountPositive') }}
              </mat-error>
            </mat-form-field>

            <!-- Business Date -->
            <mat-form-field appearance="outline" class="half-width">
              <mat-label>{{ i18n.t('collection.businessDate') }} *</mat-label>
              <input matInput type="date" formControlName="businessDate" />
            </mat-form-field>
          </div>

          <!-- Reason -->
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ i18n.t('ledger.reasonLabel') }} *</mat-label>
            <input
              matInput
              type="text"
              formControlName="reason"
              placeholder="उदा. २ पोती सरकी पेंड / दिवाळी बोनस"
            />
            <mat-error *ngIf="form.get('reason')?.hasError('required')">
              {{ i18n.t('ledger.reasonRequired') }}
            </mat-error>
            <mat-error *ngIf="form.get('reason')?.hasError('minlength')">
              {{ i18n.t('ledger.reasonMinLength') }}
            </mat-error>
          </mat-form-field>

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
          <span>{{ i18n.t('common.save') }}</span>
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
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 14px;
      display: flex;
      gap: 8px;
    }
    .label {
      color: #555;
    }
    .bold {
      font-weight: 700;
      color: #1b5e20;
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
export class AdjustmentFormDialogComponent implements OnInit {
  public readonly i18n = inject(I18nService);
  private readonly fb = inject(FormBuilder);

  public readonly categoriesMap: Record<AdjustmentEntryType, CategoryOption[]> = {
    ADVANCE: [
      { value: 'CASH_ADVANCE', labelMr: 'रक्कम उचल (कॅश अॅडव्हान्स)', labelEn: 'Cash Advance' },
    ],
    DEDUCTION: [
      { value: 'CATTLE_FEED', labelMr: 'पशुखाद्य (सरकी पेंड/पशुआहार)', labelEn: 'Cattle Feed' },
      { value: 'MEDICINE', labelMr: 'वैद्यकीय / औषध कपात', labelEn: 'Veterinary Medicine' },
      { value: 'LOAN_RECOVERY', labelMr: 'कर्ज / उचल वसुली', labelEn: 'Loan Recovery' },
      { value: 'EQUIPMENT', labelMr: 'डेअरी साहित्य कपात', labelEn: 'Dairy Equipment' },
      { value: 'OTHER_DEDUCTION', labelMr: 'इतर कपात', labelEn: 'Other Deduction' },
    ],
    CREDIT: [
      { value: 'BONUS', labelMr: 'बोनस / विशेष रक्कम', labelEn: 'Bonus / Incentive' },
      { value: 'PRICE_CORRECTION', labelMr: 'दर फरक / दुरुस्ती जमा', labelEn: 'Price Correction Credit' },
      { value: 'OTHER_CREDIT', labelMr: 'इतर जमा', labelEn: 'Other Credit' },
    ],
  };

  public currentCategories: CategoryOption[] = [];

  public readonly form: FormGroup = this.fb.group({
    entryType: ['DEDUCTION', [Validators.required]],
    category: ['CATTLE_FEED', [Validators.required]],
    amountRupees: [
      '',
      [
        Validators.required,
        Validators.pattern(/^\d+(\.\d{1,2})?$/),
        positiveAdjustmentPaiseValidator,
      ],
    ],
    businessDate: [new Date().toISOString().substring(0, 10), [Validators.required]],
    reason: ['', [Validators.required, Validators.minLength(2)]],
    notes: [''],
  });

  constructor(
    public dialogRef: MatDialogRef<AdjustmentFormDialogComponent, CreateAdjustmentPayload | null>,
    @Inject(MAT_DIALOG_DATA) public data: AdjustmentFormDialogData
  ) {}

  ngOnInit(): void {
    this.updateCategoryOptions('DEDUCTION');

    this.form.get('entryType')?.valueChanges.subscribe((type: AdjustmentEntryType) => {
      this.updateCategoryOptions(type);
    });
  }

  private updateCategoryOptions(entryType: AdjustmentEntryType): void {
    this.currentCategories = this.categoriesMap[entryType] || [];
    if (this.currentCategories.length > 0) {
      this.form.get('category')?.setValue(this.currentCategories[0].value);
    }
  }

  public onConfirm(): void {
    if (this.form.invalid) return;

    const val = this.form.value;
    const payload: CreateAdjustmentPayload = {
      farmerId: this.data.farmerId,
      entryType: val.entryType,
      category: val.category,
      amountRupees: val.amountRupees.trim(),
      businessDate: val.businessDate,
      reason: val.reason.trim(),
      notes: val.notes?.trim() || undefined,
    };

    this.dialogRef.close(payload);
  }

  public onCancel(): void {
    this.dialogRef.close(null);
  }
}
