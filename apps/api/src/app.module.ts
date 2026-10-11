import { Controller, Get, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.ts';
import { CategoriesController } from './categories/categories.controller.ts';
import { DatabaseModule } from './database/database.module.ts';
import { DatabaseService } from './database/database.service.ts';
import { EntitiesController } from './entities/entities.controller.ts';
import { FeedbackController } from './feedback/feedback.controller.ts';
import { ModerationModule } from './moderation/moderation.module.ts';

@Controller('health')
class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check() {
    await this.db.query('SELECT 1');
    return { ok: true };
  }
}

@Module({
  imports: [DatabaseModule, AuthModule, ModerationModule],
  controllers: [HealthController, CategoriesController, EntitiesController, FeedbackController],
})
export class AppModule {}
