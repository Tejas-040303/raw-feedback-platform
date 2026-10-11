import { Module } from '@nestjs/common';
import { ClaudeModerator } from './claude-moderator.ts';
import { ModerationService } from './moderation.service.ts';
import { RuleModerator } from './rule-moderator.ts';

@Module({
  providers: [
    {
      provide: ModerationService,
      useFactory: () =>
        new ModerationService(
          new RuleModerator(),
          // Without an API key the platform still works, with rules only.
          process.env.ANTHROPIC_API_KEY ? new ClaudeModerator() : null,
        ),
    },
  ],
  exports: [ModerationService],
})
export class ModerationModule {}
