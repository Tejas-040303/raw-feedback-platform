import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer, LogMailer } from '../src/mail/mailer.ts';
import { emailLink, passwordResetMail, verificationMail } from '../src/mail/templates.ts';

test('email links carry the token as a properly encoded query parameter', () => {
  const link = emailLink('https://rawfeedback.example', '/reset-password', 'ab-c_d+/=');
  const url = new URL(link);
  assert.equal(url.origin, 'https://rawfeedback.example');
  assert.equal(url.pathname, '/reset-password');
  assert.equal(url.searchParams.get('token'), 'ab-c_d+/=');
});

test('emails contain the link and say when it expires', () => {
  const v = verificationMail('a@example.com', 'Asha', 'https://x/verify-email?token=t');
  assert.equal(v.to, 'a@example.com');
  assert.ok(v.text.includes('https://x/verify-email?token=t'));
  assert.match(v.text, /24 hours/);

  const r = passwordResetMail('a@example.com', 'Asha', 'https://x/reset-password?token=t');
  assert.ok(r.text.includes('https://x/reset-password?token=t'));
  assert.match(r.text, /30 minutes/);
  assert.match(r.text, /didn’t ask for this/);
});

test('the console mailer is refused in production', () => {
  assert.ok(createMailer({ NODE_ENV: 'development' }) instanceof LogMailer);
  assert.throws(() => createMailer({ NODE_ENV: 'production' }), /No email provider configured/);
});
