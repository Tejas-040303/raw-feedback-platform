/**
 * Applies db/migrations/*.sql in name order, each exactly once.
 *
 * Plain Node + the pg driver, so it behaves the same on Windows, macOS and
 * Linux and needs no psql or shell on the machine.
 *
 * - schema_migrations records which files have been applied, so running it
 *   again only applies new files (e.g. after pulling 003 and 004).
 * - Each file runs in its own transaction together with its bookkeeping
 *   row: a failing migration leaves no half-applied schema behind and is
 *   retried next time.
 * - An advisory lock stops two runners (two deploys, two terminals) from
 *   applying the same file at once.
 *
 * Convention: never edit a migration that has been applied anywhere; add a
 * new file instead. (A file that needs to run outside a transaction, such as
 * CREATE INDEX CONCURRENTLY, would need an opt-out; none does yet.)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The subset of pg.Client this needs, so tests can pass a fake. */
export interface SqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

// Any fixed 64-bit number works; it only has to be the same for every runner.
const LOCK_ID = 7_301_552_017;

export function migrationFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

export async function migrate(
  client: SqlClient,
  dir: string,
  log: (msg: string) => void = console.log,
): Promise<string[]> {
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const pending = migrationFiles(dir).filter((f) => !applied.has(f));

    for (const file of pending) {
      log(`applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
    }
    log(pending.length ? `applied ${pending.length} migration(s)` : 'database is up to date');
    return pending;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
  }
}
