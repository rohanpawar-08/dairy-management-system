import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';
import { AuthStateService } from '../../core/services/auth-state.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    TranslatePipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    if (!this.authState.dairyProfile()) {
      await this.authState.loadProfile();
    }
  }

  navigateToFarmers(): void {
    this.router.navigate(['/farmers']);
  }

  navigateToRatePlans(): void {
    this.router.navigate(['/rate-plans']);
  }

  navigateToCollection(): void {
    this.router.navigate(['/collection']);
  }

  navigateToLedger(): void {
    this.router.navigate(['/ledger']);
  }

  navigateToSettlements(): void {
    this.router.navigate(['/settlements']);
  }

  async onLogout(): Promise<void> {
    await this.authState.logout();
  }
}
