import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // How many proxies (load balancer, CDN) sit in front of the API. Express
  // then takes the client IP from that many hops back in X-Forwarded-For.
  //   unset/0 -> no proxy: use the socket address, ignore X-Forwarded-For.
  // Too low: every user appears to share the proxy's IP and they all hit
  // the per-IP login limit together. Too high: clients can write their own
  // X-Forwarded-For and pick a fresh "IP" for every login guess.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 0));
  // credentials: true lets the browser send the session cookie cross-origin
  // (web :3000 -> api :4000). It requires an exact origin, never '*'.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000));
}

void bootstrap();
