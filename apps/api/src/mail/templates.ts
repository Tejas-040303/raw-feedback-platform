import type { Mail } from './mailer.ts';

/**
 * Builds the link the user clicks. The page that opens removes the token
 * from the address bar straight away, and sends it to the API only in a
 * POST body when the user clicks a button (see apps/web/app/verify-email).
 */
export function emailLink(webOrigin: string, path: '/verify-email' | '/reset-password', token: string): string {
  const url = new URL(path, webOrigin);
  url.searchParams.set('token', token);
  return url.toString();
}

export function verificationMail(to: string, name: string, link: string): Mail {
  return {
    to,
    subject: 'Confirm your email address',
    text: [
      `Hi ${name},`,
      '',
      'Please confirm your email address for Raw Feedback by opening this link:',
      link,
      '',
      'The link works once and expires in 24 hours.',
      'If you didn’t create an account, you can ignore this email.',
    ].join('\n'),
  };
}

export function passwordResetMail(to: string, name: string, link: string): Mail {
  return {
    to,
    subject: 'Reset your password',
    text: [
      `Hi ${name},`,
      '',
      'Someone asked to reset the password for your Raw Feedback account.',
      'If it was you, open this link to choose a new password:',
      link,
      '',
      'The link works once and expires in 30 minutes.',
      'If you didn’t ask for this, ignore this email — your password stays the same.',
    ].join('\n'),
  };
}
