/**
 * Database commands that work the same in cmd.exe, PowerShell and bash:
 *
 *   npm run db:migrate    apply new files in db/migrations
 *   npm run db:seed       load db/seed.sql (development data)
 *
 * DATABASE_URL comes from the environment or the repo's .env file
 * (loaded by --env-file-if-exists in package.json).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from './migrator.ts';

// fileURLToPath, not URL.pathname: on Windows the latter gives "/C:/...".
const dbDir = fileURLToPath(new URL('../../../db/', import.meta.url));
const command = process.argv[2];

if (command !== 'migrate' && command !== 'seed') {
  console.error('usage: db.ts migrate|seed');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env in the repo root, or set it in your shell.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  if (command === 'migrate') {
    await migrate(client, `${dbDir}migrations`);
  } else {
    await client.query('BEGIN');
    await client.query(readFileSync(`${dbDir}seed.sql`, 'utf8'));
    await client.query('COMMIT');
    console.log('seed data loaded');
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
