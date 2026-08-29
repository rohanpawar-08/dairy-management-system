import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';
import { RatePlanStateService } from '../../../core/services/rate-plan-state.service';
import {
  RatePlanDto,
  RatePlanMilkType,
  CreateRatePlanDraftPayload,
  UpdateRatePlanDraftPayload,
} from '../../../../../shared/ipc-contracts';
import {
  parseRupeesToPaise,
  formatPaiseAsRupees,
  parsePercentToX100,
  formatX100AsPercent,
} from '../../../../../shared/money';

export interface RatePlanFormDialogData {
  mode: 'create' | 'edit';
  plan?: RatePlanDto;
}

@Component({
  selector: 'app-rate-plan-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
  ],
  templateUrl: './rate-plan-form-dialog.component.html',
  styleUrls: ['./rate-plan-form-dialog.component.scss'],
})
export class RatePlanFormDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<RatePlanFormDialogComponent>);
  readonly data = inject<RatePlanFormDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  readonly i18n = inject(I18nService);
  private readonly ratePlanState = inject(RatePlanStateService);

  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  planForm: FormGroup = this.fb.group({
    planName: ['', [Validators.required, Validators.maxLength(100)]],
    milkType: ['COW' as RatePlanMilkType, [Validators.required]],
    effectiveFrom: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    effectiveTo: ['', [Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    fatRateRupees: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    snfRateRupees: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    minimumFatPercent: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    maximumFatPercent: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    fatStepPercent: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    minimumSnfPercent: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    maximumSnfPercent: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    snfStepPercent: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    notes: ['', [Validators.maxLength(500)]],
  });

  ngOnInit(): void {
    if (this.data.mode === 'edit' && this.data.plan) {
      const p = this.data.plan;
      this.planForm.patchValue({
        planName: p.planName,
        milkType: p.milkType,
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo || '',
        fatRateRupees: formatPaiseAsRupees(p.parameters.fatRatePaisePerPoint),
        snfRateRupees: formatPaiseAsRupees(p.parameters.snfRatePaisePerPoint),
        minimumFatPercent: formatX100AsPercent(p.parameters.minimumFatX100),
        maximumFatPercent: formatX100AsPercent(p.parameters.maximumFatX100),
        fatStepPercent: formatX100AsPercent(p.parameters.fatStepX100),
        minimumSnfPercent: formatX100AsPercent(p.parameters.minimumSnfX100),
        maximumSnfPercent: formatX100AsPercent(p.parameters.maximumSnfX100),
        snfStepPercent: formatX100AsPercent(p.parameters.snfStepX100),
        notes: p.notes || '',
      });
    }
  }

  async savePlan(): Promise<void> {
    if (this.planForm.invalid) {
      this.planForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const val = this.planForm.getRawValue();

    try {
      const fatRatePaise = parseRupeesToPaise(val.fatRateRupees);
      const snfRatePaise = parseRupeesToPaise(val.snfRateRupees);
      const minFatX100 = parsePercentToX100(val.minimumFatPercent);
      const maxFatX100 = parsePercentToX100(val.maximumFatPercent);
      const fatStepX100 = parsePercentToX100(val.fatStepPercent);
      const minSnfX100 = parsePercentToX100(val.minimumSnfPercent);
      const maxSnfX100 = parsePercentToX100(val.maximumSnfPercent);
      const snfStepX100 = parsePercentToX100(val.snfStepPercent);

      const payload: CreateRatePlanDraftPayload | UpdateRatePlanDraftPayload = {
        planName: val.planName.trim(),
        milkType: val.milkType,
        effectiveFrom: val.effectiveFrom.trim(),
        effectiveTo: val.effectiveTo?.trim() || null,
        notes: val.notes?.trim() || null,
        parameters: {
          fatRatePaisePerPoint: fatRatePaise,
          snfRatePaisePerPoint: snfRatePaise,
          minimumFatX100: minFatX100,
          maximumFatX100: maxFatX100,
          fatStepX100: fatStepX100,
          minimumSnfX100: minSnfX100,
          maximumSnfX100: maxSnfX100,
          snfStepX100: snfStepX100,
        },
      };

      if (this.data.mode === 'create') {
        await this.ratePlanState.createDraft(payload);
      } else if (this.data.plan) {
        await this.ratePlanState.updateDraft(this.data.plan.id, payload);
      }

      this.dialogRef.close(true);
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Failed to save rate plan draft'
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
