import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { FarmerStateService } from '../../core/services/farmer-state.service';
import {
  FarmerListDto,
  FarmerStatusFilter,
  FarmerMilkFilter,
} from '../../../../shared/ipc-contracts';
import { formatPaiseAsRupees } from '../../../../shared/money';
import { FarmerFormDialogComponent } from './farmer-form-dialog/farmer-form-dialog.component';
import { FarmerDeactivateDialogComponent } from './farmer-deactivate-dialog/farmer-deactivate-dialog.component';

@Component({
  selector: 'app-farmers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    MatChipsModule,
    MatProgressBarModule,
    MatDialogModule,
    MatTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './farmers.component.html',
  styleUrls: ['./farmers.component.scss'],
})
export class FarmersComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly authState = inject(AuthStateService);
  readonly farmerState = inject(FarmerStateService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly displayedColumns: string[] = [
    'memberCode',
    'name',
    'phone',
    'village',
    'milkType',
    'openingBalance',
    'bankDetails',
    'status',
    'actions',
  ];

  async ngOnInit(): Promise<void> {
    await this.farmerState.loadFarmers();
  }

  onSearchChange(query: string): void {
    this.farmerState.searchQuery.set(query);
    this.farmerState.loadFarmers();
  }

  onStatusFilterChange(status: FarmerStatusFilter): void {
    this.farmerState.statusFilter.set(status);
    this.farmerState.loadFarmers();
  }

  onMilkTypeFilterChange(milkType: FarmerMilkFilter): void {
    this.farmerState.milkTypeFilter.set(milkType);
    this.farmerState.loadFarmers();
  }

  openAddFarmerDialog(): void {
    const dialogRef = this.dialog.open(FarmerFormDialogComponent, {
      width: '680px',
      disableClose: true,
      data: { mode: 'create' },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.farmerState.loadFarmers();
      }
    });
  }

  openEditFarmerDialog(farmer: FarmerListDto): void {
    const dialogRef = this.dialog.open(FarmerFormDialogComponent, {
      width: '680px',
      disableClose: true,
      data: { mode: 'edit', farmer },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.farmerState.loadFarmers();
      }
    });
  }

  openDeactivateDialog(farmer: FarmerListDto): void {
    const dialogRef = this.dialog.open(FarmerDeactivateDialogComponent, {
      width: '460px',
      data: { farmer },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        try {
          await this.farmerState.deactivateFarmer(farmer.id, result.reason);
        } catch {
          // Handled in state service
        }
      }
    });
  }

  async reactivateFarmer(farmer: FarmerListDto): Promise<void> {
    try {
      await this.farmerState.reactivateFarmer(farmer.id);
    } catch {
      // Handled in state service
    }
  }

  formatBalance(paise: number): string {
    if (paise === 0) {
      return '₹0.00';
    }
    const rupees = formatPaiseAsRupees(Math.abs(paise));
    return paise > 0 ? `+ ₹${rupees}` : `- ₹${rupees}`;
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
