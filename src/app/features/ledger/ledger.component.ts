import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LedgerStateService } from '../../core/services/ledger-state.service';
import { I18nService } from '../../core/services/i18n.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { ElectronBridgeService } from '../../core/services/electron-bridge.service';
import {
  AdjustmentDto,
  CreateAdjustmentPayload,
  LedgerItemDto,
} from '../../../../shared/ipc-contracts';
import {
  AdjustmentFormDialogComponent,
  AdjustmentFormDialogData,
} from './adjustment-form-dialog/adjustment-form-dialog.component';
import {
  VoidAdjustmentDialogComponent,
  VoidAdjustmentDialogData,
} from './void-adjustment-dialog/void-adjustment-dialog.component';

import { RouterLink } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-ledger',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTableModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './ledger.component.html',
  styleUrls: ['./ledger.component.scss'],
})
export class LedgerComponent implements OnInit {
  public readonly state = inject(LedgerStateService);
  public readonly i18n = inject(I18nService);
  public readonly auth = inject(AuthStateService);
  private readonly bridge = inject(ElectronBridgeService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  public readonly searchControl = this.fb.control('');
  public readonly fromDateControl = this.fb.control('');
  public readonly toDateControl = this.fb.control('');
  public readonly includeVoidedControl = this.fb.control(false);

  public readonly displayedColumns: string[] = [
    'businessDate',
    'referenceNumber',
    'sourceType',
    'description',
    'credit',
    'debit',
    'runningBalance',
    'actions',
  ];

  public readonly successMessage = signal<string | null>(null);

  ngOnInit(): void {
    // Sync filter controls when values change
    this.includeVoidedControl.valueChanges.subscribe(() => {
      this.onApplyFilters();
    });
  }

  public async onSearch(): Promise<void> {
    const code = this.searchControl.value?.trim();
    if (!code) return;
    this.successMessage.set(null);
    await this.state.searchByMemberCode(code);
  }

  public async onApplyFilters(): Promise<void> {
    const from = this.fromDateControl.value || null;
    const to = this.toDateControl.value || null;
    const inc = this.includeVoidedControl.value ?? false;
    await this.state.setFilters(from, to, inc);
  }

  public async onClearFilters(): Promise<void> {
    this.fromDateControl.setValue('');
    this.toDateControl.setValue('');
    this.includeVoidedControl.setValue(false);
    await this.state.setFilters(null, null, false);
  }

  public openAddAdjustmentDialog(): void {
    const current = this.state.summary();
    if (!current) return;

    if (!current.isActive) {
      this.state.error.set('रद्द केलेल्या (निष्क्रिय) सभासदासाठी नवीन कपात नोंदवता येत नाही.');
      return;
    }

    const dialogData: AdjustmentFormDialogData = {
      farmerId: current.farmerId,
      memberCode: current.memberCode,
      farmerNameMr: current.farmerNameMr,
      farmerNameEn: current.farmerNameEn,
    };

    const dialogRef = this.dialog.open(AdjustmentFormDialogComponent, {
      data: dialogData,
      width: '540px',
    });

    dialogRef.afterClosed().subscribe(async (result: CreateAdjustmentPayload | null) => {
      if (result) {
        const ok = await this.state.createAdjustment(result);
        if (ok) {
          this.successMessage.set(this.i18n.t('ledger.adjustmentSavedSuccess'));
          setTimeout(() => this.successMessage.set(null), 4000);
        }
      }
    });
  }

  public async onVoidItem(item: LedgerItemDto): Promise<void> {
    if (item.sourceType === 'OPENING_BALANCE' || item.sourceType === 'MILK_COLLECTION') {
      return; // Handled elsewhere or not allowed via adjustment void
    }

    // Fetch adjustment detail
    const res = await this.bridge.adjustments.getById(item.sourceId);
    if (!res.success || !res.data) {
      this.state.error.set('समायोजन माहिती लोड करता आली नाही.');
      return;
    }

    const dialogData: VoidAdjustmentDialogData = {
      adjustment: res.data,
    };

    const dialogRef = this.dialog.open(VoidAdjustmentDialogComponent, {
      data: dialogData,
      width: '500px',
    });

    dialogRef.afterClosed().subscribe(async (payload) => {
      if (payload) {
        const ok = await this.state.voidAdjustment(payload);
        if (ok) {
          this.successMessage.set(this.i18n.t('ledger.adjustmentVoidSuccess'));
          setTimeout(() => this.successMessage.set(null), 4000);
        }
      }
    });
  }

  public formatSourceType(type: string): string {
    switch (type) {
      case 'OPENING_BALANCE':
        return 'आरंभीची शिल्लक';
      case 'MILK_COLLECTION':
        return 'दूध संकलन';
      case 'CREDIT':
        return 'जमा (Credit)';
      case 'DEDUCTION':
        return 'कपात (Deduction)';
      case 'ADVANCE':
        return 'उचल (Advance)';
      default:
        return type;
    }
  }
}
