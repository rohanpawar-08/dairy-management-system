import Database from 'better-sqlite3';
import {
  hashPassword,
  hashPin,
  validatePasswordPolicy,
  validatePinPolicy,
} from '../core/credential.service';
import { auditService, getOrCreateDeviceId } from './audit.service';

/**
 * Stage 3: First-Run Dairy Setup Service
 *
 * Evaluates setup status (UNINITIALIZED, READY, INCONSISTENT) and executes
 * the authoritative atomic transaction creating dairy_profile, initial Owner,
 * enabled milk types setting, and SETUP_COMPLETED audit record.
 */

export type SetupState = 'UNINITIALIZED' | 'READY' | 'INCONSISTENT';

export interface DairyProfileSummary {
  centreName: string;
  registrationCode?: string;
  ownerName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  addressLine?: string;
  taluka?: string;
  district?: string;
  pincode?: string;
  defaultLanguage: 'mr' | 'en';
  settlementStartDay: string;
  enabledMilkTypes?: 'COW' | 'BUFFALO' | 'BOTH';
}

export interface SetupStatusResult {
  state: SetupState;
  dairyProfile: DairyProfileSummary | null;
  message?: string;
}

export interface CompleteSetupPayload {
  centreName: string;
  registrationCode?: string;
  ownerName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  addressLine?: string;
  taluka?: string;
  district?: string;
  pincode?: string;
  defaultLanguage: 'mr' | 'en';
  enabledMilkTypes: 'COW' | 'BUFFALO' | 'BOTH';
  settlementStartDay:
    | 'MONDAY'
    | 'TUESDAY'
    | 'WEDNESDAY'
    | 'THURSDAY'
    | 'FRIDAY'
    | 'SATURDAY'
    | 'SUNDAY';
  username: string;
  password: string;
  pin?: string;
}

export class SetupService {
  /**
   * Determine the authoritative setup state of the database.
   *
   * Rules:
   * 1. UNINITIALIZED: exactly zero profiles AND zero users.
   * 2. READY: exactly one profile AND at least one active user with role='OWNER' AND is_active=1.
   * 3. INCONSISTENT: every other combination (e.g. Operator-only users, inactive Owner, profile without Owner).
   */
  getSetupStatus(db: Database.Database): SetupStatusResult {
    const profileCountRow = db
      .prepare('SELECT count(*) as count FROM dairy_profile')
      .get() as { count: number };
    const activeOwnerCountRow = db
      .prepare("SELECT count(*) as count FROM users WHERE role = 'OWNER' AND is_active = 1")
      .get() as { count: number };
    const totalUsersRow = db
      .prepare('SELECT count(*) as count FROM users')
      .get() as { count: number };

    const profileCount = profileCountRow.count;
    const activeOwnerCount = activeOwnerCountRow.count;
    const totalUsersCount = totalUsersRow.count;

    // 1. UNINITIALIZED: Exactly zero profiles and zero users
    if (profileCount === 0 && totalUsersCount === 0) {
      return {
        state: 'UNINITIALIZED',
        dairyProfile: null,
        message: 'System is uninitialized. First-run setup required.',
      };
    }

    // 2. READY: Exactly one profile and at least one active Owner exists
    if (profileCount === 1 && activeOwnerCount >= 1) {
      const profileRow = db
        .prepare('SELECT * FROM dairy_profile WHERE id = 1')
        .get() as
        | {
            centre_name: string;
            registration_code?: string;
            owner_name: string;
            phone_primary: string;
            phone_secondary?: string;
            address_line?: string;
            taluka?: string;
            district?: string;
            pincode?: string;
            default_language: 'mr' | 'en';
            settlement_start_day: string;
          }
        | undefined;

      if (profileRow) {
        const milkTypeRow = db
          .prepare("SELECT value FROM app_settings WHERE key = 'enabled_milk_types'")
          .get() as { value?: string } | undefined;

        return {
          state: 'READY',
          dairyProfile: {
            centreName: profileRow.centre_name,
            registrationCode: profileRow.registration_code || undefined,
            ownerName: profileRow.owner_name,
            phonePrimary: profileRow.phone_primary,
            phoneSecondary: profileRow.phone_secondary || undefined,
            addressLine: profileRow.address_line || undefined,
            taluka: profileRow.taluka || undefined,
            district: profileRow.district || undefined,
            pincode: profileRow.pincode || undefined,
            defaultLanguage: profileRow.default_language,
            settlementStartDay: profileRow.settlement_start_day,
            enabledMilkTypes:
              (milkTypeRow?.value as 'COW' | 'BUFFALO' | 'BOTH') || 'BOTH',
          },
        };
      }
    }

    // 3. INCONSISTENT: All other combinations
    return {
      state: 'INCONSISTENT',
      dairyProfile: null,
      message:
        'Inconsistent database state: partial profile or missing active owner detected. System recovery required.',
    };
  }

  /**
   * Execute atomic First-Run Setup transaction.
   *
   * Asynchronous scrypt password/PIN hashing is executed entirely BEFORE opening
   * the database transaction. The database transaction is executed via a synchronous
   * immediate callback (db.transaction(...).immediate(...)) without async/await.
   */
  async completeSetup(
    db: Database.Database,
    payload: CompleteSetupPayload
  ): Promise<DairyProfileSummary> {
    // 1. Validation
    if (!payload.centreName || payload.centreName.trim().length === 0) {
      throw new Error('Dairy Centre Name is required.');
    }
    if (!payload.ownerName || payload.ownerName.trim().length === 0) {
      throw new Error('Owner Full Name is required.');
    }
    if (!payload.phonePrimary || !/^[6-9]\d{9}$/.test(payload.phonePrimary.trim())) {
      throw new Error('Primary phone must be a valid 10-digit Indian mobile number.');
    }
    if (payload.pincode && !/^\d{6}$/.test(payload.pincode.trim())) {
      throw new Error('Pincode must be a 6-digit postal code.');
    }
    if (payload.defaultLanguage !== 'mr' && payload.defaultLanguage !== 'en') {
      throw new Error("Default language must be 'mr' or 'en'.");
    }
    if (!['COW', 'BUFFALO', 'BOTH'].includes(payload.enabledMilkTypes)) {
      throw new Error("Enabled milk types must be 'COW', 'BUFFALO', or 'BOTH'.");
    }
    if (!payload.username || payload.username.trim().length < 3) {
      throw new Error('Owner username must be at least 3 characters long.');
    }

    // Enforce password policy (minimum 10, maximum 128 characters)
    const passwordPolicy = validatePasswordPolicy(payload.password);
    if (!passwordPolicy.valid) {
      throw new Error(passwordPolicy.error || 'Invalid password policy.');
    }

    let hashedPin: string | null = null;
    if (payload.pin && payload.pin.trim().length > 0) {
      const pinPolicy = validatePinPolicy(payload.pin.trim());
      if (!pinPolicy.valid) {
        throw new Error(pinPolicy.error || 'Invalid PIN policy.');
      }
      // Async hash before transaction
      hashedPin = await hashPin(payload.pin.trim());
    }

    // 2. Perform async scrypt password hashing BEFORE opening the transaction
    const hashedPassword = await hashPassword(payload.password);
    const nowIso = new Date().toISOString();

    const centreNameTrimmed = payload.centreName.trim();
    const regCodeTrimmed = payload.registrationCode?.trim() || null;
    const ownerNameTrimmed = payload.ownerName.trim();
    const phonePrimaryTrimmed = payload.phonePrimary.trim();
    const phoneSecondaryTrimmed = payload.phoneSecondary?.trim() || null;
    const addressLineTrimmed = payload.addressLine?.trim() || null;
    const talukaTrimmed = payload.taluka?.trim() || null;
    const districtTrimmed = payload.district?.trim() || null;
    const pincodeTrimmed = payload.pincode?.trim() || null;
    const usernameNormalized = payload.username.trim().toLowerCase();

    // 3. Execute synchronous IMMEDIATE SQLite transaction (non-async, returns no Promise)
    const setupTransaction = db.transaction((): DairyProfileSummary => {
      // Recheck UNINITIALIZED state strictly inside transaction lock
      const currentStatus = this.getSetupStatus(db);
      if (currentStatus.state !== 'UNINITIALIZED') {
        throw new Error(
          `Cannot perform setup: Database is in ${currentStatus.state} state.`
        );
      }

      // Ensure stable device ID is generated
      const deviceId = getOrCreateDeviceId(db);

      // Insert singleton dairy_profile with id = 1
      db.prepare(`
        INSERT INTO dairy_profile (
          id,
          centre_name,
          registration_code,
          owner_name,
          phone_primary,
          phone_secondary,
          address_line,
          taluka,
          district,
          pincode,
          receipt_header_mr,
          receipt_footer_mr,
          default_language,
          settlement_start_day,
          created_at,
          updated_at
        ) VALUES (
          1,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `).run(
        centreNameTrimmed,
        regCodeTrimmed,
        ownerNameTrimmed,
        phonePrimaryTrimmed,
        phoneSecondaryTrimmed,
        addressLineTrimmed,
        talukaTrimmed,
        districtTrimmed,
        pincodeTrimmed,
        centreNameTrimmed,
        'धन्यवाद! पुन्हा या.',
        payload.defaultLanguage,
        payload.settlementStartDay,
        nowIso,
        nowIso
      );

      // Insert initial Owner user (role='OWNER', is_active=1)
      const userResult = db
        .prepare(`
          INSERT INTO users (
            username,
            password_hash,
            pin_hash,
            full_name,
            role,
            is_active,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, 'OWNER', 1, ?, ?)
        `)
        .run(
          usernameNormalized,
          hashedPassword,
          hashedPin,
          ownerNameTrimmed,
          nowIso,
          nowIso
        );

      const ownerUserId = Number(userResult.lastInsertRowid);

      // Store enabled milk types in app_settings
      db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('enabled_milk_types', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(payload.enabledMilkTypes, nowIso);

      // Write SETUP_COMPLETED audit log
      auditService.logEvent(db, {
        userId: ownerUserId,
        actionType: 'SETUP_COMPLETED',
        entityName: 'dairy_profile',
        entityId: '1',
        details: {
          centreName: centreNameTrimmed,
          ownerName: ownerNameTrimmed,
          username: usernameNormalized,
          defaultLanguage: payload.defaultLanguage,
          settlementStartDay: payload.settlementStartDay,
          enabledMilkTypes: payload.enabledMilkTypes,
          deviceId,
        },
        createdAt: nowIso,
      });

      return {
        centreName: centreNameTrimmed,
        registrationCode: regCodeTrimmed || undefined,
        ownerName: ownerNameTrimmed,
        phonePrimary: phonePrimaryTrimmed,
        phoneSecondary: phoneSecondaryTrimmed || undefined,
        addressLine: addressLineTrimmed || undefined,
        taluka: talukaTrimmed || undefined,
        district: districtTrimmed || undefined,
        pincode: pincodeTrimmed || undefined,
        defaultLanguage: payload.defaultLanguage,
        settlementStartDay: payload.settlementStartDay,
        enabledMilkTypes: payload.enabledMilkTypes,
      };
    });

    // Execute immediate transaction synchronously
    return setupTransaction.immediate();
  }
}

export const setupService = new SetupService();
