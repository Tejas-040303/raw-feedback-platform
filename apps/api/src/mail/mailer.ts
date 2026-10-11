export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Anything that can deliver an email. Swap LogMailer for a real provider
 * (SMTP, Amazon SES, Resend, Postmark, ...) by implementing this interface
 * and returning it from createMailer().
 */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Development only: prints emails to the console instead of sending them,
 * so you can click the links locally.
 */
export class LogMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.log(`\n── email to ${mail.to} ──\nSubject: ${mail.subject}\n\n${mail.text}\n──────────\n`);
  }
}

export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  // Refuse to start rather than print reset links to production logs:
  // anyone who can read the logs could then take over any account.
  if (env.NODE_ENV === 'production') {
    throw new Error('No email provider configured. Implement Mailer in src/mail/mailer.ts before deploying.');
  }
  return new LogMailer();
}
