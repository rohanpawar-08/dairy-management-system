import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import type { CompleteSetupPayload } from '../../../../shared/ipc-contracts';

function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { passwordMismatch: true } : null;
}

function pinMatchValidator(group: AbstractControl): ValidationErrors | null {
  const pin = group.get('pin')?.value;
  const confirm = group.get('confirmPin')?.value;
  if (pin && pin.length > 0) {
    if (pin !== confirm) {
      return { pinMismatch: true };
    }
  }
  return null;
}

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatRadioModule,
    MatIconModule,
    MatProgressBarModule,
    TranslatePipe,
  ],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss'],
})
export class SetupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);
  private readonly authState = inject(AuthStateService);

  readonly currentStep = signal<number>(1);
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hidePassword = signal<boolean>(true);
  readonly hideConfirmPassword = signal<boolean>(true);

  readonly profileForm: FormGroup = this.fb.group({
    centreName: ['', [Validators.required, Validators.minLength(3)]],
    registrationCode: [''],
    ownerName: ['', [Validators.required, Validators.minLength(2)]],
    phonePrimary: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
    phoneSecondary: [''],
    addressLine: [''],
    taluka: [''],
    district: [''],
    pincode: ['', [Validators.pattern(/^\d{6}$/)]],
    defaultLanguage: ['mr', [Validators.required]],
    enabledMilkTypes: ['BOTH', [Validators.required]],
    settlementStartDay: ['MONDAY', [Validators.required]],
  });

  readonly credentialsForm: FormGroup = this.fb.group(
    {
      username: [
        '',
        [Validators.required, Validators.minLength(3), Validators.pattern(/^[a-zA-Z0-9_]+$/)],
      ],
      password: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
      confirmPassword: ['', [Validators.required]],
      pin: ['', [Validators.pattern(/^\d{4,6}$/)]],
      confirmPin: [''],
    },
    { validators: [passwordMatchValidator, pinMatchValidator] }
  );

  onLanguageChange(lang: 'mr' | 'en'): void {
    this.i18n.setLanguage(lang);
    this.profileForm.get('defaultLanguage')?.setValue(lang);
  }

  nextStep(): void {
    this.errorMessage.set(null);
    if (this.currentStep() === 1) {
      if (this.profileForm.invalid) {
        this.profileForm.markAllAsTouched();
        return;
      }
      this.currentStep.set(2);
    } else if (this.currentStep() === 2) {
      if (this.credentialsForm.invalid) {
        this.credentialsForm.markAllAsTouched();
        return;
      }
      this.currentStep.set(3);
    }
  }

  prevStep(): void {
    this.errorMessage.set(null);
    if (this.currentStep() > 1) {
      this.currentStep.update((step) => step - 1);
    }
  }

  async submitSetup(): Promise<void> {
    if (this.profileForm.invalid || this.credentialsForm.invalid) {
      this.errorMessage.set('Please check all required fields.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const payload: CompleteSetupPayload = {
      centreName: this.profileForm.value.centreName.trim(),
      registrationCode: this.profileForm.value.registrationCode?.trim() || undefined,
      ownerName: this.profileForm.value.ownerName.trim(),
      phonePrimary: this.profileForm.value.phonePrimary.trim(),
      phoneSecondary: this.profileForm.value.phoneSecondary?.trim() || undefined,
      addressLine: this.profileForm.value.addressLine?.trim() || undefined,
      taluka: this.profileForm.value.taluka?.trim() || undefined,
      district: this.profileForm.value.district?.trim() || undefined,
      pincode: this.profileForm.value.pincode?.trim() || undefined,
      defaultLanguage: this.profileForm.value.defaultLanguage,
      enabledMilkTypes: this.profileForm.value.enabledMilkTypes,
      settlementStartDay: this.profileForm.value.settlementStartDay,
      username: this.credentialsForm.value.username.trim(),
      password: this.credentialsForm.value.password,
      pin: this.credentialsForm.value.pin?.trim() || undefined,
    };

    try {
      await this.authState.completeSetup(payload);
      // Clean up sensitive fields immediately
      this.credentialsForm.reset();
      await this.router.navigate(['/login']);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.errorMessage.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
