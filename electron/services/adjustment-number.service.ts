import Database from 'better-sqlite3';

/**
 * Service for generating monotonic, collision-safe adjustment reference numbers.
 * Format: ADJ-YYYYMMDD-000001
 *
 * Sequence counters are stored in app_settings and incremented atomically inside
 * the parent creation transaction. Transaction rollback safely restores the counter.
 */
export class AdjustmentNumberService {
  generateReferenceNumber(db: Database.Database, businessDate: string): string {
    const cleanDate = businessDate.replace(/-/g, '');
    const settingKey = `adj_counter_${cleanDate}`;

    const row = db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(settingKey) as { value: string } | undefined;

    let currentCounter = 0;
    if (row && row.value) {
      const parsed = parseInt(row.value, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        currentCounter = parsed;
      }
    }

    const nextCounter = currentCounter + 1;
    const nowIso = new Date().toISOString();

    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    ).run(settingKey, String(nextCounter), nowIso);

    const sequencePadded = String(nextCounter).padStart(6, '0');
    return `ADJ-${cleanDate}-${sequencePadded}`;
  }
}

export const adjustmentNumberService = new AdjustmentNumberService();
