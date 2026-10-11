import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.ts';
import { SQL } from './email-token-sql.ts';
// Same shape as a session token: 256 random bits, stored only as SHA-256.
import { hashSessionToken as hashToken, newSessionToken as newToken } from './session-token.ts';

export type EmailTokenPurpose = 'verify_email' | 'reset_password';

// Short for reset (it grants control of the account), longer for
// verification (people don't always read mail straight away).
export const TOKEN_TTL: Record<EmailTokenPurpose, string> = {
  verify_email: '24 hours',
  reset_password: '30 minutes',
};

@Injectable()
export class EmailTokenService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Creates a token and returns the raw value for the email link.
   * Any older unused token for the same purpose stops working, so only the
   * most recent email's link is valid.
   */
  async issue(userId: number, email: string, purpose: EmailTokenPurpose): Promise<string> {
    const token = newToken();
    await this.db.transaction(async (tx) => {
      await tx.query(SQL.retireUnused, [userId, purpose]);
      await tx.query(SQL.insert, [hashToken(token), userId, purpose, email, TOKEN_TTL[purpose]]);
    });
    return token;
  }

  /**
   * Marks the token used and returns who it belongs to, or null if it is
   * unknown, expired, already used, or for a different purpose.
   */
  async consume(
    token: string,
    purpose: EmailTokenPurpose,
    tx?: PoolClient,
  ): Promise<{ userId: number; email: string } | null> {
    const run = tx ?? this.db;
    const { rows } = await run.query<{ user_id: number; email: string }>(SQL.consume, [hashToken(token), purpose]);
    return rows[0] ? { userId: rows[0].user_id, email: rows[0].email } : null;
  }
}
