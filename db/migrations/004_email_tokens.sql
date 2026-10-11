-- 004_email_tokens.sql — email verification and password reset.

ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;

-- Single-use tokens sent by email. As with sessions, only the SHA-256 of
-- the token is stored: someone who can read this table still can't use the
-- links.
CREATE TABLE email_tokens (
  token_hash  BYTEA PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  -- The address the mail went to. A verification link only verifies THIS
  -- address: if the user has changed their email since, the old link must
  -- not mark the new address as verified.
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX email_tokens_user_idx ON email_tokens (user_id, purpose);
CREATE INDEX email_tokens_expiry_idx ON email_tokens (expires_at);
