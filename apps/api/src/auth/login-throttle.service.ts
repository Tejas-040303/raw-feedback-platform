import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import { ACCOUNT_LIMIT, IP_LIMIT, type RateLimit } from './login-throttle.ts';

@Injectable()
export class LoginThrottleService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Counts one attempt against both keys. Returns 0 if the attempt may go
   * ahead, otherwise how many seconds the caller must wait. Must be called
   * before the password is checked.
   *
   * Two separate statements, each committing on its own, so a request holds
   * at most one row lock at a time and two requests can never deadlock.
   */
  async consume(accountKey: string, ipKey: string): Promise<number> {
    const ip = await this.attempt(ipKey, IP_LIMIT);
    const account = await this.attempt(accountKey, ACCOUNT_LIMIT);
    return Math.max(ip, account);
  }

  /**
   * Generic form of the same limiter, for other abuse-prone endpoints
   * (e.g. "send me a reset email"). Returns seconds to wait, 0 if allowed.
   */
  limit(key: string, limit: RateLimit): Promise<number> {
    return this.attempt(key, limit);
  }

  private async attempt(key: string, limit: RateLimit): Promise<number> {
    const { rows } = await this.db.query<{ allowed: boolean; retry_after_seconds: number }>(
      'SELECT * FROM login_attempt($1, $2, $3::interval, $4::interval)',
      [key, limit.max, limit.window, limit.lock],
    );
    return rows[0].allowed ? 0 : rows[0].retry_after_seconds;
  }

  async succeeded(accountKey: string, ipKey: string): Promise<void> {
    await this.db.query('SELECT login_attempt_succeeded($1, $2)', [accountKey, ipKey]);
  }
}
