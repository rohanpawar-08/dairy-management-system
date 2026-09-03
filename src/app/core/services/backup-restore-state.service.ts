import { Injectable, signal, WritableSignal } from '@angular/core';
import { ElectronBridgeService } from './electron-bridge.service';
import { I18nService } from './i18n.service';
import {
  BackupResultDto,
  BackupHistoryItemDto,
  RestoreCandidateDto,
  RestoreResultDto,
  DetectedUsbDriveDto,
  BackupScheduleDto,
} from '../../../../shared/ipc-contracts';

@Injectable({
  providedIn: 'root',
})
export class BackupRestoreStateService {
  public readonly history: WritableSignal<BackupHistoryItemDto[]> = signal([]);
  public readonly isLoadingHistory: WritableSignal<boolean> = signal(false);
  public readonly isCreatingBackup: WritableSignal<boolean> = signal(false);
  public readonly isRestoring: WritableSignal<boolean> = signal(false);
  public readonly selectedCandidate: WritableSignal<RestoreCandidateDto | null> = signal(null);
  public readonly lastSafetyBackupName: WritableSignal<string | null> = signal(null);
  public readonly restartScheduled: WritableSignal<boolean> = signal(false);
  public readonly errorMessage: WritableSignal<string | null> = signal(null);
  public readonly successMessage: WritableSignal<string | null> = signal(null);
  public readonly noticeMessage: WritableSignal<string | null> = signal(null);

  // Stage 10 B4: Automation & USB signals
  public readonly usbDrives: WritableSignal<DetectedUsbDriveDto[]> = signal([]);
  public readonly isScanningUsb: WritableSignal<boolean> = signal(false);
  public readonly schedule: WritableSignal<BackupScheduleDto | null> = signal(null);
  public readonly isLoadingSchedule: WritableSignal<boolean> = signal(false);
  public readonly isUpdatingSchedule: WritableSignal<boolean> = signal(false);

  constructor(
    private bridge: ElectronBridgeService,
    private i18n: I18nService
  ) {}

  public clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.noticeMessage.set(null);
  }

  public async loadHistory(limit: number = 20): Promise<void> {
    if (!this.bridge.isElectron) return;
    this.isLoadingHistory.set(true);
    try {
      const res = await this.bridge.backup.getHistory(limit);
      if (res.success && res.data) {
        this.history.set(res.data);
      } else if (!res.success && res.error) {
        this.errorMessage.set(this.resolveErrorMessage(res.error.code, res.error.messageMr));
      }
    } finally {
      this.isLoadingHistory.set(false);
    }
  }

  public async createBackup(): Promise<BackupResultDto | null> {
    if (!this.bridge.isElectron) return null;
    this.clearMessages();
    this.isCreatingBackup.set(true);
    try {
      const res = await this.bridge.backup.create();
      if (res.success && res.data) {
        this.successMessage.set(
          this.i18n.isMarathi()
            ? `बॅकअप यशस्वी: ${res.data.displayName}`
            : `Backup created successfully: ${res.data.displayName}`
        );
        await this.loadHistory();
        return res.data;
      } else if (!res.success && res.error) {
        this.errorMessage.set(this.resolveErrorMessage(res.error.code, res.error.messageMr));
        return null;
      }
      return null;
    } finally {
      this.isCreatingBackup.set(false);
    }
  }

  public async selectDestinationAndBackup(): Promise<BackupResultDto | null> {
    if (!this.bridge.isElectron) return null;
    this.clearMessages();
    const destRes = await this.bridge.backup.selectDestination();
    if (destRes.success && destRes.data?.cancelled) {
      this.noticeMessage.set(this.i18n.t('backupRestore.cancelNotice'));
      return null;
    }
    if (!destRes.success && destRes.error) {
      this.errorMessage.set(this.resolveErrorMessage(destRes.error.code, destRes.error.messageMr));
      return null;
    }
    // Proceed to create verified backup
    return this.createBackup();
  }

  public async scanUsbDrives(): Promise<DetectedUsbDriveDto[]> {
    if (!this.bridge.isElectron) return [];
    this.clearMessages();
    this.isScanningUsb.set(true);
    try {
      const res = await this.bridge.backup.getUsbDrives();
      if (res.success && res.data) {
        this.usbDrives.set(res.data);
        if (res.data.length === 0) {
          this.noticeMessage.set(this.i18n.t('backupRestore.noUsbDrivesDetected'));
        }
        return res.data;
      } else if (!res.success && res.error) {
        this.errorMessage.set(this.resolveErrorMessage(res.error.code, res.error.messageMr));
        return [];
      }
      return [];
    } finally {
      this.isScanningUsb.set(false);
    }
  }

  public async createUsbBackup(usbToken: string): Promise<BackupResultDto | null> {
    if (!this.bridge.isElectron) return null;
    this.clearMessages();
    this.isCreatingBackup.set(true);
    try {
      const res = await this.bridge.backup.createUsbBackup({ usbToken });
      if (res.success && res.data) {
        this.successMessage.set(
          this.i18n.isMarathi()
            ? `USB बॅकअप यशस्वी: ${res.data.displayName}`
            : `USB Backup created successfully: ${res.data.displayName}`
        );
        await this.loadHistory();
        return res.data;
      } else if (!res.success && res.error) {
        this.errorMessage.set(this.resolveErrorMessage(res.error.code, res.error.messageMr));
        return null;
      }
      return null;
    } finally {
      this.isCreatingBackup.set(false);
    }
  }

  public async loadSchedule(): Promise<void> {
    if (!this.bridge.isElectron) return;
    this.isLoadingSchedule.set(true);
    try {
      const res = await this.bridge.backup.getSchedule();
      if (res.success && res.data) {
        this.schedule.set(res.data);
      } else if (!res.success && res.error) {
        this.errorMessage.set(this.resolveErrorMessage(res.error.code, res.error.messageMr));
      }
    } finally {
      this.isLoadingSchedule.set(false);
    }
  }

  public async updateSchedule(enabled: boolean, time: string): Promise<BackupScheduleDto | null> {
    if (!this.bridge.isElectron) return null;
    this.clearMessages();
    this.isUpdatingSchedule.set(true);
    try {
      const res = await this.bridge.backup.updateSchedule({ enabled, time });
      if (res.success && res.data) {
        this.schedule.set(res.data);
        this.successMessage.set(this.i18n.t('backupRestore.scheduleUpdatedSuccess'));
        return res.data;
      } else if (!res.success && res.error) {
        this.errorMessage.set(this.resolveErrorMessage(res.error.code, res.error.messageMr));
        return null;
      }
      return null;
    } finally {
      this.isUpdatingSchedule.set(false);
    }
  }

  public async selectRestoreCandidate(): Promise<RestoreCandidateDto | null> {
    if (!this.bridge.isElectron) return null;
    this.clearMessages();
    const res = await this.bridge.restore.selectCandidate();
    if (res.success && res.data) {
      if (res.data.cancelled) {
        this.noticeMessage.set(this.i18n.t('backupRestore.cancelNotice'));
        this.selectedCandidate.set(null);
        return null;
      }
      this.selectedCandidate.set(res.data);
      return res.data;
    } else if (!res.success && res.error) {
      this.errorMessage.set(this.resolveErrorMessage(res.error.code, res.error.messageMr));
      this.selectedCandidate.set(null);
      return null;
    }
    return null;
  }

  public clearCandidate(): void {
    this.selectedCandidate.set(null);
    this.noticeMessage.set(null);
  }

  public async executeRestore(token: string): Promise<RestoreResultDto | null> {
    if (!this.bridge.isElectron) return null;
    this.clearMessages();
    this.isRestoring.set(true);
    try {
      const res = await this.bridge.restore.execute({ token, confirmed: true });
      if (res.success && res.data) {
        this.lastSafetyBackupName.set(res.data.safetyBackupName);
        this.restartScheduled.set(res.data.restartScheduled);
        this.selectedCandidate.set(null);
        this.successMessage.set(this.i18n.t('backupRestore.restartNotice'));
        return res.data;
      } else if (!res.success && res.error) {
        this.errorMessage.set(this.resolveErrorMessage(res.error.code, res.error.messageMr));
        return null;
      }
      return null;
    } finally {
      this.isRestoring.set(false);
    }
  }

  public resolveErrorMessage(code?: string, defaultMsg?: string): string {
    if (!code) return defaultMsg || 'Unknown error';
    const i18nKey = `backupRestore.errors.${code}`;
    const translated = this.i18n.t(i18nKey);
    if (translated && translated !== i18nKey) {
      return translated;
    }
    return defaultMsg || code;
  }

  public formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
