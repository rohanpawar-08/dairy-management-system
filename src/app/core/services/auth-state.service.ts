import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type {
  AuthSessionDto,
  CompleteSetupPayload,
  DairyProfileSummary,
  LoginPayload,
  SetupStatusResult,
} from '../../../../shared/ipc-contracts';
import { I18nService } from './i18n.service';

@Injectable({
  providedIn: 'root',
})
export class AuthStateService {
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  readonly currentSession = signal<AuthSessionDto | null>(null);
  readonly setupStatus = signal<SetupStatusResult | null>(null);
  readonly dairyProfile = signal<DairyProfileSummary | null>(null);

  readonly isAuthenticated = computed(() => Boolean(this.currentSession()));
  readonly isOwner = computed(() => this.currentSession()?.role === 'OWNER');
  readonly isOperator = computed(() => this.currentSession()?.role === 'OPERATOR');

  /**
   * Fetch current setup state from main process.
   */
  async checkSetupStatus(): Promise<SetupStatusResult> {
    if (!window.dairyApi) {
      const mock: SetupStatusResult = { state: 'UNINITIALIZED', dairyProfile: null };
      this.setupStatus.set(mock);
      return mock;
    }

    const res = await window.dairyApi.getSetupStatus();
    if (res.success && res.data) {
      this.setupStatus.set(res.data);
      if (res.data.dairyProfile) {
        this.dairyProfile.set(res.data.dairyProfile);
        if (res.data.dairyProfile.defaultLanguage) {
          this.i18n.setLanguage(res.data.dairyProfile.defaultLanguage as any);
        }
      }
      return res.data;
    }

    throw new Error(res.error?.messageEn || 'Failed to check setup status');
  }

  /**
   * Complete First-Run Setup Wizard.
   */
  async completeSetup(payload: CompleteSetupPayload): Promise<DairyProfileSummary> {
    if (!window.dairyApi) {
      throw new Error('Native IPC Bridge is not available');
    }

    const res = await window.dairyApi.completeSetup(payload);
    if (res.success && res.data) {
      this.dairyProfile.set(res.data);
      this.setupStatus.set({ state: 'READY', dairyProfile: res.data });
      this.i18n.setLanguage(payload.defaultLanguage);
      return res.data;
    }

    throw new Error(res.error?.messageEn || res.error?.messageMr || 'Setup failed');
  }

  /**
   * Authenticate user with username and password/PIN.
   */
  async login(payload: LoginPayload): Promise<AuthSessionDto> {
    if (!window.dairyApi) {
      throw new Error('Native IPC Bridge is not available');
    }

    const res = await window.dairyApi.login(payload);
    if (res.success && res.data) {
      this.currentSession.set(res.data);
      // Fetch profile after authentication
      await this.loadProfile();
      return res.data;
    }

    throw new Error(res.error?.messageEn || res.error?.messageMr || 'Login failed');
  }

  /**
   * Load dairy profile for authenticated session.
   */
  async loadProfile(): Promise<DairyProfileSummary | null> {
    if (!window.dairyApi) return null;
    try {
      const res = await window.dairyApi.getProfile();
      if (res.success && res.data) {
        this.dairyProfile.set(res.data);
        return res.data;
      }
    } catch {
      // Profile load fallback
    }
    return null;
  }

  /**
   * Restore existing session if window was reloaded.
   */
  async restoreSession(): Promise<AuthSessionDto | null> {
    if (!window.dairyApi) return null;

    try {
      const res = await window.dairyApi.getSession();
      if (res.success && res.data) {
        this.currentSession.set(res.data);
        await this.loadProfile();
        return res.data;
      }
    } catch {
      this.currentSession.set(null);
    }
    return null;
  }

  /**
   * Log out active session and redirect to /login.
   */
  async logout(): Promise<void> {
    if (window.dairyApi) {
      try {
        await window.dairyApi.logout();
      } catch {
        // Suppress logout IPC error
      }
    }

    this.currentSession.set(null);
    await this.router.navigate(['/login']);
  }
}
