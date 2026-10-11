import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // credentials: true lets the browser send the session cookie cross-origin
  // (web :3000 -> api :4000). It requires an exact origin, never '*'.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000));
}

void bootstrap();
