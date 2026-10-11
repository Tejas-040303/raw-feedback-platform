/**
 * Sign-up and login validation rules, shared by the API and the web pages.
 *
 * apps/web/app/account-rules.ts is a byte-for-byte copy so the signup page
 * can check fields as the user types. test/account-rules.test.ts fails if
 * the copies drift apart. The API check is the one that counts: anything in
 * the browser can be bypassed, so the browser check is only a convenience.
 *
 * No imports: this file must run unchanged in Node, the browser and tests.
 */

// ── Password: 8–14 characters, lower, upper, number, special ────────────

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 14;

export interface PasswordRule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
}

// Counted in code points, so an emoji is 1 character, not 2.
const charCount = (s: string) => [...s].length;

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: `${PASSWORD_MIN}–${PASSWORD_MAX} characters`, test: (pw) => charCount(pw) >= PASSWORD_MIN && charCount(pw) <= PASSWORD_MAX },
  { id: 'lower', label: 'a lower-case letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'upper', label: 'an upper-case letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'number', label: 'a number', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'a special character (e.g. ! @ # $ %)', test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
];

/** Labels of the rules the password breaks; empty means valid. */
export function passwordProblems(pw: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
}

// ── Sign-up ─────────────────────────────────────────────────────────────

export const MIN_AGE = 13;
const USERNAME_RE = /^[A-Za-z0-9_.]{3,30}$/;
// Deliberately loose: the only real proof an email works is a confirmation
// mail. This just catches typos like a missing @ or domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignupInput {
  name: string;
  dateOfBirth: string;      // YYYY-MM-DD
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export type SignupErrors = Partial<Record<keyof SignupInput, string>>;

/** Age in whole years on `today`, or null if the date is invalid. */
export function ageOn(dateOfBirth: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dob = new Date(Date.UTC(y, mo - 1, d));
  // Rejects dates like 2001-02-30, which Date would roll over to March 2.
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== mo - 1 || dob.getUTCDate() !== d) return null;
  let age = today.getUTCFullYear() - y;
  const beforeBirthday =
    today.getUTCMonth() < mo - 1 || (today.getUTCMonth() === mo - 1 && today.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}

export function validateSignup(input: SignupInput, today = new Date()): SignupErrors {
  const errors: SignupErrors = {};

  const name = input.name.trim();
  if (name.length < 1) errors.name = 'Enter your name.';
  else if (charCount(name) > 100) errors.name = 'Name must be at most 100 characters.';

  const age = ageOn(input.dateOfBirth, today);
  if (age === null) errors.dateOfBirth = 'Enter a valid date of birth.';
  else if (age < 0) errors.dateOfBirth = 'Date of birth can’t be in the future.';
  else if (age < MIN_AGE) errors.dateOfBirth = `You must be at least ${MIN_AGE} to sign up.`;
  else if (age > 120) errors.dateOfBirth = 'Enter a valid date of birth.';

  if (!EMAIL_RE.test(input.email.trim())) errors.email = 'Enter a valid email address.';

  if (!USERNAME_RE.test(input.username)) {
    errors.username = 'Username must be 3–30 characters: letters, numbers, _ and . only.';
  }

  const problems = passwordProblems(input.password);
  if (problems.length) errors.password = `Password needs ${problems.join(', ')}.`;

  if (input.confirmPassword !== input.password) errors.confirmPassword = 'Passwords don’t match.';

  return errors;
}

/** Login accepts a username or an email in the same box. */
export function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}
