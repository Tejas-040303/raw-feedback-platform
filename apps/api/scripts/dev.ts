/**
 * `npm run dev`: compile once, then keep tsc and the server both watching.
 *
 * This used to be `tsc --watch & node --watch dist/main.js`, which only works
 * in a POSIX shell; cmd.exe has no `&` background operator, so it would run
 * tsc forever and never start the server. Spawning both from Node works
 * everywhere.
 *
 * Children are started as `node <script>` (process.execPath) rather than
 * through `tsc`/`tsc.cmd` shims, which on Windows would need shell: true.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const node = process.execPath;

const first = spawnSync(node, [tsc, '-p', 'tsconfig.json'], { stdio: 'inherit' });
if (first.status !== 0) process.exit(first.status ?? 1);

const children: ChildProcess[] = [
  spawn(node, [tsc, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { stdio: 'inherit' }),
  spawn(node, ['--env-file-if-exists=../../.env', '--watch', 'dist/main.js'], { stdio: 'inherit' }),
];

// If either one stops, stop the other too rather than leave it orphaned.
let stopping = false;
function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) child.on('exit', (code) => stopAll(code ?? 0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
