import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import { hashSessionToken, newSessionToken, readCookie, SESSION_COOKIE, SESSION_TTL_DAYS } from './session-token.ts';

export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  /** Creates a session and returns the raw token for the cookie. */
  async createSession(userId: number): Promise<string> {
    const token = newSessionToken();
    await this.db.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + make_interval(days => $3))`,
      [hashSessionToken(token), userId, SESSION_TTL_DAYS],
    );
    return token;
  }

  async destroySession(cookieHeader: string | undefined): Promise<void> {
    const token = readCookie(cookieHeader, SESSION_COOKIE);
    if (token) await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
  }

  /** The logged-in user, or null. Expired sessions count as logged out. */
  async userFromCookie(cookieHeader: string | undefined): Promise<SessionUser | null> {
    const token = readCookie(cookieHeader, SESSION_COOKIE);
    if (!token) return null;
    const { rows } = await this.db.query<SessionUser>(
      `SELECT u.id::int AS id, u.username, u.full_name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashSessionToken(token)],
    );
    return rows[0] ?? null;
  }

  async requireUser(cookieHeader: string | undefined): Promise<SessionUser> {
    const user = await this.userFromCookie(cookieHeader);
    if (!user) throw new UnauthorizedException({ code: 'NOT_LOGGED_IN' });
    return user;
  }
}
