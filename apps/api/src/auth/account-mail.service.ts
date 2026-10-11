import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import { MAILER } from '../mail/mail.module.ts';
import type { Mail, Mailer } from '../mail/mailer.ts';
import { emailLink, passwordResetMail, verificationMail } from '../mail/templates.ts';
import { EmailTokenService } from './email-token.service.ts';

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

/** Sends the account emails: "confirm your address" and "reset your password". */
@Injectable()
export class AccountMailService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tokens: EmailTokenService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async sendVerification(user: { id: number; email: string; full_name: string }): Promise<void> {
    const token = await this.tokens.issue(user.id, user.email, 'verify_email');
    this.sendInBackground(verificationMail(user.email, user.full_name, emailLink(WEB_ORIGIN, '/verify-email', token)));
  }

  async sendResetIfAccountExists(email: string): Promise<void> {
    const { rows } = await this.db.query<{ id: number; email: string; full_name: string }>(
      `SELECT id::int AS id, email, full_name FROM users
       WHERE lower(email) = lower($1) AND password_hash IS NOT NULL`,
      [email],
    );
    const user = rows[0];
    if (!user) return;
    const token = await this.tokens.issue(user.id, user.email, 'reset_password');
    await this.mailer.send(passwordResetMail(user.email, user.full_name, emailLink(WEB_ORIGIN, '/reset-password', token)));
  }

  /**
   * Sending mail is slow and can fail; the user shouldn't wait for it or get
   * an error page because the mail server hiccuped. A job queue with retries
   * (BullMQ, on the roadmap) is the proper home for this.
   */
  private sendInBackground(mail: Mail): void {
    void this.mailer.send(mail).catch((err) => console.error(`mail to ${mail.to} failed`, err));
  }
}
