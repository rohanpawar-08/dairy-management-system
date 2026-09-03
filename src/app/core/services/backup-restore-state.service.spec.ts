import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BackupRestoreStateService } from './backup-restore-state.service';
import { ElectronBridgeService } from './electron-bridge.service';
import { I18nService } from './i18n.service';

describe('BackupRestoreStateService', () => {
  let service: BackupRestoreStateService;
  let mockBridge: any;
  let mockI18n: any;

  beforeEach(() => {
    mockBridge = {
      isElectron: true,
      backup: {
        create: vi.fn().mockResolvedValue({
          success: true,
          data: {
            displayName: 'backup_20260902.db',
            sizeBytes: 1048576,
            checksumSha256: 'abc123',
            migrationVersion: 6,
            createdAt: '2026-09-02T12:00:00Z',
          },
        }),
        getHistory: vi.fn().mockResolvedValue({
          success: true,
          data: [
            {
              displayName: 'backup_1.db',
              sizeBytes: 2048,
              checksumSha256: 'def456',
              triggerType: 'MANUAL',
              createdAt: '2026-09-02T10:00:00Z',
            },
          ],
        }),
        selectDestination: vi.fn().mockResolvedValue({
          success: true,
          data: { cancelled: false, displayPath: 'Backups' },
        }),
        getUsbDrives: vi.fn().mockResolvedValue({
          success: true,
          data: [
            {
              id: 'usb_token_123',
              label: 'KINGSTON',
              freeSpaceBytes: 16000000,
              totalSpaceBytes: 32000000,
            },
          ],
        }),
        createUsbBackup: vi.fn().mockResolvedValue({
          success: true,
          data: {
            displayName: 'dairy_backup_usb.db',
            sizeBytes: 1048576,
            checksumSha256: 'hashusb',
            migrationVersion: 6,
            createdAt: '2026-09-02T12:00:00Z',
          },
        }),
        getSchedule: vi.fn().mockResolvedValue({
          success: true,
          data: {
            enabled: true,
            time: '21:00',
            lastRunDate: '2026-09-01',
          },
        }),
        updateSchedule: vi.fn().mockResolvedValue({
          success: true,
          data: {
            enabled: true,
            time: '22:00',
            lastRunDate: '2026-09-01',
          },
        }),
      },
      restore: {
        selectCandidate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            cancelled: false,
            token: 'valid_token_123',
            displayName: 'candidate.db',
            sizeBytes: 4096,
          },
        }),
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            safetyBackupName: 'safety_pre_restore.db',
            restartScheduled: true,
          },
        }),
      },
    };

    mockI18n = {
      isMarathi: vi.fn().mockReturnValue(true),
      t: vi.fn().mockImplementation((key: string) => key),
    };

    TestBed.configureTestingModule({
      providers: [
        BackupRestoreStateService,
        { provide: ElectronBridgeService, useValue: mockBridge },
        { provide: I18nService, useValue: mockI18n },
      ],
    });

    service = TestBed.inject(BackupRestoreStateService);
  });

  it('1. should be created with clean initial state signals', () => {
    expect(service).toBeTruthy();
    expect(service.history()).toEqual([]);
    expect(service.isLoadingHistory()).toBe(false);
    expect(service.isCreatingBackup()).toBe(false);
    expect(service.isRestoring()).toBe(false);
    expect(service.selectedCandidate()).toBeNull();
    expect(service.errorMessage()).toBeNull();
    expect(service.successMessage()).toBeNull();
    expect(service.noticeMessage()).toBeNull();
    expect(service.usbDrives()).toEqual([]);
    expect(service.schedule()).toBeNull();
  });

  it('2. loadHistory: populates history signal on success', async () => {
    await service.loadHistory();
    expect(mockBridge.backup.getHistory).toHaveBeenCalledWith(20);
    expect(service.history().length).toBe(1);
    expect(service.history()[0].displayName).toBe('backup_1.db');
  });

  it('3. loadHistory: handles failure response gracefully', async () => {
    mockBridge.backup.getHistory.mockResolvedValueOnce({
      success: false,
      error: { code: 'BACKUP_HISTORY_ERROR', messageMr: 'त्रुटी' },
    });
    await service.loadHistory();
    expect(service.errorMessage()).toBeTruthy();
  });

  it('4. createBackup: calls bridge, sets success message and reloads history', async () => {
    const result = await service.createBackup();
    expect(mockBridge.backup.create).toHaveBeenCalled();
    expect(result).toBeTruthy();
    expect(result?.displayName).toBe('backup_20260902.db');
    expect(service.successMessage()).toContain('backup_20260902.db');
    expect(mockBridge.backup.getHistory).toHaveBeenCalled();
    expect(service.isCreatingBackup()).toBe(false);
  });

  it('5. createBackup: sets error message on failure', async () => {
    mockBridge.backup.create.mockResolvedValueOnce({
      success: false,
      error: { code: 'BACKUP_BUSY', messageMr: 'दुसरा बॅकअप चालू आहे' },
    });
    const result = await service.createBackup();
    expect(result).toBeNull();
    expect(service.errorMessage()).toBeTruthy();
  });

  it('6. selectDestinationAndBackup: handles cancellation gracefully', async () => {
    mockBridge.backup.selectDestination.mockResolvedValueOnce({
      success: true,
      data: { cancelled: true },
    });
    const result = await service.selectDestinationAndBackup();
    expect(result).toBeNull();
    expect(service.noticeMessage()).toBeTruthy();
    expect(mockBridge.backup.create).not.toHaveBeenCalled();
  });

  it('7. selectDestinationAndBackup: proceeds to backup when not cancelled', async () => {
    const result = await service.selectDestinationAndBackup();
    expect(mockBridge.backup.selectDestination).toHaveBeenCalled();
    expect(mockBridge.backup.create).toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it('8. selectRestoreCandidate: sets selectedCandidate on valid file selection', async () => {
    const res = await service.selectRestoreCandidate();
    expect(mockBridge.restore.selectCandidate).toHaveBeenCalled();
    expect(res?.token).toBe('valid_token_123');
    expect(service.selectedCandidate()?.displayName).toBe('candidate.db');
  });

  it('9. selectRestoreCandidate: handles cancelled file selection', async () => {
    mockBridge.restore.selectCandidate.mockResolvedValueOnce({
      success: true,
      data: { cancelled: true },
    });
    const res = await service.selectRestoreCandidate();
    expect(res).toBeNull();
    expect(service.noticeMessage()).toBeTruthy();
    expect(service.selectedCandidate()).toBeNull();
  });

  it('10. clearCandidate: resets selected candidate signal', () => {
    service.selectedCandidate.set({ cancelled: false, token: 't1', displayName: 'c.db' });
    service.clearCandidate();
    expect(service.selectedCandidate()).toBeNull();
  });

  it('11. executeRestore: calls bridge.restore.execute and schedules restart on success', async () => {
    const res = await service.executeRestore('token_abc');
    expect(mockBridge.restore.execute).toHaveBeenCalledWith({ token: 'token_abc', confirmed: true });
    expect(res?.success).toBe(true);
    expect(service.restartScheduled()).toBe(true);
    expect(service.lastSafetyBackupName()).toBe('safety_pre_restore.db');
    expect(service.selectedCandidate()).toBeNull();
  });

  it('12. executeRestore: sets error message on failure', async () => {
    mockBridge.restore.execute.mockResolvedValueOnce({
      success: false,
      error: { code: 'RESTORE_TOKEN_EXPIRED', messageMr: 'टोकन कालबाह्य' },
    });
    const res = await service.executeRestore('token_expired');
    expect(res).toBeNull();
    expect(service.errorMessage()).toBeTruthy();
    expect(service.restartScheduled()).toBe(false);
  });

  it('13. formatBytes: correctly formats sizes', () => {
    expect(service.formatBytes(0)).toBe('0 B');
    expect(service.formatBytes(1024)).toBe('1 KB');
    expect(service.formatBytes(1048576)).toBe('1 MB');
  });

  it('14. resolveErrorMessage: translates code via i18n or falls back to default', () => {
    mockI18n.t.mockImplementation((k: string) => (k === 'backupRestore.errors.RESTORE_ERROR' ? 'पुनर्संचयन अयशस्वी' : k));
    expect(service.resolveErrorMessage('RESTORE_ERROR')).toBe('पुनर्संचयन अयशस्वी');
    expect(service.resolveErrorMessage('UNKNOWN_CODE', 'Fallback message')).toBe('Fallback message');
  });

  it('15. scanUsbDrives: scans removable drives and sets signal', async () => {
    const drives = await service.scanUsbDrives();
    expect(mockBridge.backup.getUsbDrives).toHaveBeenCalled();
    expect(drives.length).toBe(1);
    expect(drives[0].label).toBe('KINGSTON');
    expect(service.usbDrives().length).toBe(1);
  });

  it('16. createUsbBackup: calls bridge and reloads history', async () => {
    const res = await service.createUsbBackup('usb_token_123');
    expect(mockBridge.backup.createUsbBackup).toHaveBeenCalledWith({ usbToken: 'usb_token_123' });
    expect(res?.displayName).toBe('dairy_backup_usb.db');
    expect(service.successMessage()).toContain('dairy_backup_usb.db');
    expect(mockBridge.backup.getHistory).toHaveBeenCalled();
  });

  it('17. loadSchedule: loads schedule from bridge', async () => {
    await service.loadSchedule();
    expect(mockBridge.backup.getSchedule).toHaveBeenCalled();
    expect(service.schedule()?.time).toBe('21:00');
  });

  it('18. updateSchedule: calls bridge to update schedule', async () => {
    const res = await service.updateSchedule(true, '22:00');
    expect(mockBridge.backup.updateSchedule).toHaveBeenCalledWith({ enabled: true, time: '22:00' });
    expect(res?.time).toBe('22:00');
    expect(service.schedule()?.time).toBe('22:00');
  });
});
