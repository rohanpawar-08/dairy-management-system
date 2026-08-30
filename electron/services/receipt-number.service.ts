import Database from 'better-sqlite3';
import { ShiftType } from '../../shared/ipc-contracts';

/**
 * Transactional Collision-Safe Receipt Number Generator (Stage 6)
 *
 * Generates monotonic, shift-scoped receipt numbers in the format:
 * - Morning: MC-YYYYMMDD-M-000001
 * - Evening: MC-YYYYMMDD-E-000001
 *
 * Sequence counters are stored atomically in `app_settings`.
 * Rollback of the parent SQLite transaction automatically rolls back counter increments.
 */
export class ReceiptNumberService {
  /**
   * Allocate the next sequential receipt number for a given business date and shift.
   * MUST be executed inside an active SQLite transaction.
   *
   * @param db SQLite database instance
   * @param businessDate Business date in YYYY-MM-DD format
   * @param shiftType Shift type ('MORNING' | 'EVENING')
   * @returns Generated receipt number string (e.g. 'MC-20260901-M-000001')
   */
  getNextReceiptNumber(
    db: Database.Database,
    businessDate: string,
    shiftType: ShiftType
  ): string {
    const compactDate = businessDate.replace(/-/g, '');
    const shiftCode = shiftType === 'MORNING' ? 'M' : 'E';
    const settingKey = `receipt_counter_${compactDate}_${shiftType}`;

    // Read current sequence counter from app_settings
    const row = db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(settingKey) as { value: string } | undefined;

    let currentSeq = 0;
    if (row && row.value) {
      const parsed = parseInt(row.value, 10);
      if (Number.isSafeInteger(parsed) && parsed >= 0) {
        currentSeq = parsed;
      }
    }

    const nextSeq = currentSeq + 1;

    // Upsert the updated counter into app_settings
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(settingKey, String(nextSeq));

    const paddedSeq = String(nextSeq).padStart(6, '0');
    return `MC-${compactDate}-${shiftCode}-${paddedSeq}`;
  }
}

export const receiptNumberService = new ReceiptNumberService();
