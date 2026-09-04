import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ErrorStateMatcher } from '@angular/material/core';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import type { LoginPayload } from '../../../../shared/ipc-contracts';

export class TouchedErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: any): boolean {
    return !!(control && control.invalid && control.touched);
  }
}

@Component({
  selector: 'app-login',
  standalone: true,
  providers: [{ provide: ErrorStateMatcher, useClass: TouchedErrorStateMatcher }],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTabsModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);
  readonly authState = inject(AuthStateService);

  readonly loginMode = signal<'password' | 'pin'>('password');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hidePassword = signal<boolean>(true);
  readonly isInconsistentState = signal<boolean>(false);

  readonly passwordForm: FormGroup = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  readonly pinForm: FormGroup = this.fb.group({
    username: ['', [Validators.required]],
    pin: ['', [Validators.required, Validators.pattern(/^\d{4,6}$/)]],
  });

  async ngOnInit(): Promise<void> {
    try {
      const status = await this.authState.checkSetupStatus();
      if (status.state === 'INCONSISTENT') {
        await this.router.navigate(['/inconsistent']);
      }
    } catch {
      // Ignored
    }
  }

  setMode(mode: 'password' | 'pin'): void {
    this.loginMode.set(mode);
    this.errorMessage.set(null);
  }

  async submitLogin(): Promise<void> {
    const isPassword = this.loginMode() === 'password';
    const form = isPassword ? this.passwordForm : this.pinForm;

    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const payload: LoginPayload = {
      username: form.value.username.trim(),
      password: isPassword ? form.value.password : undefined,
      pin: !isPassword ? form.value.pin.trim() : undefined,
    };

    // Clean sensitive input fields immediately and maintain pristine/untouched state
    const sensitiveControl = form.get(isPassword ? 'password' : 'pin');
    sensitiveControl?.setValue('');
    sensitiveControl?.markAsUntouched();
    sensitiveControl?.markAsPristine();

    try {
      await this.authState.login(payload);
      await this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage.set(msg);
      sensitiveControl?.setValue('');
      sensitiveControl?.markAsUntouched();
      sensitiveControl?.markAsPristine();
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
