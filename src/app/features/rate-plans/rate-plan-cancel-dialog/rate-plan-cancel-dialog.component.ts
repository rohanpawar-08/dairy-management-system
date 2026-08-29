import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';
import { RatePlanStateService } from '../../../core/services/rate-plan-state.service';
import { RatePlanDto } from '../../../../../shared/ipc-contracts';

export interface RatePlanCancelDialogData {
  plan: RatePlanDto;
}

@Component({
  selector: 'app-rate-plan-cancel-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
  ],
  template: `
    <div class="cancel-dialog-container">
      <h2 mat-dialog-title class="dialog-title">
        <mat-icon color="warn">cancel</mat-icon>
        <span>{{ 'rates.cancelPlanTitle' | translate }}</span>
      </h2>

      <mat-progress-bar *ngIf="isSaving()" mode="indeterminate"></mat-progress-bar>

      <div *ngIf="errorMessage()" class="dialog-error-banner">
        <mat-icon>error_outline</mat-icon>
        <span>{{ errorMessage() }}</span>
      </div>

      <mat-dialog-content class="dialog-content">
        <p class="warning-text">
          {{ 'rates.cancelWarningText' | translate }}:
          <strong>{{ data.plan.planName }}</strong>.
        </p>

        <form [formGroup]="cancelForm" (ngSubmit)="confirmCancel()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'rates.cancellationReason' | translate }} *</mat-label>
            <textarea
              matInput
              formControlName="reason"
              rows="3"
              placeholder="उदा. चुकीचे दर नमूद केल्यामुळे रद्द केले."
            ></textarea>
            <mat-error *ngIf="cancelForm.get('reason')?.hasError('required')">
              {{ 'rates.validation.reasonRequired' | translate }}
            </mat-error>
          </mat-form-field>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="dialogRef.close(false)" [disabled]="isSaving()">
          {{ 'common.cancel' | translate }}
        </button>
        <button
          mat-flat-button
          color="warn"
          type="button"
          (click)="confirmCancel()"
          [disabled]="isSaving() || cancelForm.invalid"
        >
          <mat-icon>cancel</mat-icon>
          <span>{{ 'rates.confirmCancelPlan' | translate }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .cancel-dialog-container {
        min-width: 480px;
        max-width: 580px;
        padding: 8px 4px;
      }
      .dialog-title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 0 12px 0;
        font-size: 1.25rem;
      }
      .warning-text {
        font-size: 0.95rem;
        color: #334155;
        margin-bottom: 16px;
      }
      .full-width {
        width: 100%;
      }
      .dialog-error-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        margin-bottom: 12px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        border-radius: 6px;
      }
      .dialog-actions {
        padding: 16px 0 8px 0;
        gap: 10px;
      }
    `,
  ],
})
export class RatePlanCancelDialogComponent {
  readonly dialogRef = inject(MatDialogRef<RatePlanCancelDialogComponent>);
  readonly data = inject<RatePlanCancelDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  readonly i18n = inject(I18nService);
  private readonly ratePlanState = inject(RatePlanStateService);

  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  cancelForm: FormGroup = this.fb.group({
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });

  async confirmCancel(): Promise<void> {
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const reason = this.cancelForm.get('reason')?.value?.trim();

    try {
      await this.ratePlanState.cancelPlan(this.data.plan.id, reason);
      this.dialogRef.close(true);
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Failed to cancel rate plan'
      );
    } finally {
      this.isSaving.set(false);
    }
  }
}
