import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { cityKey, nameKey, slugify } from '../common/normalize.ts';
import { parse } from '../common/validation.ts';
import { DatabaseService, UNIQUE_VIOLATION } from '../database/database.service.ts';

const CreateEntity = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  countryCode: z.string().length(2).toUpperCase().optional(),
  region: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  attributes: z.record(z.unknown()).default({}),
  // The user saw the "did you mean…?" list and confirmed this is new.
  confirmNew: z.boolean().default(false),
});

const SearchEntities = z.object({
  category: z.string().optional(),
  q: z.string().trim().min(1).optional(),
  country: z.string().length(2).optional(),
  city: z.string().optional(),
  minAvgRating: z.coerce.number().min(1).max(5).optional(),
  sort: z.enum(['rating', 'popular', 'name']).default('popular'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// pg_trgm similarity above which two names are probably the same thing
// ("Dominos Pizza" vs "Domino's"). Tune from real data.
const SIMILARITY_THRESHOLD = 0.5;

const ENTITY_COLUMNS = `id, category_id, name, slug, country_code, region, city,
  attributes, avg_rating, rating_count, feedback_count`;

@Controller('entities')
export class EntitiesController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async search(@Query() query: unknown) {
    const f = parse(SearchEntities, query);
    const params: unknown[] = [];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const where: string[] = [];

    if (f.category) where.push(`category_id = (SELECT id FROM categories WHERE slug = ${p(f.category)})`);
    // % is pg_trgm's "similar to" operator, so typos still match.
    if (f.q) where.push(`(name_key % ${p(nameKey(f.q))} OR name_key LIKE '%' || ${p(nameKey(f.q))} || '%')`);
    if (f.country) where.push(`country_code = ${p(f.country.toUpperCase())}`);
    if (f.city) where.push(`city_key = ${p(cityKey(f.city))}`);
    if (f.minAvgRating !== undefined) where.push(`avg_rating >= ${p(f.minAvgRating)}`);

    const order = {
      rating: 'avg_rating DESC NULLS LAST, rating_count DESC',
      popular: 'feedback_count DESC',
      name: 'name_key ASC',
    }[f.sort];

    const { rows } = await this.db.query(
      `SELECT ${ENTITY_COLUMNS} FROM entities
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ${order}, id
       LIMIT ${p(f.limit)}`,
      params,
    );
    return rows;
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const { rows } = await this.db.query(`SELECT ${ENTITY_COLUMNS} FROM entities WHERE id = $1`, [id]);
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }

  @Post()
  async create(@Body() body: unknown) {
    const input = parse(CreateEntity, body);
    const key = nameKey(input.name);
    const city = cityKey(input.city);
    const country = input.countryCode ?? null;

    // Step 1 — exact duplicate (same normalised name, category and place).
    const exact = await this.findExact(input.categoryId, key, country, city);
    if (exact) throw duplicate(exact);

    // Step 2 — near duplicates. Only a warning: "Taj Mahal Palace" and
    // "Taj Mahal" are similar but different, so the user gets to decide.
    if (!input.confirmNew) {
      const { rows: candidates } = await this.db.query(
        `SELECT ${ENTITY_COLUMNS}, similarity(name_key, $2) AS score
         FROM entities
         WHERE category_id = $1
           AND name_key % $2
           AND similarity(name_key, $2) >= $3
           AND city_key IS NOT DISTINCT FROM $4
         ORDER BY score DESC
         LIMIT 5`,
        [input.categoryId, key, SIMILARITY_THRESHOLD, city],
      );
      if (candidates.length) {
        throw new ConflictException({
          code: 'POSSIBLE_DUPLICATE',
          message: 'Similar entries already exist. Pick one, or resend with confirmNew: true.',
          candidates,
        });
      }
    }

    // Step 3 — insert. The unique constraint is the real guarantee: it also
    // catches the race where two users create the same entity at once.
    try {
      const { rows } = await this.db.query(
        `INSERT INTO entities (category_id, name, name_key, slug, country_code, region, city, city_key, attributes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${ENTITY_COLUMNS}`,
        [
          input.categoryId, input.name, key,
          slugify([input.name, input.city, country].filter(Boolean).join(' ')),
          country, input.region ?? null, input.city ?? null, city, input.attributes,
        ],
      );
      return rows[0];
    } catch (err) {
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
      const existing = await this.findExact(input.categoryId, key, country, city);
      throw duplicate(existing);
    }
  }

  private async findExact(categoryId: number, key: string, country: string | null, city: string | null) {
    const { rows } = await this.db.query(
      `SELECT ${ENTITY_COLUMNS} FROM entities
       WHERE category_id = $1 AND name_key = $2
         AND country_code IS NOT DISTINCT FROM $3
         AND city_key IS NOT DISTINCT FROM $4`,
      [categoryId, key, country, city],
    );
    return rows[0];
  }
}

function duplicate(existing: unknown) {
  return new ConflictException({ code: 'DUPLICATE', message: 'This entry already exists.', existing });
}
