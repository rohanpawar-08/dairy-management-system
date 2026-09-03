import Database from 'better-sqlite3';
import { createVerifiedBackup, isRestoreOrBackupActive } from './backup.service';
import { BackupScheduleDto, UpdateBackupSchedulePayload } from '../../shared/ipc-contracts';

const SETTING_ENABLED = 'backup_schedule_enabled';
const SETTING_TIME = 'backup_schedule_time';
const SETTING_LAST_RUN = 'backup_schedule_last_run_date';

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Get current backup schedule configuration from app_settings.
 */
export function getBackupSchedule(db: Database.Database): BackupScheduleDto {
  const getSetting = (key: string): string | null => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  };

  const enabledVal = getSetting(SETTING_ENABLED);
  const timeVal = getSetting(SETTING_TIME);
  const lastRunVal = getSetting(SETTING_LAST_RUN);

  return {
    enabled: enabledVal === 'true',
    time: timeVal || '20:00',
    lastRunDate: lastRunVal || null,
  };
}

/**
 * Update backup schedule configuration in app_settings.
 */
export function updateBackupSchedule(
  db: Database.Database,
  payload: UpdateBackupSchedulePayload
): BackupScheduleDto {
  if (!payload || typeof payload.enabled !== 'boolean' || typeof payload.time !== 'string') {
    throw new Error('BACKUP_SCHEDULE_INVALID_PAYLOAD');
  }

  // Validate HH:MM time format
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(payload.time)) {
    throw new Error('BACKUP_SCHEDULE_INVALID_TIME');
  }

  const nowIso = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  const tx = db.transaction(() => {
    upsert.run(SETTING_ENABLED, payload.enabled ? 'true' : 'false', nowIso);
    upsert.run(SETTING_TIME, payload.time, nowIso);
  });
  tx();

  return getBackupSchedule(db);
}

/**
 * Format local date as YYYY-MM-DD.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format local time as HH:MM.
 */
export function getLocalTimeString(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/**
 * Evaluate schedule and execute daily backup if due, preventing duplicate runs on the same date.
 * Returns true if backup was executed, false otherwise.
 */
export async function checkAndRunScheduledBackup(
  db: Database.Database,
  now: Date = new Date()
): Promise<boolean> {
  const schedule = getBackupSchedule(db);

  if (!schedule.enabled) {
    return false;
  }

  const todayStr = getLocalDateString(now);
  if (schedule.lastRunDate === todayStr) {
    // Already executed today
    return false;
  }

  const currentTimeStr = getLocalTimeString(now);
  if (currentTimeStr < schedule.time) {
    // Scheduled time has not yet arrived
    return false;
  }

  // Never run during restore or another backup
  if (isRestoreOrBackupActive()) {
    return false;
  }

  // Record that today's run has started to prevent duplicate trigger
  const nowIso = now.toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(SETTING_LAST_RUN, todayStr, nowIso);

  try {
    await createVerifiedBackup(db, { triggerType: 'AUTOMATIC_SCHEDULED' });
    return true;
  } catch (err) {
    console.error('[Backup Scheduler] Scheduled backup execution failed:', err);
    return false;
  }
}

/**
 * Start the background backup scheduler timer.
 */
export function startBackupScheduler(
  dbSupplier: () => Database.Database | null,
  intervalMs: number = 60000
): void {
  stopBackupScheduler();

  schedulerInterval = setInterval(async () => {
    try {
      const db = dbSupplier();
      if (db) {
        await checkAndRunScheduledBackup(db);
      }
    } catch (err) {
      console.error('[Backup Scheduler] Error in scheduler loop:', err);
    }
  }, intervalMs);
}

/**
 * Stop the background backup scheduler timer and clean up.
 */
export function stopBackupScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

/**
 * Check if the scheduler timer is currently active.
 */
export function isSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}
