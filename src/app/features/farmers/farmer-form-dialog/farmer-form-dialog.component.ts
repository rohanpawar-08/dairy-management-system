import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';
import { FarmerStateService } from '../../../core/services/farmer-state.service';
import {
  BalanceDirection,
  CreateFarmerPayload,
  FarmerDetailDto,
  FarmerListDto,
  FarmerMilkType,
  UpdateFarmerPayload,
} from '../../../../../shared/ipc-contracts';
import { formatPaiseAsRupees, parseRupeesToPaise } from '../../../../../shared/money';

export interface FarmerFormDialogData {
  mode: 'create' | 'edit';
  farmer?: FarmerListDto;
}

@Component({
  selector: 'app-farmer-form-dialog',
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
    MatRadioModule,
    MatProgressBarModule,
    TranslatePipe,
  ],
  templateUrl: './farmer-form-dialog.component.html',
  styleUrls: ['./farmer-form-dialog.component.scss'],
})
export class FarmerFormDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<FarmerFormDialogComponent>);
  readonly data = inject<FarmerFormDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  readonly i18n = inject(I18nService);
  private readonly farmerState = inject(FarmerStateService);

  readonly isLoadingDetails = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hasFinancialActivity = signal<boolean>(false);

  farmerForm: FormGroup = this.fb.group({
    memberCode: [
      '',
      [
        Validators.required,
        Validators.minLength(1),
        Validators.maxLength(20),
        Validators.pattern(/^[A-Za-z0-9_-]{1,20}$/),
      ],
    ],
    nameMr: ['', [Validators.required, Validators.maxLength(100)]],
    nameEn: ['', [Validators.maxLength(100)]],
    phone: ['', [Validators.pattern(/^[6-9]\d{9}$/)]],
    village: ['', [Validators.maxLength(100)]],
    defaultMilkType: ['COW', [Validators.required]],
    balanceDirection: ['NONE' as BalanceDirection, [Validators.required]],
    balanceRupees: ['0', [Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    bankAccountNumber: ['', [Validators.pattern(/^\d{9,18}$/)]],
    bankIfsc: [
      '',
      [Validators.pattern(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/)],
    ],
    bankName: ['', [Validators.maxLength(100)]],
    upiId: ['', [Validators.pattern(/^[\w.-]+@[\w.-]+$/)]],
  });

  async ngOnInit(): Promise<void> {
    if (this.data.mode === 'edit' && this.data.farmer) {
      this.isLoadingDetails.set(true);
      try {
        const detail = await this.farmerState.getFarmerEditDetail(this.data.farmer.id);
        if (detail) {
          this.populateForm(detail);
        }
      } catch (err: unknown) {
        this.errorMessage.set(
          err instanceof Error ? err.message : 'Failed to load farmer details'
        );
      } finally {
        this.isLoadingDetails.set(false);
      }
    }
  }

  private populateForm(detail: FarmerDetailDto): void {
    let direction: BalanceDirection = 'NONE';
    let rupeesStr = '0.00';

    if (detail.openingBalancePaise > 0) {
      direction = 'PAYABLE_TO_FARMER';
      rupeesStr = formatPaiseAsRupees(detail.openingBalancePaise);
    } else if (detail.openingBalancePaise < 0) {
      direction = 'FARMER_DEBT_TO_DAIRY';
      rupeesStr = formatPaiseAsRupees(Math.abs(detail.openingBalancePaise));
    }

    this.hasFinancialActivity.set(detail.hasFinancialActivity);

    this.farmerForm.patchValue({
      memberCode: detail.memberCode,
      nameMr: detail.nameMr,
      nameEn: detail.nameEn || '',
      phone: detail.phone || '',
      village: detail.village || '',
      defaultMilkType: detail.defaultMilkType,
      balanceDirection: direction,
      balanceRupees: rupeesStr,
      bankAccountNumber: detail.bankAccountNumber || '',
      bankIfsc: detail.bankIfsc || '',
      bankName: detail.bankName || '',
      upiId: detail.upiId || '',
    });

    if (detail.hasFinancialActivity) {
      this.farmerForm.get('balanceDirection')?.disable();
      this.farmerForm.get('balanceRupees')?.disable();
    }
  }

  calculateSignedPaise(): number {
    const direction = this.farmerForm.get('balanceDirection')?.value as BalanceDirection;
    if (direction === 'NONE') {
      return 0;
    }

    const rawRupees = String(this.farmerForm.get('balanceRupees')?.value || '0').trim();
    if (!rawRupees || rawRupees === '0') {
      return 0;
    }

    const absPaise = parseRupeesToPaise(rawRupees);
    return direction === 'PAYABLE_TO_FARMER' ? absPaise : -absPaise;
  }

  async saveFarmer(): Promise<void> {
    if (this.farmerForm.invalid) {
      this.farmerForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const formVal = this.farmerForm.getRawValue();
    const signedPaise = this.calculateSignedPaise();

    const payload: CreateFarmerPayload | UpdateFarmerPayload = {
      memberCode: formVal.memberCode.trim().toUpperCase(),
      nameMr: formVal.nameMr.trim(),
      nameEn: formVal.nameEn?.trim() || null,
      phone: formVal.phone?.trim() || null,
      village: formVal.village?.trim() || null,
      bankAccountNumber: formVal.bankAccountNumber?.trim() || null,
      bankIfsc: formVal.bankIfsc?.trim().toUpperCase() || null,
      bankName: formVal.bankName?.trim() || null,
      upiId: formVal.upiId?.trim() || null,
      defaultMilkType: formVal.defaultMilkType as FarmerMilkType,
      openingBalancePaise: signedPaise,
    };

    try {
      if (this.data.mode === 'create') {
        const created = await this.farmerState.createFarmer(payload);
        this.dialogRef.close(created);
      } else if (this.data.mode === 'edit' && this.data.farmer) {
        const updated = await this.farmerState.updateFarmer(this.data.farmer.id, payload);
        this.dialogRef.close(updated);
      }
    } catch (err: unknown) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Error saving farmer details'
      );
    } finally {
      this.isSaving.set(false);
    }
  }
}
