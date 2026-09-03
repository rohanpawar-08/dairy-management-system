import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SettlementStateService } from '../../core/services/settlement-state.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { I18nService } from '../../core/services/i18n.service';
import { CreatePeriodDialogComponent } from './create-period-dialog/create-period-dialog.component';
import { FinalizeSettlementDialogComponent } from './finalize-settlement-dialog/finalize-settlement-dialog.component';
import { CancelPeriodDialogComponent } from './cancel-period-dialog/cancel-period-dialog.component';
import { PaymentDialogComponent } from './payment-dialog/payment-dialog.component';
import { VoidPaymentDialogComponent } from './void-payment-dialog/void-payment-dialog.component';
import {
  PaymentDto,
  SettlementPeriodDto,
  SettlementPreviewItemDto,
  WeeklySettlementDto,
} from '../../../../shared/ipc-contracts';

import { RouterLink } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-settlements',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    MatTabsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSelectModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  templateUrl: './settlements.component.html',
  styleUrls: ['./settlements.component.scss'],
})
export class SettlementsComponent implements OnInit {
  public readonly state = inject(SettlementStateService);
  public readonly auth = inject(AuthStateService);
  public readonly i18n = inject(I18nService);
  private readonly dialog = inject(MatDialog);

  public activeTabIndex = 0;

  // Preview Table Columns
  public readonly previewColumns = [
    'memberCode',
    'farmerName',
    'openingBalance',
    'milkAmount',
    'credits',
    'deductions',
    'netAmount',
  ];

  // Finalized Table Columns
  public readonly finalizedColumns = [
    'memberCode',
    'farmerName',
    'openingBalance',
    'milkAmount',
    'credits',
    'deductions',
    'netAmount',
    'allocatedPayment',
    'outstanding',
    'actions',
  ];

  // Payments Table Columns
  public readonly paymentColumns = [
    'paymentNumber',
    'businessDate',
    'farmer',
    'amount',
    'method',
    'status',
    'actions',
  ];

  async ngOnInit(): Promise<void> {
    await this.state.loadPeriods();
    await this.state.loadPayments();
  }

  public async onPeriodSelect(periodId: number): Promise<void> {
    await this.state.selectPeriod(periodId);
  }

  public openCreateDraftDialog(): void {
    const dialogRef = this.dialog.open(CreatePeriodDialogComponent, {
      width: '480px',
    });

    dialogRef.afterClosed().subscribe(async (payload) => {
      if (payload) {
        await this.state.createDraft(payload);
      }
    });
  }

  public openFinalizeDialog(): void {
    const period = this.state.selectedPeriod();
    const preview = this.state.previewData();
    if (!period || !preview) return;

    const dialogRef = this.dialog.open(FinalizeSettlementDialogComponent, {
      width: '500px',
      data: {
        period,
        eligibleFarmerCount: preview.eligibleFarmerCount,
        totalNetPaise: preview.totalNetPaise,
      },
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        await this.state.finalizePeriod({ periodId: period.id });
      }
    });
  }

  public openCancelDraftDialog(): void {
    const period = this.state.selectedPeriod();
    if (!period) return;

    const dialogRef = this.dialog.open(CancelPeriodDialogComponent, {
      width: '480px',
      data: { period },
    });

    dialogRef.afterClosed().subscribe(async (payload) => {
      if (payload) {
        await this.state.cancelDraft(payload);
      }
    });
  }

  public async openPaymentDialogForFarmer(item: WeeklySettlementDto): Promise<void> {
    const outstanding = await this.state.loadOutstanding(item.farmerId);
    const balance = outstanding ? outstanding.outstandingBalancePaise : (item.outstandingAmountPaise ?? 0);

    if (balance <= 0) return;

    const dialogRef = this.dialog.open(PaymentDialogComponent, {
      width: '540px',
      data: {
        farmerId: item.farmerId,
        memberCode: item.memberCodeSnapshot,
        farmerNameMr: item.farmerNameMrSnapshot,
        farmerNameEn: item.farmerNameEnSnapshot,
        outstandingBalancePaise: balance,
      },
    });

    dialogRef.afterClosed().subscribe(async (payload) => {
      if (payload) {
        await this.state.recordPayment(payload);
      }
    });
  }

  public openVoidPaymentDialog(payment: PaymentDto): void {
    const dialogRef = this.dialog.open(VoidPaymentDialogComponent, {
      width: '480px',
      data: { payment },
    });

    dialogRef.afterClosed().subscribe(async (payload) => {
      if (payload) {
        await this.state.voidPayment(payload);
      }
    });
  }

  public formatRupees(paise: number): string {
    return (paise / 100).toFixed(2);
  }
}
