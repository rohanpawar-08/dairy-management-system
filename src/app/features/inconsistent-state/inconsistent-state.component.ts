import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';
import { AuthStateService } from '../../core/services/auth-state.service';

@Component({
  selector: 'app-inconsistent-state',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
  ],
  templateUrl: './inconsistent-state.component.html',
  styleUrls: ['./inconsistent-state.component.scss'],
})
export class InconsistentStateComponent {
  readonly i18n = inject(I18nService);
  readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  readonly isChecking = signal<boolean>(false);

  async checkAgain(): Promise<void> {
    this.isChecking.set(true);
    try {
      const status = await this.authState.checkSetupStatus();
      if (status.state === 'READY') {
        await this.router.navigate(['/login']);
      } else if (status.state === 'UNINITIALIZED') {
        await this.router.navigate(['/setup']);
      }
    } finally {
      this.isChecking.set(false);
    }
  }
}
