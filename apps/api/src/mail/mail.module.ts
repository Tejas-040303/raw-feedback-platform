import { Global, Module } from '@nestjs/common';
import { createMailer } from './mailer.ts';

/** Injection token for the Mailer interface (interfaces vanish at runtime). */
export const MAILER = Symbol('MAILER');

@Global()
@Module({
  providers: [{ provide: MAILER, useFactory: createMailer }],
  exports: [MAILER],
})
export class MailModule {}
