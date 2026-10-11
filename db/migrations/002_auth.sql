-- 002_auth.sql — accounts and login sessions.
-- A new file rather than an edit to 001: a migration that has already run
-- somewhere must never change, or databases silently diverge.

-- Columns are nullable because users created before this migration have no
-- account details. The API requires all of them for new sign-ups.
ALTER TABLE users
  ADD COLUMN full_name      TEXT,
  ADD COLUMN username       TEXT,
  ADD COLUMN email          TEXT,
  ADD COLUMN date_of_birth  DATE,
  ADD COLUMN password_hash  TEXT;

-- Case-insensitive uniqueness: "Tejas" and "tejas" are the same username,
-- "A@x.com" and "a@x.com" the same email. A plain UNIQUE(username) would
-- allow both. Login looks users up by the same lower() expression, so these
-- indexes also serve the login query.
CREATE UNIQUE INDEX users_username_uq ON users (lower(username));
CREATE UNIQUE INDEX users_email_uq    ON users (lower(email));

ALTER TABLE users
  ADD CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9_.]{3,30}$'),
  ADD CONSTRAINT users_dob_past        CHECK (date_of_birth < CURRENT_DATE);

-- Server-side sessions. The browser holds a random token in an HttpOnly
-- cookie; the database stores only its SHA-256. A leaked sessions table
-- therefore can't be used to log in, and logout / "log out everywhere" is
-- a DELETE, which a stateless JWT can't do before it expires.
CREATE TABLE sessions (
  token_hash  BYTEA PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);
