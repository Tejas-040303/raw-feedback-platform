import { Body, ConflictException, Controller, Get, Headers, Post } from '@nestjs/common';
import { z } from 'zod';
import { nameKey, slugify } from '../common/normalize.ts';
import { parse } from '../common/validation.ts';
import { AuthService } from '../auth/auth.service.ts';
import { DatabaseService, UNIQUE_VIOLATION } from '../database/database.service.ts';

const CreateCategory = z.object({
  name: z.string().trim().min(2).max(80),
  parentId: z.number().int().positive().optional(),
});

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list() {
    const { rows } = await this.db.query(
      'SELECT id, parent_id, name, slug FROM categories ORDER BY name',
    );
    return rows;
  }

  @Post()
  async create(@Headers('cookie') cookie: string | undefined, @Body() body: unknown) {
    // Was open to anonymous callers. A verified account is the minimum;
    // categories shape the whole site, so this should become admin-only
    // once roles exist.
    await this.auth.requireVerifiedUser(cookie);
    const input = parse(CreateCategory, body);
    const key = nameKey(input.name);
    try {
      const { rows } = await this.db.query(
        `INSERT INTO categories (parent_id, name, name_key, slug)
         VALUES ($1, $2, $3, $4)
         RETURNING id, parent_id, name, slug`,
        [input.parentId ?? null, input.name, key, slugify(input.name)],
      );
      return rows[0];
    } catch (err) {
      // The unique constraint, not a SELECT-before-INSERT, is what makes
      // this safe: two concurrent requests can both pass a SELECT check.
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
      const { rows } = await this.db.query(
        'SELECT id, parent_id, name, slug FROM categories WHERE name_key = $1 OR slug = $2',
        [key, slugify(input.name)],
      );
      throw new ConflictException({ code: 'DUPLICATE', message: 'This category already exists.', existing: rows[0] });
    }
  }
}
