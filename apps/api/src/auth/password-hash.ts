import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt from Node's standard library: a slow,
 * memory-hard hash, so a leaked database can't be brute-forced quickly.
 *
 * Stored format:  scrypt$N$r$p$<salt base64>$<hash base64>
 * The parameters are stored with each hash, so they can be raised later
 * without breaking existing passwords.
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LEN = 32;
// N=2^15, r=8 needs 32 MiB, exactly Node's default maxmem, so raise it.
const MAXMEM = 64 * 1024 * 1024;
// Unicode normalisation, so the same password typed on different keyboards
// (precomposed "é" vs "e" + accent) hashes the same.
const UNICODE_FORM = 'NFKC';

function scryptAsync(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize(UNICODE_FORM), salt, KEY_LEN, { ...opts, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key)),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) });
  // Constant-time comparison: a normal === stops at the first different
  // byte, and that timing difference can leak information.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// A real hash of a random password. Login runs verifyPassword against it
// when the username doesn't exist, so "no such user" takes as long as
// "wrong password" and response times don't reveal which accounts exist.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
