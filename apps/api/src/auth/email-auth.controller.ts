import {
  BadRequestException, Body, Controller, Headers, HttpCode, HttpException, HttpStatus, Post, Req, Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../common/validation.ts';
import { DatabaseService } from '../database/database.service.ts';
import { passwordProblems } from './account-rules.ts';
import { AccountMailService } from './account-mail.service.ts';
import { AuthService } from './auth.service.ts';
import { SQL } from './email-token-sql.ts';
import { EmailTokenService } from './email-token.service.ts';
import { accountKey, ipKey, MAIL_PER_IP, MAIL_PER_RECIPIENT, type RateLimit } from './login-throttle.ts';
import { LoginThrottleService } from './login-throttle.service.ts';
import { hashPassword } from './password-hash.ts';

// 256-bit tokens can't be guessed, so token endpoints need no rate limit;
// this length check just rejects junk early.
const Token = z.string().min(20).max(100);

const VerifyBody = z.object({ token: Token });
const ForgotBody = z.object({ email: z.string().trim().min(3).max(254) });
const ResetBody = z.object({ token: Token, password: z.string().max(200), confirmPassword: z.string().max(200) });

@Controller('auth')
export class EmailAuthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
    private readonly tokens: EmailTokenService,
    private readonly throttle: LoginThrottleService,
    private readonly mail: AccountMailService,
  ) {}

  /** POST /auth/verify-email { token } — the user clicked the link in their email. */
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: unknown) {
    const { token } = parse(VerifyBody, body);
    const used = await this.tokens.consume(token, 'verify_email');
    if (!used) throw invalidLink();

    // Only verify if the account still has the address the link was sent to.
    const { rowCount } = await this.db.query(SQL.markVerified, [used.userId, used.email]);
    if (!rowCount) throw invalidLink();
    return { verified: true };
  }

  /** POST /auth/resend-verification — logged-in user didn't get (or lost) the email. */
  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@Headers('cookie') cookie: string | undefined, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.requireUser(cookie);
    if (user.email_verified) return { sent: false, alreadyVerified: true };
    if (!user.email) throw new BadRequestException({ code: 'NO_EMAIL' });

    await this.rateLimit(res, `mail:verify:user:${user.id}`, MAIL_PER_RECIPIENT);
    await this.mail.sendVerification({ id: user.id, email: user.email, full_name: user.full_name });
    return { sent: true };
  }

  /**
   * POST /auth/forgot-password { email }
   *
   * Always answers 202 with the same body, whether or not the address has
   * an account, and does the lookup and sending after responding. Otherwise
   * the reply, or how long it took, would reveal which emails are
   * registered.
   */
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email } = parse(ForgotBody, body);
    // Per IP: stops one client spamming many addresses. Per address: stops
    // anyone flooding one person's inbox. Both apply whether or not the
    // address has an account, so a 429 reveals nothing either.
    await this.rateLimit(res, `mail:reset:${ipKey(req.ip)}`, MAIL_PER_IP);
    await this.rateLimit(res, `mail:reset:email:${email.toLowerCase()}`, MAIL_PER_RECIPIENT);

    void this.mail.sendResetIfAccountExists(email).catch((err) => console.error('password reset mail failed', err));
    return { message: 'If an account uses that email, we’ve sent a link to reset the password.' };
  }

  /**
   * POST /auth/reset-password { token, password, confirmPassword }
   *
   * Everything happens in one transaction: if any step fails, the token is
   * not used up and the old password still works.
   */
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: unknown) {
    const input = parse(ResetBody, body);
    // Check the new password BEFORE using up the token, so a typo doesn't
    // force the user to request another email.
    const problems = passwordProblems(input.password);
    if (problems.length) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', errors: { password: `Password needs ${problems.join(', ')}.` } });
    }
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', errors: { confirmPassword: 'Passwords don’t match.' } });
    }
    const newHash = await hashPassword(input.password);

    await this.db.transaction(async (tx) => {
      const used = await this.tokens.consume(input.token, 'reset_password', tx);
      if (!used) throw invalidLink();

      await tx.query(SQL.setPassword, [used.userId, newHash, used.email]);
      // Log out every device. If someone else had got in, this is how the
      // owner gets them out.
      await tx.query(SQL.deleteSessions, [used.userId]);
      // Any other reset links still in their inbox stop working.
      await tx.query(SQL.retireUnused, [used.userId, 'reset_password']);
      // Unlock the account if failed guesses had locked it.
      await tx.query('DELETE FROM login_throttle WHERE key = $1', [accountKey(used.userId, '')]);
    });

    return { reset: true };
  }

  private async rateLimit(res: Response, key: string, limit: RateLimit): Promise<void> {
    const wait = await this.throttle.limit(key, limit);
    if (wait > 0) {
      res.setHeader('Retry-After', String(wait));
      throw new HttpException(
        { code: 'TOO_MANY_REQUESTS', message: 'Too many emails requested. Please try again later.', retryAfterSeconds: wait },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

function invalidLink() {
  return new BadRequestException({
    code: 'INVALID_OR_EXPIRED_LINK',
    message: 'This link is invalid, has expired, or has already been used. Please request a new one.',
  });
}
