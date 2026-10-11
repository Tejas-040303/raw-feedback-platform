import {
  BadRequestException, Body, ConflictException, Controller, Get, Headers, HttpCode, Post, Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { parse } from '../common/validation.ts';
import { DatabaseService, UNIQUE_VIOLATION } from '../database/database.service.ts';
import { isEmail, validateSignup } from './account-rules.ts';
import { AuthService } from './auth.service.ts';
import { getDummyHash, hashPassword, verifyPassword } from './password-hash.ts';
import { sessionCookie, SESSION_TTL_DAYS } from './session-token.ts';

// Shape only; the real rules live in account-rules.ts (shared with the web).
const SignupBody = z.object({
  name: z.string(),
  dateOfBirth: z.string(),
  email: z.string(),
  username: z.string(),
  password: z.string(),
  confirmPassword: z.string(),
});

const LoginBody = z.object({
  identifier: z.string().trim().min(1).max(254),   // username or email
  // Upper bound only to stop someone making us hash a 10 MB string.
  // No complexity rules at login: an old account may predate them.
  password: z.string().min(1).max(200),
});

const SECURE_COOKIES = process.env.NODE_ENV === 'production';
const TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
const INVALID_LOGIN = 'Invalid username/email or password.';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parse(SignupBody, body);
    const errors = validateSignup(input);
    if (Object.keys(errors).length) throw new BadRequestException({ code: 'VALIDATION_FAILED', errors });

    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      const { rows } = await this.db.query<{ id: number; username: string; full_name: string }>(
        `INSERT INTO users (display_name, full_name, username, email, date_of_birth, password_hash)
         VALUES ($1, $2, $1, $3, $4, $5)
         RETURNING id::int AS id, username, full_name`,
        [input.username, input.name.trim(), input.email.trim(), input.dateOfBirth, passwordHash],
      );
      user = rows[0];
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code !== UNIQUE_VIOLATION) throw err;
      // Saying "email already registered" tells anyone whether an address
      // has an account. Accepted here for usability; the stricter option is
      // to always reply "check your inbox" and send the mail either way.
      const errors = e.constraint === 'users_email_uq'
        ? { email: 'An account with this email already exists.' }
        : { username: 'This username is taken.' };
      throw new ConflictException({ code: 'ALREADY_EXISTS', errors });
    }

    res.setHeader('Set-Cookie', sessionCookie(await this.auth.createSession(user.id), TTL_SECONDS, SECURE_COOKIES));
    res.status(201);
    return { user };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { identifier, password } = parse(LoginBody, body);
    const column = isEmail(identifier) ? 'email' : 'username';
    const { rows } = await this.db.query<{ id: number; username: string; full_name: string; password_hash: string | null }>(
      `SELECT id::int AS id, username, full_name, password_hash
       FROM users WHERE lower(${column}) = lower($1)`,
      [identifier],
    );
    const user = rows[0];

    // Always run one scrypt verification, real or dummy, so a missing
    // account takes as long as a wrong password. Same message either way.
    const ok = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !user.password_hash || !ok) throw new UnauthorizedException({ code: 'INVALID_LOGIN', message: INVALID_LOGIN });

    // A brand-new token on every login. Reusing a token from before login
    // would allow session fixation.
    res.setHeader('Set-Cookie', sessionCookie(await this.auth.createSession(user.id), TTL_SECONDS, SECURE_COOKIES));
    return { user: { id: user.id, username: user.username, full_name: user.full_name } };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Headers('cookie') cookie: string | undefined, @Res({ passthrough: true }) res: Response) {
    await this.auth.destroySession(cookie);
    res.setHeader('Set-Cookie', sessionCookie('', 0, SECURE_COOKIES));
  }

  @Get('me')
  async me(@Headers('cookie') cookie: string | undefined) {
    return { user: await this.auth.requireUser(cookie) };
  }
}
