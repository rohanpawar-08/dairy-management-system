import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/services/i18n.service';
import { AuthStateService } from '../../../core/services/auth-state.service';
import { CreateSettlementDraftPayload } from '../../../../../shared/ipc-contracts';

export function calculateDefaultPeriodStart(
  startDayName: string = 'MONDAY',
  baseDate: Date = new Date()
): string {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const targetIdx = days.indexOf(startDayName.toUpperCase());
  const validTargetIdx = targetIdx >= 0 ? targetIdx : 1;

  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const d = baseDate.getDate();
  const utcDate = new Date(Date.UTC(y, m, d));

  let diff = utcDate.getUTCDay() - validTargetIdx;
  if (diff < 0) {
    diff += 7;
  }
  utcDate.setUTCDate(utcDate.getUTCDate() - diff);

  const resY = utcDate.getUTCFullYear();
  const resM = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const resD = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

@Component({
  selector: 'app-create-period-dialog',
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
        <mat-icon color="primary">date_range</mat-icon>
        <span>{{ i18n.t('settlements.createDraftTitle') }}</span>
      </h2>

      <mat-dialog-content class="dialog-content">
        <p class="subtitle">{{ i18n.t('settlements.createDraftSubtitle') }}</p>

        <form [formGroup]="form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ i18n.t('settlements.periodStart') }} (YYYY-MM-DD) *</mat-label>
            <input matInput type="date" formControlName="periodStart" (change)="onStartDateChange()" />
            <mat-error *ngIf="form.get('periodStart')?.hasError('required')">
              {{ i18n.t('settlements.startDateRequired') }}
            </mat-error>
          </mat-form-field>

          <div class="period-preview-box" *ngIf="calculatedEnd">
            <mat-icon color="accent">info</mat-icon>
            <div>
              <strong>{{ i18n.t('settlements.calculatedRange') }}:</strong>
              <span> {{ form.get('periodStart')?.value }} - {{ calculatedEnd }}</span>
            </div>
          </div>
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
          <mat-icon>add_task</mat-icon>
          <span>{{ i18n.t('settlements.createDraftAction') }}</span>
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
      color: #666;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .full-width {
      width: 100%;
    }
    .period-preview-box {
      background: #e3f2fd;
      border: 1px solid #bbdefb;
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: #0d47a1;
    }
  `],
})
export class CreatePeriodDialogComponent {
  public readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthStateService);
  private readonly fb = inject(FormBuilder);

  public calculatedEnd: string = '';

  public readonly form: FormGroup = this.fb.group({
    periodStart: [this.getDefaultStartDate(), [Validators.required]],
  });

  constructor(public dialogRef: MatDialogRef<CreatePeriodDialogComponent, CreateSettlementDraftPayload | null>) {
    this.onStartDateChange();
  }

  public getDefaultStartDate(): string {
    const configuredDay = this.auth.dairyProfile()?.settlementStartDay || 'MONDAY';
    return calculateDefaultPeriodStart(configuredDay);
  }

  public onStartDateChange(): void {
    const val = this.form.get('periodStart')?.value;
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const [y, m, d] = val.split('-').map((v: string) => parseInt(v, 10));
      const end = new Date(Date.UTC(y, m - 1, d));
      end.setUTCDate(end.getUTCDate() + 6);
      this.calculatedEnd = end.toISOString().slice(0, 10);
    } else {
      this.calculatedEnd = '';
    }
  }

  public onConfirm(): void {
    if (this.form.invalid) return;

    const payload: CreateSettlementDraftPayload = {
      periodStart: this.form.value.periodStart,
    };

    this.dialogRef.close(payload);
  }

  public onCancel(): void {
    this.dialogRef.close(null);
  }
}
