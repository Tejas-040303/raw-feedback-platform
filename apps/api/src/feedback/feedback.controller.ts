import {
  BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpException,
  HttpStatus, NotFoundException, Param, ParseIntPipe, Post, Query, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { cityKey } from '../common/normalize.ts';
import { parse } from '../common/validation.ts';
import { AuthService } from '../auth/auth.service.ts';
import { DatabaseService } from '../database/database.service.ts';
import { ModerationService } from '../moderation/moderation.service.ts';
import { buildFeedbackQuery, encodeCursor } from './feedback-query.ts';

const CreateFeedback = z.object({
  entityId: z.number().int().positive(),
  body: z.string().trim().min(1).max(10_000),
  rating: z.number().int().min(1).max(5).optional(),
});

const ListFeedback = z.object({
  category: z.string().optional(),
  entityId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  country: z.string().length(2).optional(),
  city: z.string().trim().min(1).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
  minUpvotes: z.coerce.number().int().min(0).optional(),
  from: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  sort: z.enum(['newest', 'top', 'rating']).default('newest'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller('feedback')
export class FeedbackController {
  constructor(
    private readonly db: DatabaseService,
    private readonly moderation: ModerationService,
    private readonly auth: AuthService,
  ) {}

  /**
   * GET /feedback?category=restaurants&city=pune&minRating=4&sort=top
   * Returns { items, nextCursor }. Pass nextCursor back as ?cursor= for the
   * next page; it is null on the last page.
   */
  @Get()
  async list(@Query() query: unknown) {
    const filters = parse(ListFeedback, query);
    let built;
    try {
      built = buildFeedbackQuery({ ...filters, city: cityKey(filters.city) ?? undefined });
    } catch (err) {
      throw new BadRequestException({ code: 'INVALID_QUERY', message: (err as Error).message });
    }

    const { rows } = await this.db.query<{ id: string; sort_value: string }>(built.sql, built.params);
    const hasMore = rows.length > built.limit;
    const items = rows.slice(0, built.limit);
    const last = items[items.length - 1];

    return {
      items: items.map(({ sort_value, ...item }) => item),
      nextCursor: hasMore && last ? encodeCursor(last.sort_value, last.id) : null,
    };
  }

  /**
   * POST /feedback
   *   201 { status: 'published', feedback }
   *   202 { status: 'pending_review', feedback }   moderation unavailable
   *   422 { code: 'ABUSIVE_CONTENT', categories, explanation, suggestedRewrite }
   *
   * On 422 nothing is stored. The client shows suggestedRewrite; the user
   * may edit it and submit again, and the new text goes through moderation
   * again. The rewrite is a suggestion, never trusted automatically.
   */
  @Post()
  async create(
    @Headers('cookie') cookie: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = (await this.auth.requireUser(cookie)).id;
    const input = parse(CreateFeedback, body);

    const entity = await this.db.query('SELECT 1 FROM entities WHERE id = $1', [input.entityId]);
    if (!entity.rowCount) throw new NotFoundException({ code: 'ENTITY_NOT_FOUND' });

    const outcome = await this.moderation.check(input.body);

    if (outcome.decision === 'reject') {
      await this.db.query(
        `INSERT INTO moderation_events (user_id, entity_id, decision, categories, provider)
         VALUES ($1, $2, 'rejected', $3, $4)`,
        [userId, input.entityId, outcome.result.categories, outcome.result.provider],
      );
      throw new HttpException(
        {
          code: 'ABUSIVE_CONTENT',
          categories: outcome.result.categories,
          explanation: outcome.result.explanation,
          suggestedRewrite: outcome.result.suggestedRewrite,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const status = outcome.decision === 'hold' ? 'pending_review' : 'published';
    const feedback = await this.db.transaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO feedback (entity_id, user_id, body, rating, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, entity_id, body, rating, status, upvotes, created_at`,
        [input.entityId, userId, input.body, input.rating ?? null, status],
      );
      if (status === 'pending_review') {
        await tx.query(
          `INSERT INTO moderation_events (user_id, entity_id, decision, provider)
           VALUES ($1, $2, 'pending_review', 'unavailable')`,
          [userId, input.entityId],
        );
      }
      return rows[0];
    });

    res.status(status === 'published' ? HttpStatus.CREATED : HttpStatus.ACCEPTED);
    return { status, feedback };
  }

  /** Idempotent: upvoting twice is a no-op, not an error and not +2. */
  @Post(':id/upvote')
  @HttpCode(204)
  async upvote(@Headers('cookie') cookie: string | undefined, @Param('id', ParseIntPipe) id: number) {
    const userId = (await this.auth.requireUser(cookie)).id;
    const { rowCount } = await this.db.query(
      `INSERT INTO feedback_votes (feedback_id, user_id)
       SELECT id, $2 FROM feedback WHERE id = $1 AND status = 'published'
       ON CONFLICT DO NOTHING`,
      [id, userId],
    );
    if (rowCount === 0) {
      const exists = await this.db.query(`SELECT 1 FROM feedback WHERE id = $1 AND status = 'published'`, [id]);
      if (!exists.rowCount) throw new NotFoundException();
    }
  }

  @Delete(':id/upvote')
  @HttpCode(204)
  async removeUpvote(@Headers('cookie') cookie: string | undefined, @Param('id', ParseIntPipe) id: number) {
    const userId = (await this.auth.requireUser(cookie)).id;
    await this.db.query('DELETE FROM feedback_votes WHERE feedback_id = $1 AND user_id = $2', [id, userId]);
  }
}
