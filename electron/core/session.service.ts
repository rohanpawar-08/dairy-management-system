import { WebContents } from 'electron';

/**
 * Stage 3: Main-Process Session Authority
 *
 * Sessions exist strictly in Electron main-process memory and are bound to the
 * requesting renderer's webContents.id. Tokens are NEVER sent to localStorage or cookies.
 */

export type UserRole = 'OWNER' | 'OPERATOR';

export interface AuthSessionDto {
  userId: number;
  username: string;
  fullName: string;
  role: UserRole;
  loginTime: string;
}

export class SessionService {
  private sessions = new Map<number, AuthSessionDto>();

  /**
   * Create an in-memory session bound to the requesting WebContents ID.
   */
  createSession(
    webContentsId: number,
    user: { id: number; username: string; full_name: string; role: UserRole }
  ): AuthSessionDto {
    const session: AuthSessionDto = {
      userId: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      loginTime: new Date().toISOString(),
    };
    this.sessions.set(webContentsId, session);
    return session;
  }

  /**
   * Retrieve active session for a WebContents ID.
   */
  getSession(webContentsId: number): AuthSessionDto | null {
    return this.sessions.get(webContentsId) ?? null;
  }

  /**
   * Invalidate and remove session on logout.
   */
  clearSession(webContentsId: number): boolean {
    return this.sessions.delete(webContentsId);
  }

  /**
   * Invalidate all sessions (e.g. on application shutdown).
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }

  /**
   * Enforce that a valid session exists; throws an error otherwise.
   */
  requireAuthenticated(webContentsId: number): AuthSessionDto {
    const session = this.getSession(webContentsId);
    if (!session) {
      throw new Error('Unauthorized: No active session for this window.');
    }
    return session;
  }

  /**
   * Enforce that a session exists and possesses the specific required role.
   */
  requireRole(webContentsId: number, requiredRole: UserRole): AuthSessionDto {
    const session = this.requireAuthenticated(webContentsId);
    if (session.role !== requiredRole) {
      throw new Error(`Forbidden: Action requires role '${requiredRole}'.`);
    }
    return session;
  }

  /**
   * Enforce that a session exists and is either OWNER or OPERATOR.
   */
  requireOwnerOrOperator(webContentsId: number): AuthSessionDto {
    const session = this.requireAuthenticated(webContentsId);
    if (session.role !== 'OWNER' && session.role !== 'OPERATOR') {
      throw new Error('Forbidden: Insufficient privileges.');
    }
    return session;
  }

  /**
   * Auto-bind cleanup when a WebContents is destroyed.
   */
  bindWebContents(webContents: WebContents): void {
    const id = webContents.id;
    webContents.once('destroyed', () => {
      this.clearSession(id);
    });
  }
}

// Global Singleton Instance for Main Process
export const sessionService = new SessionService();
