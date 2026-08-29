import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';
import { RatePlanStateService } from '../../../core/services/rate-plan-state.service';
import { RatePlanDto } from '../../../../../shared/ipc-contracts';
import { formatPaiseAsRupees, formatX100AsPercent } from '../../../../../shared/money';

export interface RatePlanApproveDialogData {
  plan: RatePlanDto;
  conflictingPlan?: RatePlanDto | null;
}

@Component({
  selector: 'app-rate-plan-approve-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
  ],
  template: `
    <div class="approve-dialog-container">
      <h2 mat-dialog-title class="dialog-title">
        <mat-icon color="primary">verified</mat-icon>
        <span>{{ 'rates.approveTitle' | translate }}</span>
      </h2>

      <mat-progress-bar *ngIf="isSaving()" mode="indeterminate"></mat-progress-bar>

      <div *ngIf="errorMessage()" class="dialog-error-banner">
        <mat-icon>error_outline</mat-icon>
        <span>{{ errorMessage() }}</span>
      </div>

      <mat-dialog-content class="dialog-content">
        <div class="immutability-notice">
          <mat-icon>lock</mat-icon>
          <span>{{ 'rates.immutabilityNotice' | translate }}</span>
        </div>

        <div class="plan-details-card">
          <div class="detail-row">
            <span class="label">{{ 'rates.planName' | translate }}:</span>
            <span class="value"><strong>{{ data.plan.planName }}</strong></span>
          </div>
          <div class="detail-row">
            <span class="label">{{ 'rates.milkType' | translate }}:</span>
            <span class="value">{{ data.plan.milkType === 'COW' ? ('milk.cow' | translate) : ('milk.buffalo' | translate) }}</span>
          </div>
          <div class="detail-row">
            <span class="label">{{ 'rates.effectivePeriod' | translate }}:</span>
            <span class="value">{{ data.plan.effectiveFrom }} {{ data.plan.effectiveTo ? ('ते ' + data.plan.effectiveTo) : ('(पुढे चालू)') }}</span>
          </div>
          <div class="detail-row">
            <span class="label">{{ 'rates.rateCoefficients' | translate }}:</span>
            <span class="value">FAT ₹{{ formatRupees(data.plan.parameters.fatRatePaisePerPoint) }}/pt | SNF ₹{{ formatRupees(data.plan.parameters.snfRatePaisePerPoint) }}/pt</span>
          </div>
          <div class="detail-row">
            <span class="label">{{ 'rates.qualityBounds' | translate }}:</span>
            <span class="value">FAT {{ formatPercent(data.plan.parameters.minimumFatX100) }}%–{{ formatPercent(data.plan.parameters.maximumFatX100) }}% | SNF {{ formatPercent(data.plan.parameters.minimumSnfX100) }}%–{{ formatPercent(data.plan.parameters.maximumSnfX100) }}%</span>
          </div>
        </div>

        <div *ngIf="data.conflictingPlan" class="supersede-alert">
          <mat-icon>info</mat-icon>
          <div>
            <strong>{{ 'rates.supersedeAlertTitle' | translate }}</strong>
            <p>
              {{ 'rates.supersedeAlertDesc' | translate }}:
              <strong>{{ data.conflictingPlan.planName }}</strong>.
            </p>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" (click)="dialogRef.close(false)" [disabled]="isSaving()">
          {{ 'common.cancel' | translate }}
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="confirmApproval()"
          [disabled]="isSaving()"
        >
          <mat-icon>check_circle</mat-icon>
          <span>{{ data.conflictingPlan ? ('rates.approveAndSupersede' | translate) : ('rates.approvePlan' | translate) }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .approve-dialog-container {
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
      .immutability-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background-color: #fef3c7;
        border: 1px solid #fde68a;
        color: #92400e;
        border-radius: 8px;
        font-size: 0.875rem;
        margin-bottom: 14px;
        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
      .plan-details-card {
        padding: 12px 16px;
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        margin-bottom: 14px;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 0.9rem;
        .label {
          color: #64748b;
        }
        .value {
          color: #1e293b;
        }
      }
      .supersede-alert {
        display: flex;
        gap: 12px;
        padding: 12px 16px;
        background-color: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1e40af;
        border-radius: 8px;
        font-size: 0.875rem;
        mat-icon {
          font-size: 22px;
          width: 22px;
          height: 22px;
        }
        p {
          margin: 4px 0 0 0;
        }
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
export class RatePlanApproveDialogComponent {
  readonly dialogRef = inject(MatDialogRef<RatePlanApproveDialogComponent>);
  readonly data = inject<RatePlanApproveDialogData>(MAT_DIALOG_DATA);
  readonly i18n = inject(I18nService);
  private readonly ratePlanState = inject(RatePlanStateService);

  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  formatRupees(paise: number): string {
    return formatPaiseAsRupees(paise);
  }

  formatPercent(x100: number): string {
    return formatX100AsPercent(x100);
  }

  async confirmApproval(): Promise<void> {
    this.isSaving.set(true);
    this.errorMessage.set(null);

    try {
      if (this.data.conflictingPlan) {
        await this.ratePlanState.supersedePlan({
          oldPlanId: this.data.conflictingPlan.id,
          newPlanId: this.data.plan.id,
          newEffectiveFrom: this.data.plan.effectiveFrom,
        });
      } else {
        await this.ratePlanState.approvePlan(this.data.plan.id);
      }
      this.dialogRef.close(true);
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Failed to approve rate plan'
      );
    } finally {
      this.isSaving.set(false);
    }
  }
}
