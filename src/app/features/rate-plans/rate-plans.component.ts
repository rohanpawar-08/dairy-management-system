import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { RatePlanStateService } from '../../core/services/rate-plan-state.service';
import {
  RatePlanDto,
  RatePlanFilter,
  RatePlanMilkType,
  CalculateRatePreviewResult,
} from '../../../../shared/ipc-contracts';
import {
  formatPaiseAsRupees,
  formatX100AsPercent,
  parsePercentToX100,
  parseLitresToMl,
} from '../../../../shared/money';
import { RatePlanFormDialogComponent } from './rate-plan-form-dialog/rate-plan-form-dialog.component';
import { RatePlanCloneDialogComponent } from './rate-plan-clone-dialog/rate-plan-clone-dialog.component';
import { RatePlanApproveDialogComponent } from './rate-plan-approve-dialog/rate-plan-approve-dialog.component';
import { RatePlanCancelDialogComponent } from './rate-plan-cancel-dialog/rate-plan-cancel-dialog.component';

@Component({
  selector: 'app-rate-plans',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatDialogModule,
    TranslatePipe,
  ],
  templateUrl: './rate-plans.component.html',
  styleUrls: ['./rate-plans.component.scss'],
})
export class RatePlansComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  readonly i18n = inject(I18nService);
  readonly authState = inject(AuthStateService);
  readonly ratePlanState = inject(RatePlanStateService);

  readonly selectedMilkFilter = signal<RatePlanMilkType | 'ALL'>('ALL');
  readonly selectedStatusFilter = signal<string>('ALL');

  readonly previewResult = signal<CalculateRatePreviewResult | null>(null);
  readonly isCalculating = signal<boolean>(false);

  calculatorForm: FormGroup = this.fb.group({
    milkType: ['COW' as RatePlanMilkType, [Validators.required]],
    fatPercent: ['4.00', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    snfPercent: ['8.50', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    quantityLitres: ['10.0', [Validators.pattern(/^\d+(\.\d{1,3})?$/)]],
  });

  displayedColumns: string[] = [
    'planName',
    'milkType',
    'status',
    'effectivePeriod',
    'fatCoeff',
    'snfCoeff',
    'bounds',
    'actions',
  ];

  async ngOnInit(): Promise<void> {
    await this.loadPlans();
  }

  async loadPlans(): Promise<void> {
    const filter: RatePlanFilter = {};
    if (this.selectedMilkFilter() !== 'ALL') {
      filter.milkType = this.selectedMilkFilter() as RatePlanMilkType;
    }
    if (this.selectedStatusFilter() !== 'ALL') {
      filter.status = this.selectedStatusFilter() as any;
    }
    await this.ratePlanState.loadPlans(filter);
  }

  onFilterChange(): void {
    this.loadPlans();
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(RatePlanFormDialogComponent, {
      data: { mode: 'create' },
      width: '680px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((saved) => {
      if (saved) {
        this.loadPlans();
      }
    });
  }

  openEditDialog(plan: RatePlanDto): void {
    const dialogRef = this.dialog.open(RatePlanFormDialogComponent, {
      data: { mode: 'edit', plan },
      width: '680px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((saved) => {
      if (saved) {
        this.loadPlans();
      }
    });
  }

  openCloneDialog(plan: RatePlanDto): void {
    const dialogRef = this.dialog.open(RatePlanCloneDialogComponent, {
      data: { sourcePlan: plan },
      width: '600px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((cloned) => {
      if (cloned) {
        this.loadPlans();
      }
    });
  }

  openApproveDialog(plan: RatePlanDto): void {
    // Find active conflicting plan for the same milk type
    const activePlan = plan.milkType === 'COW'
      ? this.ratePlanState.currentCowPlan()
      : this.ratePlanState.currentBuffaloPlan();

    const conflictingPlan = activePlan && activePlan.id !== plan.id ? activePlan : null;

    const dialogRef = this.dialog.open(RatePlanApproveDialogComponent, {
      data: { plan, conflictingPlan },
      width: '580px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((approved) => {
      if (approved) {
        this.loadPlans();
      }
    });
  }

  openCancelDialog(plan: RatePlanDto): void {
    const dialogRef = this.dialog.open(RatePlanCancelDialogComponent, {
      data: { plan },
      width: '520px',
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((cancelled) => {
      if (cancelled) {
        this.loadPlans();
      }
    });
  }

  async runCalculator(): Promise<void> {
    if (this.calculatorForm.invalid) {
      this.calculatorForm.markAllAsTouched();
      return;
    }

    this.isCalculating.set(true);
    this.previewResult.set(null);

    const val = this.calculatorForm.getRawValue();

    try {
      const fatX100 = parsePercentToX100(val.fatPercent);
      const snfX100 = parsePercentToX100(val.snfPercent);
      const quantityMl = val.quantityLitres ? parseLitresToMl(val.quantityLitres) : undefined;

      // Find current active approved plan for milk type
      const activePlan =
        val.milkType === 'COW'
          ? this.ratePlanState.currentCowPlan()
          : this.ratePlanState.currentBuffaloPlan();

      if (!activePlan) {
        this.previewResult.set({
          valid: false,
          ratePaisePerLitre: 0,
          rateRupeesFormatted: '₹0.00',
          error: `No approved rate plan exists for ${val.milkType} milk.`,
          errorMr: `${val.milkType === 'COW' ? 'गाय' : 'म्हैस'} दुधासाठी कोणताही मंजूर दर उपलब्ध नाही.`,
        });
        return;
      }

      const result = await this.ratePlanState.calculatePreview({
        planId: activePlan.id,
        milkType: val.milkType,
        fatX100,
        snfX100,
        quantityMl,
      });

      this.previewResult.set(result);
    } catch (err: unknown) {
      this.previewResult.set({
        valid: false,
        ratePaisePerLitre: 0,
        rateRupeesFormatted: '₹0.00',
        error: err instanceof Error ? err.message : 'Calculation failed',
      });
    } finally {
      this.isCalculating.set(false);
    }
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  formatRupees(paise: number): string {
    return formatPaiseAsRupees(paise);
  }

  formatPercent(x100: number): string {
    return formatX100AsPercent(x100);
  }
}
