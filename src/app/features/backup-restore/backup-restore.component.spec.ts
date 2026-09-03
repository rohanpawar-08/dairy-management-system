import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { BackupRestoreComponent } from './backup-restore.component';
import { BackupRestoreStateService } from '../../core/services/backup-restore-state.service';
import { I18nService } from '../../core/services/i18n.service';
import { RestoreConfirmDialogComponent } from './restore-confirm-dialog/restore-confirm-dialog.component';

describe('BackupRestoreComponent', () => {
  let component: BackupRestoreComponent;
  let mockRouter: any;
  let mockState: any;
  let mockI18n: any;
  let mockDialog: any;

  beforeEach(() => {
    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    mockState = {
      history: signal([
        {
          displayName: 'backup_2026-09-02.db',
          sizeBytes: 1048576,
          checksumSha256: 'abc123456789',
          triggerType: 'MANUAL',
          createdAt: '2026-09-02T12:00:00.000Z',
        },
      ]),
      isLoadingHistory: signal(false),
      isCreatingBackup: signal(false),
      isRestoring: signal(false),
      selectedCandidate: signal({
        cancelled: false,
        token: 'test_token_123',
        displayName: 'restore_candidate.db',
        sizeBytes: 2097152,
      }),
      lastSafetyBackupName: signal(null),
      restartScheduled: signal(false),
      errorMessage: signal(null),
      successMessage: signal(null),
      noticeMessage: signal(null),
      usbDrives: signal([]),
      isScanningUsb: signal(false),
      schedule: signal({
        enabled: true,
        time: '21:00',
        lastRunDate: '2026-09-01',
      }),
      isUpdatingSchedule: signal(false),
      loadHistory: vi.fn(),
      loadSchedule: vi.fn().mockResolvedValue(undefined),
      createBackup: vi.fn().mockResolvedValue({ displayName: 'b.db' }),
      selectDestinationAndBackup: vi.fn().mockResolvedValue({ displayName: 'b.db' }),
      scanUsbDrives: vi.fn().mockResolvedValue([]),
      createUsbBackup: vi.fn().mockResolvedValue({ displayName: 'usb_b.db' }),
      updateSchedule: vi.fn().mockResolvedValue({ enabled: true, time: '21:00' }),
      selectRestoreCandidate: vi.fn().mockResolvedValue({ token: 't1' }),
      clearCandidate: vi.fn(),
      executeRestore: vi.fn().mockResolvedValue({ success: true }),
      formatBytes: vi.fn().mockReturnValue('1.00 MB'),
    };

    mockI18n = {
      isMarathi: vi.fn().mockReturnValue(false),
      t: vi.fn().mockImplementation((key: string) => key),
    };

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(true)),
      }),
    };

    TestBed.configureTestingModule({
      imports: [BackupRestoreComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: BackupRestoreStateService, useValue: mockState },
        { provide: I18nService, useValue: mockI18n },
        { provide: MatDialog, useValue: mockDialog },
      ],
    });

    const fixture = TestBed.createComponent(BackupRestoreComponent);
    component = fixture.componentInstance;
    component.dialog = mockDialog as any;
  });

  it('1. should create component and call loadHistory and loadSchedule on init', () => {
    expect(component).toBeTruthy();
    component.ngOnInit();
    expect(mockState.loadHistory).toHaveBeenCalled();
    expect(mockState.loadSchedule).toHaveBeenCalled();
  });

  it('2. navigateToDashboard: calls router.navigate with /dashboard', () => {
    component.navigateToDashboard();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('3. handleCreateBackup: delegates to state.createBackup', async () => {
    await component.handleCreateBackup();
    expect(mockState.createBackup).toHaveBeenCalled();
  });

  it('4. handleSelectDestinationAndBackup: delegates to state.selectDestinationAndBackup', async () => {
    await component.handleSelectDestinationAndBackup();
    expect(mockState.selectDestinationAndBackup).toHaveBeenCalled();
  });

  it('5. handleSelectCandidate: delegates to state.selectRestoreCandidate', async () => {
    await component.handleSelectCandidate();
    expect(mockState.selectRestoreCandidate).toHaveBeenCalled();
  });

  it('6. handleClearCandidate: delegates to state.clearCandidate', () => {
    component.handleClearCandidate();
    expect(mockState.clearCandidate).toHaveBeenCalled();
  });

  it('7. openRestoreConfirmDialog: opens dialog and executes restore if confirmed', () => {
    component.openRestoreConfirmDialog();
    expect(mockDialog.open).toHaveBeenCalledWith(
      RestoreConfirmDialogComponent,
      expect.objectContaining({
        width: '520px',
        data: {
          displayName: 'restore_candidate.db',
          sizeFormatted: '1.00 MB',
        },
      })
    );
    expect(mockState.executeRestore).toHaveBeenCalledWith('test_token_123');
  });

  it('8. openRestoreConfirmDialog: does not execute restore if user cancelled dialog', () => {
    mockDialog.open.mockReturnValueOnce({
      afterClosed: vi.fn().mockReturnValue(of(false)),
    });
    component.openRestoreConfirmDialog();
    expect(mockState.executeRestore).not.toHaveBeenCalled();
  });

  it('9. getTriggerLabel: resolves correct labels for trigger types', () => {
    expect(component.getTriggerLabel('MANUAL')).toBe('backupRestore.triggerManual');
    expect(component.getTriggerLabel('AUTOMATIC_SHIFT_CLOSE')).toBe('backupRestore.triggerShiftClose');
    expect(component.getTriggerLabel('AUTOMATIC_SCHEDULED')).toBe('backupRestore.scheduleSection');
    expect(component.getTriggerLabel('PRE_RESTORE_SAFETY')).toBe('backupRestore.triggerPreRestore');
    expect(component.getTriggerLabel('OTHER')).toBe('OTHER');
  });

  it('10. formatDate: formats ISO string correctly and handles empty date', () => {
    expect(component.formatDate('')).toBe('-');
    expect(component.formatDate('2026-09-02T12:00:00Z')).toBeTruthy();
  });

  it('11. handleScanUsb: delegates to state.scanUsbDrives', async () => {
    await component.handleScanUsb();
    expect(mockState.scanUsbDrives).toHaveBeenCalled();
  });

  it('12. handleCreateUsbBackup: delegates to state.createUsbBackup with token', async () => {
    await component.handleCreateUsbBackup('token_456');
    expect(mockState.createUsbBackup).toHaveBeenCalledWith('token_456');
  });

  it('13. handleSaveSchedule: delegates to state.updateSchedule with form values', async () => {
    component.scheduleEnabled = true;
    component.scheduleTime = '22:30';
    await component.handleSaveSchedule();
    expect(mockState.updateSchedule).toHaveBeenCalledWith(true, '22:30');
  });
});
