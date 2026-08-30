import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { ShiftDto } from '../../../../../shared/ipc-contracts';
import { I18nService } from '../../../core/services/i18n.service';

export interface ReopenShiftDialogData {
  shift: ShiftDto;
}

@Component({
  selector: 'app-reopen-shift-dialog',
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
        <mat-icon color="primary">lock_open</mat-icon>
        <span>{{ i18n.t('collection.reopenShiftTitle') }}</span>
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

        <p class="reopen-notice">
          {{ i18n.t('collection.reopenShiftDesc') }}
        </p>

        <form [formGroup]="form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ i18n.t('collection.reopenReasonLabel') }} *</mat-label>
            <textarea
              matInput
              rows="3"
              formControlName="reason"
              placeholder="उदा. उशिरा आलेल्या शेतकऱ्यांचे दूध नोंदवण्यासाठी"
            ></textarea>
            <mat-error *ngIf="form.get('reason')?.hasError('required')">
              {{ i18n.t('collection.reopenReasonRequired') }}
            </mat-error>
            <mat-error *ngIf="form.get('reason')?.hasError('minlength')">
              {{ i18n.t('collection.reopenReasonMinLength') }}
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
          color="primary"
          type="button"
          [disabled]="form.invalid"
          (click)="onConfirm()"
        >
          <mat-icon>lock_open</mat-icon>
          <span>{{ i18n.t('collection.confirmReopenShiftBtn') }}</span>
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
    }
    .shift-meta-box {
      display: flex;
      justify-content: space-between;
      background: #f5f5f5;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 14px;
    }
    .reopen-notice {
      color: #555;
      font-size: 13px;
      margin: 8px 0 12px 0;
    }
    .full-width {
      width: 100%;
    }
  `],
})
export class ReopenShiftDialogComponent {
  public readonly i18n = inject(I18nService);
  private readonly fb = inject(FormBuilder);

  public readonly form: FormGroup = this.fb.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor(
    public dialogRef: MatDialogRef<ReopenShiftDialogComponent, string | null>,
    @Inject(MAT_DIALOG_DATA) public data: ReopenShiftDialogData
  ) {}

  public onConfirm(): void {
    if (this.form.invalid) return;
    this.dialogRef.close(this.form.get('reason')?.value?.trim() || null);
  }

  public onCancel(): void {
    this.dialogRef.close(null);
  }
}
