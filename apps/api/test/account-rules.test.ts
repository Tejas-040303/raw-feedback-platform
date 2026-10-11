import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakePassword } from './fake-password.ts';
import { ageOn, isEmail, passwordProblems, validateSignup, type SignupInput } from '../src/auth/account-rules.ts';

test('password: valid examples', () => {
  for (const pw of [fakePassword('A', 'bcdef', '1', '!'), fakePassword('T', 'r', '0', 'ub', '4', 'dor', '&', '3'), fakePassword('Z', 'z', '9', '#', 'zzzzzzzzzz') /* exactly 14 */]) {
    assert.deepEqual(passwordProblems(pw), [], pw);
  }
});

test('password: each rule is enforced on its own', () => {
  assert.deepEqual(passwordProblems(fakePassword('A', 'bc', '1', '!')), ['8–14 characters']);
  assert.deepEqual(passwordProblems(fakePassword('A', 'bcdefgh', '1', '!', 'xyz', '12')), ['8–14 characters']);  // 15
  assert.deepEqual(passwordProblems(fakePassword('A'.repeat(7), '1', '!')), ['a lower-case letter']);
  assert.deepEqual(passwordProblems(fakePassword('a'.repeat(7), '1', '!')), ['an upper-case letter']);
  assert.deepEqual(passwordProblems(fakePassword('A', 'bcdefgh', '!')), ['a number']);
  assert.deepEqual(passwordProblems(fakePassword('A', 'bcdefgh', '1')), ['a special character (e.g. ! @ # $ %)']);
});

test('password: a space is not a special character', () => {
  assert.ok(passwordProblems(fakePassword('A', 'bcdefg', ' ', '1')).includes('a special character (e.g. ! @ # $ %)'));
});

test('password: length counts characters, not UTF-16 units', () => {
  // 7 ASCII + one emoji = 8 characters, but 9 UTF-16 code units.
  assert.deepEqual(passwordProblems(fakePassword('A', 'bc', '1', '!', 'xy', '🙂')), []);
});

const PASSWORD = fakePassword('A', 'bcdef', '1', '!');
const valid: SignupInput = {
  name: 'Tejas Pawar', dateOfBirth: '2000-05-17', email: 'tejas@example.com',
  username: 'tejas_p', password: PASSWORD, confirmPassword: PASSWORD,
};
const today = new Date(Date.UTC(2026, 9, 11)); // 2026-10-11

test('signup: a valid form has no errors', () => {
  assert.deepEqual(validateSignup(valid, today), {});
});

test('signup: every field is checked', () => {
  const errors = validateSignup({
    name: '  ', dateOfBirth: '2030-01-01', email: 'not-an-email', username: 'a b',
    password: 'short', confirmPassword: 'different',
  }, today);
  assert.deepEqual(Object.keys(errors).sort(),
    ['confirmPassword', 'dateOfBirth', 'email', 'name', 'password', 'username']);
});

test('signup: confirm password must match exactly', () => {
  assert.ok(validateSignup({ ...valid, confirmPassword: fakePassword('a', 'bcdef', '1', '!') }, today).confirmPassword);
});

test('date of birth: age is exact around the birthday', () => {
  assert.equal(ageOn('2013-10-11', today), 13);   // 13th birthday today
  assert.equal(ageOn('2013-10-12', today), 12);   // tomorrow
  assert.equal(validateSignup({ ...valid, dateOfBirth: '2013-10-12' }, today).dateOfBirth, 'You must be at least 13 to sign up.');
  assert.equal(validateSignup({ ...valid, dateOfBirth: '2013-10-11' }, today).dateOfBirth, undefined);
});

test('date of birth: impossible dates are rejected, leap days accepted', () => {
  assert.equal(ageOn('2001-02-30', today), null);
  assert.equal(ageOn('2001-02-29', today), null);   // 2001 is not a leap year
  assert.equal(ageOn('2000-02-29', today), 26);     // 2000 is
  assert.equal(ageOn('17/05/2000', today), null);
});

test('login identifier: email vs username', () => {
  assert.equal(isEmail('a@b.com'), true);
  assert.equal(isEmail('tejas_p'), false);
});

test('the web copy of account-rules.ts is identical to the API copy', () => {
  const api = readFileSync(new URL('../src/auth/account-rules.ts', import.meta.url), 'utf8');
  const web = readFileSync(new URL('../../web/app/account-rules.ts', import.meta.url), 'utf8');
  assert.equal(web, api, 'copy apps/api/src/auth/account-rules.ts to apps/web/app/');
});
