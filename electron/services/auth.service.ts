import Database from 'better-sqlite3';
import { verifyPassword, verifyPin } from '../core/credential.service';
import { rateLimiterService } from '../core/rate-limiter.service';
import { sessionService, AuthSessionDto, UserRole } from '../core/session.service';
import { setupService } from './setup.service';
import { auditService } from './audit.service';

/**
 * Stage 3: Local Authentication Service
 *
 * Authenticates active Owners and Operators using scrypt password or PIN verification,
 * enforces local in-memory rate limiting, records audit trails, and manages memory sessions.
 */

export interface LoginPayload {
  username: string;
  password?: string;
  pin?: string;
}

export class AuthService {
  /**
   * Authenticate user credentials and establish an in-memory session bound to webContentsId.
   */
  async login(
    db: Database.Database,
    payload: LoginPayload,
    webContentsId: number
  ): Promise<AuthSessionDto> {
    const rawUsername = (payload.username || '').trim();
    const normalizedUsername = rawUsername.toLowerCase();
    const nowIso = new Date().toISOString();

    if (!normalizedUsername) {
      throw new Error('Username is required.');
    }

    const hasPassword = Boolean(payload.password && payload.password.length > 0);
    const hasPin = Boolean(payload.pin && payload.pin.length > 0);

    if (!hasPassword && !hasPin) {
      throw new Error('Password or PIN is required.');
    }

    // 0. Enforce setup state is strictly READY before permitting authentication
    const setupStatus = setupService.getSetupStatus(db);
    if (setupStatus.state !== 'READY') {
      if (setupStatus.state === 'INCONSISTENT') {
        throw new Error(
          'Database is in an inconsistent state. System recovery required.'
        );
      }
      throw new Error('Database is uninitialized. First-run setup required.');
    }

    // 1. Check Rate Limiter
    const rateCheck = rateLimiterService.isRateLimited(normalizedUsername, webContentsId);
    if (rateCheck.limited) {
      auditService.logEvent(db, {
        userId: null,
        actionType: 'AUTH_RATE_LIMITED',
        entityName: 'users',
        entityId: normalizedUsername,
        details: {
          username: normalizedUsername,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
          webContentsId,
        },
        createdAt: nowIso,
      });

      throw new Error(
        `Too many failed attempts. Please retry in ${rateCheck.retryAfterSeconds} seconds.`
      );
    }

    // 2. Fetch User Record
    const user = db
      .prepare(`
        SELECT id, username, password_hash, pin_hash, full_name, role, is_active
        FROM users
        WHERE username = ?
      `)
      .get(normalizedUsername) as
      | {
          id: number;
          username: string;
          password_hash: string;
          pin_hash: string | null;
          full_name: string;
          role: UserRole;
          is_active: number;
        }
      | undefined;

    // Helper for recording failure and throwing generic response
    const handleAuthFailure = (matchedUserId?: number | null) => {
      rateLimiterService.recordFailure(normalizedUsername, webContentsId);
      auditService.logEvent(db, {
        userId: matchedUserId ?? null,
        actionType: 'AUTH_LOGIN_FAILED',
        entityName: 'users',
        entityId: normalizedUsername,
        details: {
          username: normalizedUsername,
          authMethod: hasPassword ? 'PASSWORD' : 'PIN',
          webContentsId,
        },
        createdAt: nowIso,
      });

      throw new Error('Invalid username or credentials.');
    };

    // Unknown user
    if (!user) {
      return handleAuthFailure(null);
    }

    // Inactive user
    if (user.is_active !== 1) {
      return handleAuthFailure(user.id);
    }

    // 3. Verify Credential
    let isCredentialValid = false;

    if (hasPassword && payload.password) {
      isCredentialValid = await verifyPassword(payload.password, user.password_hash);
    } else if (hasPin && payload.pin) {
      if (user.pin_hash) {
        isCredentialValid = await verifyPin(payload.pin, user.pin_hash);
      }
    }

    if (!isCredentialValid) {
      return handleAuthFailure(user.id);
    }

    // 4. Authentication Succeeded: Reset Rate Limiting
    rateLimiterService.recordSuccess(normalizedUsername, webContentsId);

    // 5. Establish Session
    const session = sessionService.createSession(webContentsId, {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    });

    // 6. Record Audit Event (If audit recording fails, destroy session to prevent untracked access)
    try {
      auditService.logEvent(db, {
        userId: user.id,
        actionType: 'AUTH_LOGIN_SUCCESS',
        entityName: 'users',
        entityId: String(user.id),
        details: {
          username: user.username,
          role: user.role,
          authMethod: hasPassword ? 'PASSWORD' : 'PIN',
          webContentsId,
        },
        createdAt: nowIso,
      });
    } catch (auditErr) {
      sessionService.clearSession(webContentsId);
      throw new Error('Authentication failure: Unable to record security audit log.');
    }

    return session;
  }

  /**
   * Log out active session for a WebContents ID and record audit log.
   */
  logout(db: Database.Database, webContentsId: number): boolean {
    const session = sessionService.getSession(webContentsId);
    if (!session) {
      return false;
    }

    sessionService.clearSession(webContentsId);

    try {
      auditService.logEvent(db, {
        userId: session.userId,
        actionType: 'AUTH_LOGOUT',
        entityName: 'users',
        entityId: String(session.userId),
        details: {
          username: session.username,
          role: session.role,
          webContentsId,
        },
      });
    } catch {
      // Best effort audit on logout
    }

    return true;
  }
}

export const authService = new AuthService();
