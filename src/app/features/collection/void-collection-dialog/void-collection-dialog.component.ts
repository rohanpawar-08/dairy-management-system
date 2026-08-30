import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MilkCollectionDto } from '../../../../../shared/ipc-contracts';
import { I18nService } from '../../../core/services/i18n.service';

export interface VoidCollectionDialogData {
  collection: MilkCollectionDto;
}

export interface VoidCollectionDialogResult {
  collectionId: number;
  reason: string;
}

@Component({
  selector: 'app-void-collection-dialog',
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
      <h2 mat-dialog-title class="dialog-header danger-title">
        <mat-icon color="warn">delete_forever</mat-icon>
        <span>{{ i18n.t('collection.voidCollectionTitle') }}</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <div class="collection-summary-box">
          <div class="row">
            <span class="label">{{ i18n.t('collection.receiptNo') }}:</span>
            <span class="val mono bold">{{ data.collection.receiptNumber }}</span>
          </div>
          <div class="row">
            <span class="label">{{ i18n.t('farmers.farmerName') }}:</span>
            <span class="val bold">{{ data.collection.farmerMemberCode }} - {{ data.collection.farmerNameMr }}</span>
          </div>
          <div class="row">
            <span class="label">{{ i18n.t('collection.milkType') }}:</span>
            <span class="val">{{ data.collection.milkType }}</span>
          </div>
          <div class="row">
            <span class="label">{{ i18n.t('collection.quantity') }}:</span>
            <span class="val">{{ data.collection.quantityLitresFormatted }} L</span>
          </div>
          <div class="row">
            <span class="label">{{ i18n.t('collection.amount') }}:</span>
            <span class="val bold amount-text">{{ data.collection.amountRupeesFormatted }}</span>
          </div>
        </div>

        <p class="danger-warning">
          {{ i18n.t('collection.voidWarningMsg') }}
        </p>

        <form [formGroup]="form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ i18n.t('collection.voidReasonLabel') }} *</mat-label>
            <textarea
              matInput
              rows="3"
              formControlName="reason"
              placeholder="उदा. चुकीचे वजन टाकले गेले / शेतकऱ्याने दूध परत नेले"
            ></textarea>
            <mat-error *ngIf="form.get('reason')?.hasError('required')">
              {{ i18n.t('collection.voidReasonRequired') }}
            </mat-error>
            <mat-error *ngIf="form.get('reason')?.hasError('minlength')">
              {{ i18n.t('collection.voidReasonMinLength') }}
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
          <mat-icon>delete_forever</mat-icon>
          <span>{{ i18n.t('collection.confirmVoidBtn') }}</span>
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
    .danger-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #c62828;
    }
    .collection-summary-box {
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 13px;
    }
    .label {
      color: #757575;
    }
    .mono {
      font-family: monospace;
    }
    .bold {
      font-weight: 700;
    }
    .amount-text {
      color: #2e7d32;
      font-size: 14px;
    }
    .danger-warning {
      color: #c62828;
      font-size: 13px;
      font-weight: 500;
      margin: 8px 0 12px 0;
    }
    .full-width {
      width: 100%;
    }
  `],
})
export class VoidCollectionDialogComponent {
  public readonly i18n = inject(I18nService);
  private readonly fb = inject(FormBuilder);

  public readonly form: FormGroup = this.fb.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor(
    public dialogRef: MatDialogRef<VoidCollectionDialogComponent, VoidCollectionDialogResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: VoidCollectionDialogData
  ) {}

  public onConfirm(): void {
    if (this.form.invalid) return;

    this.dialogRef.close({
      collectionId: this.data.collection.id,
      reason: this.form.get('reason')?.value?.trim(),
    });
  }

  public onCancel(): void {
    this.dialogRef.close(null);
  }
}
