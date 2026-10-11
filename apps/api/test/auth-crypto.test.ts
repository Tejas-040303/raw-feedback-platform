import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakePassword } from './fake-password.ts';
import { hashPassword, verifyPassword } from '../src/auth/password-hash.ts';
import { hashSessionToken, newSessionToken, readCookie, sessionCookie } from '../src/auth/session-token.ts';

const PASSWORD = fakePassword('A', 'bcdef', '1', '!');
const WRONG_CASE = fakePassword('a', 'bcdef', '1', '!');

test('password hash: verifies the right password only', async () => {
  const stored = await hashPassword(PASSWORD);
  assert.match(stored, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword(PASSWORD, stored), true);
  assert.equal(await verifyPassword(WRONG_CASE, stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('password hash: same password, different salt, different hash', async () => {
  assert.notEqual(await hashPassword(PASSWORD), await hashPassword(PASSWORD));
});

test('password hash: garbage stored value fails closed', async () => {
  assert.equal(await verifyPassword('x', 'not-a-hash'), false);
});

test('session token: random, and only its hash is stored', () => {
  const a = newSessionToken();
  assert.notEqual(a, newSessionToken());
  assert.equal(hashSessionToken(a).length, 32);
  assert.deepEqual(hashSessionToken(a), hashSessionToken(a));
});

test('cookies: read and write', () => {
  assert.equal(readCookie('a=1; rfp_session=abc%3D; b=2', 'rfp_session'), 'abc=');
  assert.equal(readCookie('rfp_session_old=x', 'rfp_session'), undefined);
  assert.equal(readCookie(undefined, 'rfp_session'), undefined);

  const dev = sessionCookie('tok', 60, false);
  assert.match(dev, /HttpOnly/);
  assert.match(dev, /SameSite=Lax/);
  assert.doesNotMatch(dev, /Secure/);
  assert.match(sessionCookie('tok', 60, true), /; Secure$/);
});
