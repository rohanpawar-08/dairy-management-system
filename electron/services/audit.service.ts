import Database from 'better-sqlite3';
import * as crypto from 'crypto';

/**
 * Stage 3: Base Append-Only Audit Service
 *
 * Implements strict append-only audit logging into `audit_logs`.
 * Guarantees zero credential or secret leakage into log details.
 */

export type AuditActionType =
  | 'SETUP_COMPLETED'
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_LOGOUT'
  | 'FARMER_CREATED'
  | 'FARMER_UPDATED'
  | 'FARMER_DEACTIVATED'
  | 'FARMER_REACTIVATED'
  | 'RATE_PLAN_CREATED'
  | 'RATE_PLAN_UPDATED'
  | 'RATE_PLAN_CLONED'
  | 'RATE_PLAN_APPROVED'
  | 'RATE_PLAN_SUPERSEDED'
  | 'RATE_PLAN_CANCELLED';

export interface AuditEventInput {
  userId?: number | null;
  actionType: AuditActionType;
  entityName: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  createdAt?: string;
}

const SENSITIVE_KEY_PATTERNS = [
  'password',
  'pin',
  'hash',
  'secret',
  'salt',
  'token',
  'bankaccount',
  'accountnumber',
  'upiid',
  'vpa',
];

/**
 * Sanitize an object to ensure no passwords, PINs, or credential hashes leak into audit logs.
 */
export function sanitizeAuditDetails(details?: Record<string, unknown>): Record<string, unknown> {
  if (!details || typeof details !== 'object') {
    return {};
  }

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((p) => normalizedKey.includes(p));

    if (isSensitive) {
      cleaned[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = sanitizeAuditDetails(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Retrieve or create a stable unique device_id stored in app_settings.
 */
export function getOrCreateDeviceId(db: Database.Database): string {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'device_id'")
    .get() as { value: string } | undefined;

  if (row?.value) {
    return row.value;
  }

  const newDeviceId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('device_id', ?, ?)"
  ).run(newDeviceId, now);

  return newDeviceId;
}

/**
 * Append an immutable audit event to audit_logs.
 * This class exposes NO update, delete, or clear methods.
 */
export class AuditService {
  /**
   * Log an audit event.
   */
  logEvent(db: Database.Database, event: AuditEventInput): void {
    const deviceId = getOrCreateDeviceId(db);
    const userId = event.userId ?? null;
    const actionType = event.actionType;
    const entityName = event.entityName;
    const entityId = event.entityId ?? null;
    const safeDetails = sanitizeAuditDetails(event.details);
    const detailsJson = JSON.stringify(safeDetails);
    const createdAt = event.createdAt ?? new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        device_id,
        user_id,
        action_type,
        entity_name,
        entity_id,
        details_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(deviceId, userId, actionType, entityName, entityId, detailsJson, createdAt);
  }
}

export const auditService = new AuditService();
