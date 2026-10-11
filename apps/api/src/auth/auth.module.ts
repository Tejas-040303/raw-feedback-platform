import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';
import { LoginThrottleService } from './login-throttle.service.ts';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, LoginThrottleService],
  exports: [AuthService],
})
export class AuthModule {}
