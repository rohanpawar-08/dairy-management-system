import { Component, OnInit, inject, signal } from '@angular/core';
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
import { RatePlanDto, CloneRatePlanPayload } from '../../../../../shared/ipc-contracts';
import { parseRupeesToPaise, formatPaiseAsRupees } from '../../../../../shared/money';

export interface RatePlanCloneDialogData {
  sourcePlan: RatePlanDto;
}

@Component({
  selector: 'app-rate-plan-clone-dialog',
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
    <div class="clone-dialog-container">
      <h2 mat-dialog-title class="dialog-title">
        <mat-icon color="accent">content_copy</mat-icon>
        <span>{{ 'rates.cloneTitle' | translate }}</span>
      </h2>

      <mat-progress-bar *ngIf="isSaving()" mode="indeterminate"></mat-progress-bar>

      <div *ngIf="errorMessage()" class="dialog-error-banner">
        <mat-icon>error_outline</mat-icon>
        <span>{{ errorMessage() }}</span>
      </div>

      <mat-dialog-content class="dialog-content">
        <div class="source-summary-card">
          <div class="source-label">{{ 'rates.sourcePlan' | translate }}:</div>
          <div class="source-value">
            <strong>{{ data.sourcePlan.planName }}</strong> ({{ data.sourcePlan.milkType === 'COW' ? ('milk.cow' | translate) : ('milk.buffalo' | translate) }})
          </div>
          <div class="source-coeffs">
            FAT: ₹{{ formatPaise(data.sourcePlan.parameters.fatRatePaisePerPoint) }}/pt | SNF: ₹{{ formatPaise(data.sourcePlan.parameters.snfRatePaisePerPoint) }}/pt
          </div>
        </div>

        <form [formGroup]="cloneForm" class="clone-form" (ngSubmit)="submitClone()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'rates.newPlanName' | translate }} *</mat-label>
            <input matInput formControlName="newPlanName" />
            <mat-error *ngIf="cloneForm.get('newPlanName')?.hasError('required')">
              {{ 'rates.validation.nameRequired' | translate }}
            </mat-error>
          </mat-form-field>

          <div class="form-row">
            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>{{ 'rates.newEffectiveFrom' | translate }} (YYYY-MM-DD) *</mat-label>
              <input matInput type="date" formControlName="newEffectiveFrom" />
              <mat-error *ngIf="cloneForm.get('newEffectiveFrom')?.hasError('required')">
                {{ 'rates.validation.dateRequired' | translate }}
              </mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>{{ 'rates.effectiveTo' | translate }} ({{ 'common.optional' | translate }})</mat-label>
              <input matInput type="date" formControlName="newEffectiveTo" />
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>{{ 'rates.fatRateCoeff' | translate }} (₹/pt)</mat-label>
              <span matPrefix>₹&nbsp;</span>
              <input matInput formControlName="fatRateRupees" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>{{ 'rates.snfRateCoeff' | translate }} (₹/pt)</mat-label>
              <span matPrefix>₹&nbsp;</span>
              <input matInput formControlName="snfRateRupees" />
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'rates.notes' | translate }}</mat-label>
            <textarea matInput formControlName="notes" rows="2"></textarea>
          </mat-form-field>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="dialogRef.close(false)" [disabled]="isSaving()">
          {{ 'common.cancel' | translate }}
        </button>
        <button
          mat-flat-button
          color="accent"
          type="button"
          (click)="submitClone()"
          [disabled]="isSaving() || cloneForm.invalid"
        >
          <mat-icon>content_copy</mat-icon>
          <span>{{ 'rates.cloneAndCreateDraft' | translate }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .clone-dialog-container {
        min-width: 520px;
        max-width: 640px;
        padding: 8px 4px;
      }
      .dialog-title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 0 12px 0;
        font-size: 1.25rem;
      }
      .source-summary-card {
        padding: 12px 16px;
        background-color: #f1f5f9;
        border-radius: 8px;
        margin-bottom: 16px;
        font-size: 0.9rem;
        color: #334155;
      }
      .source-coeffs {
        margin-top: 4px;
        color: #64748b;
        font-weight: 500;
      }
      .clone-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .form-row {
        display: flex;
        gap: 12px;
        .flex-1 {
          flex: 1;
        }
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
export class RatePlanCloneDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<RatePlanCloneDialogComponent>);
  readonly data = inject<RatePlanCloneDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  readonly i18n = inject(I18nService);
  private readonly ratePlanState = inject(RatePlanStateService);

  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  cloneForm: FormGroup = this.fb.group({
    newPlanName: ['', [Validators.required, Validators.maxLength(100)]],
    newEffectiveFrom: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    newEffectiveTo: ['', [Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    fatRateRupees: ['', [Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    snfRateRupees: ['', [Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    notes: ['', [Validators.maxLength(500)]],
  });

  ngOnInit(): void {
    const src = this.data.sourcePlan;
    this.cloneForm.patchValue({
      newPlanName: `${src.planName} (प्रत)`,
      fatRateRupees: formatPaiseAsRupees(src.parameters.fatRatePaisePerPoint),
      snfRateRupees: formatPaiseAsRupees(src.parameters.snfRatePaisePerPoint),
      notes: src.notes ? `Cloned from ${src.planName}. ${src.notes}` : `Cloned from ${src.planName}`,
    });
  }

  formatPaise(paise: number): string {
    return formatPaiseAsRupees(paise);
  }

  async submitClone(): Promise<void> {
    if (this.cloneForm.invalid) {
      this.cloneForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const val = this.cloneForm.getRawValue();

    try {
      const payload: CloneRatePlanPayload = {
        sourcePlanId: this.data.sourcePlan.id,
        newPlanName: val.newPlanName.trim(),
        newEffectiveFrom: val.newEffectiveFrom.trim(),
        newEffectiveTo: val.newEffectiveTo?.trim() || null,
        notes: val.notes?.trim() || null,
        parameters: {
          fatRatePaisePerPoint: val.fatRateRupees
            ? parseRupeesToPaise(val.fatRateRupees)
            : undefined,
          snfRatePaisePerPoint: val.snfRateRupees
            ? parseRupeesToPaise(val.snfRateRupees)
            : undefined,
        },
      };

      await this.ratePlanState.clonePlan(payload);
      this.dialogRef.close(true);
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Failed to clone rate plan'
      );
    } finally {
      this.isSaving.set(false);
    }
  }
}
