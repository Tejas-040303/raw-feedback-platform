/**
 * Applies every migration in db/migrations, then runs the real generated SQL
 * against Postgres.
 *
 *   TEST_DATABASE_URL=postgres://rfp:rfp@localhost:5432/postgres npm run test:db
 *
 * Creates (and drops) a throwaway database, so point it at a server where
 * that's allowed. Uses the psql CLI instead of the pg driver so it has no
 * npm dependencies.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildFeedbackQuery, encodeCursor, type FeedbackFilters } from '../../src/feedback/feedback-query.ts';
import { cityKey, nameKey } from '../../src/common/normalize.ts';
import { SQL as TOKEN_SQL } from '../../src/auth/email-token-sql.ts';
import { hashSessionToken } from '../../src/auth/session-token.ts';

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://rfp:rfp@localhost:5432/postgres';
const DB = `rfp_test_${process.pid}`;
const url = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);
const migrationsDir = fileURLToPath(new URL('../../../../db/migrations/', import.meta.url));
const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

function psql(target: string, input: string): string {
  return execFileSync('psql', [target, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
const sql = (s: string) => psql(url, s);

/** Runs a parameterised query exactly as the API would, via psql's \bind. */
function query(text: string, params: unknown[]): any[] {
  // psql reads backslash escapes inside quoted \bind arguments, so double them.
  const quote = (v: unknown) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  const out = sql(`SELECT coalesce(json_agg(t), '[]') FROM (${text}) t \\bind ${params.map(quote).join(' ')} \\g`);
  return JSON.parse(out);
}

function expectUniqueViolation(statement: string) {
  assert.throws(() => sql(statement), /duplicate key value violates unique constraint/);
}

const feed = (f: FeedbackFilters) => {
  const built = buildFeedbackQuery(f);
  return { rows: query(built.sql, built.params), limit: built.limit };
};

before(() => {
  psql(ADMIN_URL, `CREATE DATABASE ${DB}`);
  for (const m of migrations) sql(`\\i ${migrationsDir}${m}`);
  sql(`
    INSERT INTO users (display_name) VALUES ('a'), ('b'), ('c');
    INSERT INTO categories (name, name_key, slug) VALUES ('Restaurants', 'restaurants', 'restaurants'),
                                                        ('Automobiles', 'automobiles', 'automobiles');
  `);
});

after(() => {
  psql(ADMIN_URL, `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
});

test('category duplicates are blocked by normalised key', () => {
  expectUniqueViolation(
    `INSERT INTO categories (name, name_key, slug) VALUES ('restaurants!', '${nameKey('restaurants!')}', 'restaurants-2')`,
  );
});

test('entity identity = category + name + place', () => {
  const ins = (name: string, city: string | null) =>
    `INSERT INTO entities (category_id, name, name_key, slug, country_code, city, city_key)
     VALUES (1, '${name.replace(/'/g, "''")}', '${nameKey(name)}', '${nameKey(name).replace(/ /g, '-')}-${city ?? 'x'}',
             'IN', ${city ? `'${city}'` : 'NULL'}, ${city ? `'${cityKey(city)}'` : 'NULL'})`;

  sql(ins("Domino's", 'Pune'));
  sql(ins("Domino's", 'Mumbai'));            // same name, different city: allowed
  expectUniqueViolation(ins('Dominos', 'Pune'));   // same thing spelled differently: blocked

  sql(ins('Online Only Store', null));
  // NULLS NOT DISTINCT: without it, two rows with city = NULL would both be
  // accepted, because in SQL NULL is never equal to NULL.
  expectUniqueViolation(ins('online only store', null));
});

test('fuzzy "did you mean" finds near duplicates', () => {
  const rows = query(
    `SELECT name FROM entities WHERE category_id = 1 AND name_key % $1 ORDER BY similarity(name_key, $1) DESC`,
    [nameKey('Dominoes')],
  );
  assert.equal(rows[0]?.name, "Domino's");
});

test('rating aggregates and upvote counters stay correct', () => {
  sql(`
    INSERT INTO feedback (entity_id, user_id, body, rating) VALUES (1, 1, 'great', 5), (1, 2, 'bad', 2), (1, 3, 'no rating', NULL);
    INSERT INTO feedback_votes (feedback_id, user_id) VALUES (1, 2), (1, 3);
  `);
  assert.equal(sql('SELECT avg_rating || \',\' || rating_count || \',\' || feedback_count FROM entities WHERE id = 1'), '3.50,2,3');
  assert.equal(sql('SELECT upvotes FROM feedback WHERE id = 1'), '2');

  // Same user voting twice is impossible, even if the API forgot to check.
  expectUniqueViolation('INSERT INTO feedback_votes (feedback_id, user_id) VALUES (1, 2)');

  sql('DELETE FROM feedback_votes WHERE feedback_id = 1 AND user_id = 3');
  assert.equal(sql('SELECT upvotes FROM feedback WHERE id = 1'), '1');

  // Hiding a post removes it from the averages.
  sql(`UPDATE feedback SET status = 'removed' WHERE id = 2`);
  assert.equal(sql('SELECT avg_rating || \',\' || rating_count FROM entities WHERE id = 1'), '5.00,1');
});

test('filters: category, city, rating, upvotes, text search', () => {
  sql(`
    INSERT INTO entities (category_id, name, name_key, slug, country_code, city, city_key)
      VALUES (2, 'Nexon', 'nexon', 'nexon', 'IN', NULL, NULL);
    INSERT INTO feedback (entity_id, user_id, body, rating) VALUES
      (2, 1, 'Mumbai branch pizza was soggy', 1),
      ((SELECT id FROM entities WHERE name_key = 'nexon'), 1, 'Clutch failed at 20000 km', 2);
  `);

  const names = (f: FeedbackFilters) => feed(f).rows.map((r) => r.body).sort();

  assert.deepEqual(names({ category: 'automobiles' }), ['Clutch failed at 20000 km']);
  assert.deepEqual(names({ city: 'mumbai' }), ['Mumbai branch pizza was soggy']);
  assert.deepEqual(names({ category: 'restaurants', minRating: 4 }), ['great']);
  assert.deepEqual(names({ minUpvotes: 1 }), ['great']);
  assert.deepEqual(names({ q: 'clutch' }), ['Clutch failed at 20000 km']);
  assert.deepEqual(names({ country: 'in', maxRating: 2 }), ['Clutch failed at 20000 km', 'Mumbai branch pizza was soggy']);
  // Removed posts never show up.
  assert.ok(!names({}).includes('bad'));
});

test('cursor pagination: no row skipped or repeated, even with identical timestamps', () => {
  // 25 posts in ONE transaction: now() is the same for all of them, so every
  // created_at ties. Only the id tie-breaker keeps the pages apart.
  sql(`INSERT INTO feedback (entity_id, user_id, body, rating, upvotes)
       SELECT e.id, 1, 'bulk ' || g, (g % 5) + 1, g % 3
       FROM generate_series(1, 25) g, entities e WHERE e.name_key = 'online only store'`);
  const entityId = Number(sql(`SELECT id FROM entities WHERE name_key = 'online only store'`));

  for (const sort of ['newest', 'top', 'rating'] as const) {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const { rows, limit } = feed({ entityId, sort, limit: 7, cursor });
      const page = rows.slice(0, limit);
      seen.push(...page.map((r) => String(r.id)));
      const last = page.at(-1);
      cursor = rows.length > limit && last ? encodeCursor(last.sort_value, last.id) : undefined;
      pages++;
    } while (cursor && pages < 10);

    assert.equal(seen.length, 25, `${sort}: saw ${seen.length}`);
    assert.equal(new Set(seen).size, 25, `${sort}: duplicates across pages`);
    assert.equal(pages, 4, `${sort}: pages`);
  }
});

test('the newest-first feed uses an index, not a full scan', () => {
  // Realistic volume + fresh statistics, so the planner chooses on its own.
  sql(`INSERT INTO feedback (entity_id, user_id, body, created_at)
       SELECT 1, 1, 'load ' || g, now() - g * interval '1 minute' FROM generate_series(1, 20000) g;
       ANALYZE;`);
  const { sql: text, params } = buildFeedbackQuery({ sort: 'newest', limit: 20 });
  const plan = sql(`EXPLAIN ${text} \\bind ${params.map((v) => `'${v}'`).join(' ')} \\g`);
  assert.match(plan, /feedback_new_idx/);
});

// ── Accounts (002_auth.sql) ─────────────────────────────────────────────

const addUser = (username: string, email: string, dob = '2000-01-01') =>
  `INSERT INTO users (display_name, full_name, username, email, date_of_birth, password_hash)
   VALUES ('${username}', 'Test', '${username}', '${email}', '${dob}', 'x')`;

test('usernames and emails are unique regardless of case', () => {
  sql(addUser('Tejas', 'Tejas@Example.com'));
  expectUniqueViolation(addUser('tejas', 'other@example.com'));
  expectUniqueViolation(addUser('someone', 'tejas@example.COM'));
});

test('existing users without account details are still allowed', () => {
  // Rows from before 002 have NULL username/email; the unique indexes and
  // CHECKs must not reject them (NULL passes a CHECK, and NULLs never clash
  // in a plain unique index).
  sql(`INSERT INTO users (display_name) VALUES ('legacy1'), ('legacy2')`);
});

test('database rejects bad usernames and future birth dates even if the API is bypassed', () => {
  assert.throws(() => sql(addUser('a b', 'ab@example.com')), /users_username_format/);
  assert.throws(() => sql(addUser('future', 'f@example.com', '2999-01-01')), /users_dob_past/);
});

test('sessions: deleting a user logs them out everywhere', () => {
  sql(addUser('leaver', 'leaver@example.com'));
  sql(`INSERT INTO sessions (token_hash, user_id, expires_at)
       SELECT sha256(convert_to(g::text, 'UTF8')), id, now() + interval '1 day'
       FROM users, generate_series(1, 3) g WHERE username = 'leaver'`);
  assert.equal(sql(`SELECT count(*) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username = 'leaver'`), '3');
  sql(`DELETE FROM users WHERE username = 'leaver'`);
  assert.equal(sql(`SELECT count(*) FROM sessions`), '0');
});

test('login lookup uses the case-insensitive index', () => {
  sql(`INSERT INTO users (display_name, username, email)
       SELECT 'u' || g, 'user' || g, 'user' || g || '@example.com' FROM generate_series(1, 20000) g;
       ANALYZE users;`);
  const plan = sql(`EXPLAIN SELECT id FROM users WHERE lower(username) = lower($1) \\bind 'USER123' \\g`);
  assert.match(plan, /users_username_uq/);
  const planEmail = sql(`EXPLAIN SELECT id FROM users WHERE lower(email) = lower($1) \\bind 'User123@Example.com' \\g`);
  assert.match(planEmail, /users_email_uq/);
});

// ── Login throttling (003_login_throttle.sql) ───────────────────────────

/** One login_attempt call; returns [allowed, retry_after_seconds]. */
const attempt = (key: string, max = 3, window = '15 minutes', lock = '15 minutes') =>
  sql(`SELECT allowed || ',' || retry_after_seconds FROM login_attempt('${key}', ${max}, '${window}', '${lock}')`);

test('throttle: allows max attempts, then locks with a wait time', () => {
  assert.equal(attempt('user:1'), 'true,0');
  assert.equal(attempt('user:1'), 'true,0');
  assert.equal(attempt('user:1'), 'true,0');
  assert.equal(attempt('user:1'), 'false,900');           // 4th of max 3: locked 15 min
  const [allowed, wait] = attempt('user:1').split(',');   // still locked, wait counts down
  assert.equal(allowed, 'false');
  assert.ok(Number(wait) > 0 && Number(wait) <= 900);
  assert.equal(attempt('user:2'), 'true,0');               // other keys unaffected
});

test('throttle: lock expires and the count starts again', () => {
  for (let i = 0; i < 3; i++) attempt('user:3', 3, '15 minutes', '1 second');
  assert.equal(attempt('user:3', 3, '15 minutes', '1 second'), 'false,1');
  sql('SELECT pg_sleep(1.1)');
  assert.equal(attempt('user:3', 3, '15 minutes', '1 second'), 'true,0');
  assert.equal(sql(`SELECT attempts FROM login_throttle WHERE key = 'user:3'`), '1');
});

test('throttle: attempts outside the window are forgotten', () => {
  attempt('user:4', 3, '1 second');
  attempt('user:4', 3, '1 second');
  sql('SELECT pg_sleep(1.1)');
  assert.equal(attempt('user:4', 3, '1 second'), 'true,0');
  assert.equal(sql(`SELECT attempts FROM login_throttle WHERE key = 'user:4'`), '1');
});

test('throttle: success clears the account but only gives back one IP attempt', () => {
  attempt('user:5'); attempt('user:5');
  attempt('ip:198.51.100.1'); attempt('ip:198.51.100.1');
  sql(`SELECT login_attempt_succeeded('user:5', 'ip:198.51.100.1')`);
  assert.equal(sql(`SELECT count(*) FROM login_throttle WHERE key = 'user:5'`), '0');
  assert.equal(sql(`SELECT attempts FROM login_throttle WHERE key = 'ip:198.51.100.1'`), '1');
});

test('throttle: success does not unlock a locked IP', () => {
  for (let i = 0; i < 4; i++) attempt('ip:198.51.100.2');   // now locked
  sql(`SELECT login_attempt_succeeded('user:6', 'ip:198.51.100.2')`);
  assert.equal(attempt('ip:198.51.100.2').split(',')[0], 'false');
});

test('throttle: 20 simultaneous attempts against a limit of 5 allow exactly 5', async () => {
  // Without the row lock, all 20 would read "0 attempts so far" at once and
  // all be allowed. This is the race a check-then-record design loses.
  const run = promisify(execFile);
  const results = await Promise.all(Array.from({ length: 20 }, () =>
    run('psql', [url, '-X', '-q', '-At', '-c',
      `SELECT allowed FROM login_attempt('user:race', 5, '15 minutes', '15 minutes')`]),
  ));
  const allowed = results.filter((r) => r.stdout.trim() === 't').length;
  assert.equal(allowed, 5);
});

// ── Email verification and password reset (004_email_tokens.sql) ───────
// These run the exact statements the services use (src/auth/email-token-sql.ts).

const hex = (token: string) => '\\x' + hashSessionToken(token).toString('hex');

/**
 * Runs an INSERT/UPDATE/DELETE with bound params and returns its RETURNING
 * rows (or one {ok:1} row per affected row if it has no RETURNING clause).
 * Data-modifying statements may only sit in a top-level WITH, not in a
 * subquery, hence the shape.
 */
function mutate(statement: string, params: unknown[]): any[] {
  const s = /\bRETURNING\b/i.test(statement) ? statement : `${statement}\nRETURNING 1 AS ok`;
  // psql reads backslash escapes inside quoted \bind arguments, so double them.
  const quote = (v: unknown) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  return JSON.parse(sql(`WITH m AS (${s}\n) SELECT coalesce(json_agg(m), '[]') FROM m \\bind ${params.map(quote).join(' ')} \\g`));
}
const run = mutate;
const consume = (token: string, purpose = 'verify_email') => mutate(TOKEN_SQL.consume, [hex(token), purpose]);
const issue = (userId: number, email: string, token: string, purpose = 'verify_email', ttl = '1 hour') => {
  mutate(TOKEN_SQL.retireUnused, [userId, purpose]);
  mutate(TOKEN_SQL.insert, [hex(token), userId, purpose, email, ttl]);
};

let mailUserId: number;
before(() => {
  mailUserId = Number(sql(`INSERT INTO users (display_name, username, email, password_hash)
                           VALUES ('m', 'mailuser', 'Mail.User@example.com', 'old') RETURNING id`).split('\n')[0]);
});

test('email token: works once, then never again', () => {
  issue(mailUserId, 'Mail.User@example.com', 'token-once');
  assert.deepEqual(consume('token-once'), [{ user_id: mailUserId, email: 'Mail.User@example.com' }]);
  assert.deepEqual(consume('token-once'), []);
});

test('email token: wrong purpose, unknown, or expired tokens do nothing', () => {
  issue(mailUserId, 'Mail.User@example.com', 'token-purpose');
  assert.deepEqual(consume('token-purpose', 'reset_password'), []);   // a verify link can't reset a password
  assert.deepEqual(consume('never-issued'), []);
  issue(mailUserId, 'Mail.User@example.com', 'token-expired', 'reset_password', '1 second');
  sql('SELECT pg_sleep(1.1)');
  assert.deepEqual(consume('token-expired', 'reset_password'), []);
});

test('email token: requesting a new email retires the old link', () => {
  issue(mailUserId, 'Mail.User@example.com', 'token-old', 'reset_password');
  issue(mailUserId, 'Mail.User@example.com', 'token-new', 'reset_password');
  assert.deepEqual(consume('token-old', 'reset_password'), []);
  assert.equal(consume('token-new', 'reset_password').length, 1);
});

test('email token: 20 simultaneous clicks on one link succeed exactly once', async () => {
  issue(mailUserId, 'Mail.User@example.com', 'token-race', 'reset_password');
  const runAsync = promisify(execFile);
  const statement = TOKEN_SQL.consume.replace('$1', `'${hex('token-race')}'::bytea`).replace('$2', `'reset_password'`);
  const results = await Promise.all(Array.from({ length: 20 }, () =>
    runAsync('psql', [url, '-X', '-q', '-At', '-c', statement])));
  assert.equal(results.filter((r) => r.stdout.trim() !== '').length, 1);
});

test('verification only counts for the address the link was sent to', () => {
  // Matching is case-insensitive...
  assert.equal(run(TOKEN_SQL.markVerified, [mailUserId, 'mail.user@EXAMPLE.com']).length, 1);
  sql(`UPDATE users SET email_verified_at = NULL WHERE id = ${mailUserId}`);
  // ...but an old link for a previous address verifies nothing.
  assert.equal(run(TOKEN_SQL.markVerified, [mailUserId, 'old.address@example.com']).length, 0);
  assert.equal(sql(`SELECT email_verified_at IS NULL FROM users WHERE id = ${mailUserId}`), 't');
});

test('password reset: new hash, address verified, every session ended', () => {
  sql(`INSERT INTO sessions (token_hash, user_id, expires_at)
       SELECT sha256(convert_to('s' || g, 'UTF8')), ${mailUserId}, now() + interval '1 day' FROM generate_series(1, 2) g`);
  run(TOKEN_SQL.setPassword, [mailUserId, 'new-hash', 'MAIL.USER@example.com']);
  run(TOKEN_SQL.deleteSessions, [mailUserId]);
  assert.equal(sql(`SELECT password_hash || ',' || (email_verified_at IS NOT NULL) FROM users WHERE id = ${mailUserId}`), 'new-hash,true');
  assert.equal(sql(`SELECT count(*) FROM sessions WHERE user_id = ${mailUserId}`), '0');
});
