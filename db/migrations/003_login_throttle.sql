-- 003_login_throttle.sql — limits on failed login attempts.
--
-- One row per throttled key: an account ("user:42"), an unknown login name
-- ("name:bob"), or a client network ("ip:203.0.113.7").
CREATE TABLE login_throttle (
  key           TEXT PRIMARY KEY,
  attempts      INTEGER NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until  TIMESTAMPTZ
);
CREATE INDEX login_throttle_window_idx ON login_throttle (window_start);

-- Records one login attempt against p_key and says whether it may proceed.
--
-- The attempt is counted BEFORE the password is checked, and the caller
-- gives it back on success (login_attempt_succeeded). Checking first and
-- counting only after a failure would be racy: 100 parallel requests would
-- all pass the check before any failure was recorded. Here the row lock
-- (FOR UPDATE) makes concurrent attempts on one key queue up, so the limit
-- is exact.
--
-- More than p_max attempts within p_window locks the key for p_lock.
CREATE FUNCTION login_attempt(p_key TEXT, p_max INT, p_window INTERVAL, p_lock INTERVAL)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INT) AS $$
DECLARE
  r login_throttle;
BEGIN
  INSERT INTO login_throttle (key) VALUES (p_key) ON CONFLICT (key) DO NOTHING;
  SELECT * INTO r FROM login_throttle WHERE key = p_key FOR UPDATE;

  IF r.locked_until > now() THEN
    RETURN QUERY SELECT false, ceil(extract(epoch FROM r.locked_until - now()))::int;
    RETURN;
  END IF;

  -- Window over, or a lock just expired: start counting afresh.
  IF r.window_start <= now() - p_window OR r.locked_until IS NOT NULL THEN
    r.attempts := 0;
    r.window_start := now();
  END IF;
  r.attempts := r.attempts + 1;

  IF r.attempts > p_max THEN
    UPDATE login_throttle
       SET attempts = r.attempts, window_start = r.window_start, locked_until = now() + p_lock
     WHERE key = p_key;
    RETURN QUERY SELECT false, ceil(extract(epoch FROM p_lock))::int;
    RETURN;
  END IF;

  UPDATE login_throttle
     SET attempts = r.attempts, window_start = r.window_start, locked_until = NULL
   WHERE key = p_key;
  RETURN QUERY SELECT true, 0;
END;
$$ LANGUAGE plpgsql;

-- Called after a correct password.
--   Account key: cleared, so the owner starts fresh after logging in.
--   IP key: only this attempt is handed back. Clearing it would let an
--   attacker with one valid account of their own reset their IP's counter
--   by logging into it between guesses at other accounts.
CREATE FUNCTION login_attempt_succeeded(p_account_key TEXT, p_ip_key TEXT) RETURNS void AS $$
  DELETE FROM login_throttle WHERE key = p_account_key;
  UPDATE login_throttle SET attempts = greatest(attempts - 1, 0)
   WHERE key = p_ip_key AND locked_until IS NULL;
$$ LANGUAGE sql;
