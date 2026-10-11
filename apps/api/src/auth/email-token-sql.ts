/**
 * SQL for email tokens, verification and password reset. Kept apart from
 * the Nest services so test/db runs these exact statements against Postgres.
 */
export const SQL = {
  /** $1 user_id, $2 purpose: retire older unused tokens of the same kind. */
  retireUnused: `
    UPDATE email_tokens SET used_at = now()
    WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,

  /** $1 token_hash, $2 user_id, $3 purpose, $4 email, $5 ttl interval */
  insert: `
    INSERT INTO email_tokens (token_hash, user_id, purpose, email, expires_at)
    VALUES ($1, $2, $3, $4, now() + $5::interval)`,

  /**
   * $1 token_hash, $2 purpose. Checks and marks used in ONE statement, so
   * two requests racing with the same link can't both succeed: the second
   * finds used_at already set and matches no row.
   */
  consume: `
    UPDATE email_tokens SET used_at = now()
    WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
    RETURNING user_id::int, email`,

  /** $1 user_id, $2 email the link was sent to. Only verifies that address. */
  markVerified: `
    UPDATE users SET email_verified_at = coalesce(email_verified_at, now())
    WHERE id = $1 AND lower(email) = lower($2)`,

  /** $1 user_id, $2 new password hash, $3 email the reset link was sent to. */
  setPassword: `
    UPDATE users SET password_hash = $2,
      -- The link reached their inbox, which proves they own the address.
      email_verified_at = CASE WHEN lower(email) = lower($3) THEN coalesce(email_verified_at, now())
                               ELSE email_verified_at END
    WHERE id = $1`,

  /** $1 user_id: log out every device. */
  deleteSessions: `DELETE FROM sessions WHERE user_id = $1`,
} as const;
