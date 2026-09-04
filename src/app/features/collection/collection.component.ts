import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  CalculateRatePreviewResult,
  FarmerListDto,
  MilkCollectionDto,
  RatePlanMilkType,
  ResolveApprovedRateResult,
  ShiftType,
} from '../../../../shared/ipc-contracts';
import {
  formatMlAsLitres,
  formatPaiseAsRupees,
  formatX100AsPercent,
  parseLitresToMl,
  parsePercentToX100,
} from '../../../../shared/money';
import { CollectionStateService } from '../../core/services/collection-state.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { I18nService } from '../../core/services/i18n.service';
import { ElectronBridgeService } from '../../core/services/electron-bridge.service';
import { DuplicateConfirmDialogComponent } from './duplicate-confirm-dialog/duplicate-confirm-dialog.component';
import { VoidCollectionDialogComponent } from './void-collection-dialog/void-collection-dialog.component';
import { CloseShiftDialogComponent } from './close-shift-dialog/close-shift-dialog.component';
import { ReopenShiftDialogComponent } from './reopen-shift-dialog/reopen-shift-dialog.component';

import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatChipsModule,
    MatTableModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './collection.component.html',
  styleUrls: ['./collection.component.scss'],
})
export class CollectionComponent implements OnInit {
  public readonly collectionState = inject(CollectionStateService);
  public readonly authState = inject(AuthStateService);
  public readonly i18n = inject(I18nService);
  private readonly bridge = inject(ElectronBridgeService);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);

  @ViewChild('memberCodeInput') memberCodeInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('quantityInput') quantityInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('fatInput') fatInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('snfInput') snfInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('saveBtn') saveBtnRef?: ElementRef<HTMLButtonElement>;

  // No-shift opening form
  public openShiftDate: string = '';
  public openShiftType: ShiftType = 'MORNING';
  public openShiftNotes: string = '';
  public openingShift: boolean = false;

  // Collection entry form
  public readonly collectionForm: FormGroup = this.fb.group({
    memberCode: ['', [Validators.required]],
    milkType: ['COW', [Validators.required]],
    quantityLitres: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,3})?$/)]],
    fatPercent: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    snfPercent: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
  });

  public readonly resolvedFarmer = signal<FarmerListDto | null>(null);
  public readonly farmerLookupError = signal<string | null>(null);
  public readonly ratePreview = signal<ResolveApprovedRateResult | null>(null);
  public readonly ratePreviewError = signal<string | null>(null);
  public readonly isCalculatingPreview = signal<boolean>(false);
  public readonly isSubmitting = signal<boolean>(false);
  public readonly successBanner = signal<string | null>(null);

  public readonly isOwner = computed(() => this.authState.isOwner());

  public ngOnInit(): void {
    this.initDefaultDate();
    this.collectionState.loadCurrentShift().then(() => {
      this.focusMemberCode();
    });
  }

  private initDefaultDate(): void {
    const now = new Date();
    // Default en-CA format produces YYYY-MM-DD
    this.openShiftDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    // Auto-detect Morning / Evening based on IST hour
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    }).format(now);
    const hour = parseInt(hourStr, 10);
    this.openShiftType = hour >= 14 ? 'EVENING' : 'MORNING';
  }

  public focusMemberCode(): void {
    setTimeout(() => {
      this.memberCodeInputRef?.nativeElement?.focus();
      this.memberCodeInputRef?.nativeElement?.select();
    }, 50);
  }

  // ==========================================================================
  // SHIFT MANAGEMENT
  // ==========================================================================

  public async onOpenShift(): Promise<void> {
    if (!this.openShiftDate || !this.openShiftType) return;
    this.openingShift = true;
    try {
      await this.collectionState.openShift({
        businessDate: this.openShiftDate,
        shiftType: this.openShiftType,
        notes: this.openShiftNotes?.trim() || null,
      });
      this.focusMemberCode();
    } catch (err: unknown) {
      // Error handled by state
    } finally {
      this.openingShift = false;
    }
  }

  public onCloseShift(): void {
    const shift = this.collectionState.currentShift();
    if (!shift) return;

    const summary = this.collectionState.shiftSummary();
    const dialogRef = this.dialog.open(CloseShiftDialogComponent, {
      data: { shift, summary },
    });

    dialogRef.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        try {
          await this.collectionState.closeShift(shift.id);
        } catch {
          // Error in state
        }
      }
    });
  }

  public onReopenShift(): void {
    const shift = this.collectionState.currentShift();
    if (!shift || !this.isOwner()) return;

    const dialogRef = this.dialog.open(ReopenShiftDialogComponent, {
      data: { shift },
    });

    dialogRef.afterClosed().subscribe(async (reason) => {
      if (reason) {
        try {
          await this.collectionState.reopenShift({
            shiftId: shift.id,
            reason,
          });
          this.focusMemberCode();
        } catch {
          // Error in state
        }
      }
    });
  }

  public onMemberCodeChanged(): void {
    this.resolvedFarmer.set(null);
    this.farmerLookupError.set(null);
    this.ratePreview.set(null);
    this.ratePreviewError.set(null);
    this.collectionForm.patchValue({ milkType: '' });
  }

  public async onMemberCodeEnter(): Promise<void> {
    const code = this.collectionForm.get('memberCode')?.value?.trim();
    if (!code) {
      this.onMemberCodeChanged();
      return;
    }

    try {
      const res = await this.bridge.farmers.getByCode(code, true);
      if (res.success && res.data) {
        const farmer = res.data;
        if (!farmer.isActive) {
          this.resolvedFarmer.set(null);
          this.farmerLookupError.set(this.i18n.t('collection.farmerInactive'));
          return;
        }

        const dairyMilkTypes = this.collectionState.enabledMilkTypes();
        let targetMilkType: RatePlanMilkType | '' = '';

        if (farmer.defaultMilkType === 'COW') {
          if (dairyMilkTypes === 'BUFFALO') {
            this.resolvedFarmer.set(null);
            this.farmerLookupError.set(
              this.i18n.t('collection.dairyDoesNotAcceptCow') || 'This centre only accepts BUFFALO milk.'
            );
            return;
          }
          targetMilkType = 'COW';
        } else if (farmer.defaultMilkType === 'BUFFALO') {
          if (dairyMilkTypes === 'COW') {
            this.resolvedFarmer.set(null);
            this.farmerLookupError.set(
              this.i18n.t('collection.dairyDoesNotAcceptBuffalo') || 'This centre only accepts COW milk.'
            );
            return;
          }
          targetMilkType = 'BUFFALO';
        } else {
          // Farmer default is 'BOTH' -> clear selection, require explicit COW or BUFFALO choice!
          targetMilkType = '';
        }

        this.resolvedFarmer.set(farmer);
        this.farmerLookupError.set(null);
        this.collectionForm.patchValue({ milkType: targetMilkType });
        this.onInputsChanged();

        // Move focus to Quantity
        setTimeout(() => {
          this.quantityInputRef?.nativeElement?.focus();
          this.quantityInputRef?.nativeElement?.select();
        }, 50);
      } else {
        this.resolvedFarmer.set(null);
        this.farmerLookupError.set(this.i18n.t('collection.farmerNotFound'));
      }
    } catch {
      this.resolvedFarmer.set(null);
      this.farmerLookupError.set(this.i18n.t('collection.farmerNotFound'));
    }
  }

  public onQuantityEnter(): void {
    if (this.collectionForm.get('quantityLitres')?.valid) {
      this.fatInputRef?.nativeElement?.focus();
      this.fatInputRef?.nativeElement?.select();
    }
  }

  public onFatEnter(): void {
    if (this.collectionForm.get('fatPercent')?.valid) {
      this.snfInputRef?.nativeElement?.focus();
      this.snfInputRef?.nativeElement?.select();
    }
  }

  public onSnfEnter(): void {
    if (this.canSave()) {
      this.saveBtnRef?.nativeElement?.focus();
    }
  }

  public onInputsChanged(): void {
    this.ratePreview.set(null);
    this.ratePreviewError.set(null);

    const shift = this.collectionState.currentShift();
    const farmer = this.resolvedFarmer();
    if (!shift || !farmer) return;

    const milkType = this.collectionForm.get('milkType')?.value as RatePlanMilkType;
    const quantityStr = this.collectionForm.get('quantityLitres')?.value;
    const fatStr = this.collectionForm.get('fatPercent')?.value;
    const snfStr = this.collectionForm.get('snfPercent')?.value;

    if (!quantityStr || !fatStr || !snfStr) return;

    try {
      const quantityMl = parseLitresToMl(quantityStr);
      const fatX100 = parsePercentToX100(fatStr);
      const snfX100 = parsePercentToX100(snfStr);

      if (quantityMl <= 0 || fatX100 <= 0 || snfX100 <= 0) return;

      this.isCalculatingPreview.set(true);
      this.collectionState
        .resolveApprovedRate({
          milkType,
          businessDate: shift.businessDate,
          fatX100,
          snfX100,
          quantityMl,
        })
        .then((preview) => {
          this.ratePreview.set(preview);
          this.ratePreviewError.set(null);
        })
        .catch((err) => {
          this.ratePreview.set(null);
          this.ratePreviewError.set(err.message || 'Calculation error');
        })
        .finally(() => {
          this.isCalculatingPreview.set(false);
        });
    } catch {
      this.ratePreview.set(null);
    }
  }

  public canSave(): boolean {
    return this.isCollectionReady() && !this.isSubmitting();
  }

  private isCollectionReady(): boolean {
    const milkType = this.collectionForm.get('milkType')?.value;
    return (
      this.collectionForm.valid &&
      (milkType === 'COW' || milkType === 'BUFFALO') &&
      this.resolvedFarmer() !== null &&
      this.ratePreview() !== null &&
      !this.isCalculatingPreview() &&
      !this.collectionState.isSaving()
    );
  }

  public async onSaveCollection(): Promise<void> {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    try {
      if (!this.isCollectionReady()) return;

      const shift = this.collectionState.currentShift();
      const farmer = this.resolvedFarmer();
      if (!shift || !farmer) return;

      const milkType = this.collectionForm.get('milkType')?.value as RatePlanMilkType;
      const quantityLitres = this.collectionForm.get('quantityLitres')?.value;
      const fatPercent = this.collectionForm.get('fatPercent')?.value;
      const snfPercent = this.collectionForm.get('snfPercent')?.value;

      const dupCheck = await this.collectionState.checkDuplicate({
        shiftId: shift.id,
        farmerId: farmer.id,
        milkType,
      });

      if (dupCheck.isDuplicate) {
        const dialogRef = this.dialog.open(DuplicateConfirmDialogComponent, {
          data: {
            memberCode: farmer.memberCode,
            farmerNameMr: farmer.nameMr,
            farmerNameEn: farmer.nameEn,
            milkType,
            existingCollections: dupCheck.existingCollections,
          },
        });
        const result = await firstValueFrom(dialogRef.afterClosed());
        if (!result?.confirmed) return;

        await this.executeSave({
          shiftId: shift.id,
          farmerId: farmer.id,
          milkType,
          quantityLitres,
          fatPercent,
          snfPercent,
          duplicateConfirmed: true,
          duplicateReason: result.duplicateReason,
        });
        return;
      }

      await this.executeSave({
        shiftId: shift.id,
        farmerId: farmer.id,
        milkType,
        quantityLitres,
        fatPercent,
        snfPercent,
      });
    } catch {
      // Errors are surfaced by the state service.
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private async executeSave(payload: {
    shiftId: number;
    farmerId: number;
    milkType: RatePlanMilkType;
    quantityLitres: string | number;
    fatPercent: string | number;
    snfPercent: string | number;
    duplicateConfirmed?: boolean;
    duplicateReason?: string | null;
  }): Promise<void> {
    try {
      const created = await this.collectionState.recordCollection(payload);

      // Show success notification
      this.successBanner.set(
        `${created.receiptNumber} — ${created.farmerMemberCode} ${created.farmerNameMr} | ${created.quantityLitresFormatted} L | ${created.amountRupeesFormatted}`
      );
      setTimeout(() => this.successBanner.set(null), 5000);

      // Reset form fields
      this.collectionForm.patchValue({
        memberCode: '',
        quantityLitres: '',
        fatPercent: '',
        snfPercent: '',
      });
      this.resolvedFarmer.set(null);
      this.farmerLookupError.set(null);
      this.ratePreview.set(null);
      this.ratePreviewError.set(null);

      // Refocus Member Code
      this.focusMemberCode();
    } catch (err: unknown) {
      // Error handled by state
    }
  }

  // ==========================================================================
  // VOID ACTION (OWNER ONLY)
  // ==========================================================================

  public onVoidCollection(col: MilkCollectionDto): void {
    if (!this.isOwner() || col.status !== 'ACTIVE') return;

    const dialogRef = this.dialog.open(VoidCollectionDialogComponent, {
      data: { collection: col },
    });

    dialogRef.afterClosed().subscribe(async (res) => {
      if (res) {
        try {
          await this.collectionState.voidCollection(res);
        } catch {
          // Error in state
        }
      }
    });
  }
}
