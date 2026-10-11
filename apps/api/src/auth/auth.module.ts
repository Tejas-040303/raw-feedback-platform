import { Global, Module } from '@nestjs/common';
import { AccountMailService } from './account-mail.service.ts';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';
import { EmailAuthController } from './email-auth.controller.ts';
import { EmailTokenService } from './email-token.service.ts';
import { LoginThrottleService } from './login-throttle.service.ts';

@Global()
@Module({
  controllers: [AuthController, EmailAuthController],
  providers: [AuthService, LoginThrottleService, EmailTokenService, AccountMailService],
  exports: [AuthService],
})
export class AuthModule {}
