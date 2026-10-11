import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate, migrationFiles, type SqlClient } from '../scripts/migrator.ts';

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rfp-migrations-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

/** Records every statement; answers the "already applied" query from `applied`. */
function fakeClient(applied: string[], failOn?: string) {
  const log: string[] = [];
  const client: SqlClient = {
    async query(text, params) {
      log.push(params ? `${text} ${JSON.stringify(params)}` : text);
      if (text.startsWith('SELECT name FROM schema_migrations')) return { rows: applied.map((name) => ({ name })) };
      if (failOn && text === failOn) throw new Error('syntax error');
      return { rows: [] };
    },
  };
  return { client, log };
}

test('applies only new files, in name order, each in its own transaction', async () => {
  const dir = fixture({ '002_b.sql': 'B;', '001_a.sql': 'A;', '010_c.sql': 'C;', 'notes.txt': 'x' });
  try {
    assert.deepEqual(migrationFiles(dir), ['001_a.sql', '002_b.sql', '010_c.sql']);
    const { client, log } = fakeClient(['001_a.sql']);
    const applied = await migrate(client, dir, () => {});
    assert.deepEqual(applied, ['002_b.sql', '010_c.sql']);

    const work = log.filter((l) => !l.includes('pg_advisory') && !l.startsWith('CREATE TABLE'));
    assert.deepEqual(work, [
      'SELECT name FROM schema_migrations',
      'BEGIN', 'B;', 'INSERT INTO schema_migrations (name) VALUES ($1) ["002_b.sql"]', 'COMMIT',
      'BEGIN', 'C;', 'INSERT INTO schema_migrations (name) VALUES ($1) ["010_c.sql"]', 'COMMIT',
    ]);
    assert.match(log[0], /pg_advisory_lock/);
    assert.match(log.at(-1)!, /pg_advisory_unlock/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('a failing file is rolled back, stops the run, and still releases the lock', async () => {
  const dir = fixture({ '001_a.sql': 'A;', '002_bad.sql': 'BAD;', '003_c.sql': 'C;' });
  try {
    const { client, log } = fakeClient([], 'BAD;');
    await assert.rejects(migrate(client, dir, () => {}), /migration 002_bad\.sql failed: syntax error/);
    assert.ok(!log.includes('C;'), 'later files must not run');
    assert.deepEqual(log.slice(log.indexOf('BAD;'), log.indexOf('BAD;') + 2), ['BAD;', 'ROLLBACK']);
    assert.match(log.at(-1)!, /pg_advisory_unlock/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('nothing to do when every file is applied', async () => {
  const dir = fixture({ '001_a.sql': 'A;' });
  try {
    const { client, log } = fakeClient(['001_a.sql']);
    assert.deepEqual(await migrate(client, dir, () => {}), []);
    assert.ok(!log.includes('BEGIN'));
  } finally {
    rmSync(dir, { recursive: true });
  }
});
