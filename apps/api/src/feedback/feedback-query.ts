/**
 * Builds the SQL for GET /feedback from validated filter params.
 *
 * Kept free of framework code so it can be unit-tested and run against a
 * real Postgres in test/. Every user value goes into `params` as a $n
 * placeholder; only whitelisted identifiers are ever concatenated into SQL.
 */

export type FeedbackSort = 'newest' | 'top' | 'rating';

export interface FeedbackFilters {
  category?: string;      // category slug
  entityId?: number;
  q?: string;             // full-text search over the body
  country?: string;       // ISO alpha-2
  city?: string;          // already normalised with cityKey()
  minRating?: number;
  maxRating?: number;
  minUpvotes?: number;
  from?: string;          // ISO date, inclusive
  to?: string;            // ISO date, exclusive
  sort?: FeedbackSort;
  cursor?: string;
  limit?: number;
}

// Each sort maps to a fixed SQL expression and has a matching index.
// rating sorts COALESCE(rating, 0) so unrated feedback goes last and the
// cursor value is never NULL (NULLs break the row-comparison below).
const SORTS: Record<FeedbackSort, { expr: string; cast: string }> = {
  newest: { expr: 'f.created_at', cast: 'timestamptz' },
  top: { expr: 'f.upvotes', cast: 'integer' },
  rating: { expr: 'COALESCE(f.rating, 0)', cast: 'integer' },
};

export const MAX_LIMIT = 50;

export function encodeCursor(sortValue: unknown, id: number | string): string {
  return Buffer.from(JSON.stringify([sortValue, String(id)])).toString('base64url');
}

export function decodeCursor(cursor: string): [unknown, string] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid cursor');
  }
  if (!Array.isArray(parsed) || parsed.length !== 2 || !/^\d+$/.test(String(parsed[1]))) {
    throw new Error('invalid cursor');
  }
  return [parsed[0], String(parsed[1])];
}

export function buildFeedbackQuery(f: FeedbackFilters): { sql: string; params: unknown[]; limit: number } {
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = [`f.status = 'published'`];

  if (f.category) where.push(`c.slug = ${p(f.category)}`);
  if (f.entityId !== undefined) where.push(`f.entity_id = ${p(f.entityId)}`);
  if (f.q) where.push(`f.search_tsv @@ websearch_to_tsquery('simple', ${p(f.q)})`);
  if (f.country) where.push(`e.country_code = ${p(f.country.toUpperCase())}`);
  if (f.city) where.push(`e.city_key = ${p(f.city)}`);
  if (f.minRating !== undefined) where.push(`f.rating >= ${p(f.minRating)}`);
  if (f.maxRating !== undefined) where.push(`f.rating <= ${p(f.maxRating)}`);
  if (f.minUpvotes !== undefined) where.push(`f.upvotes >= ${p(f.minUpvotes)}`);
  if (f.from) where.push(`f.created_at >= ${p(f.from)}`);
  if (f.to) where.push(`f.created_at < ${p(f.to)}`);

  const sort = SORTS[f.sort ?? 'newest'];
  if (!sort) throw new Error(`unknown sort: ${f.sort}`);

  if (f.cursor) {
    const [value, id] = decodeCursor(f.cursor);
    // Row comparison: "strictly after the last row of the previous page"
    // in (sort_value DESC, id DESC) order. Ties on sort_value are broken by
    // id, so no row is ever skipped or repeated between pages.
    where.push(`(${sort.expr}, f.id) < (${p(value)}::${sort.cast}, ${p(id)}::bigint)`);
  }

  const limit = Math.min(Math.max(f.limit ?? 20, 1), MAX_LIMIT);

  const sql = `
    SELECT f.id, f.body, f.rating, f.upvotes, f.created_at,
           (${sort.expr})::text AS sort_value,
           -- ::text, not the raw value: node-pg turns timestamptz into a JS
           -- Date, which drops microseconds. A cursor built from it would
           -- skip rows created in the same millisecond.
           e.id AS entity_id, e.name AS entity_name, e.city, e.country_code,
           c.slug AS category
    FROM feedback f
    JOIN entities e   ON e.id = f.entity_id
    JOIN categories c ON c.id = e.category_id
    WHERE ${where.join('\n      AND ')}
    ORDER BY ${sort.expr} DESC, f.id DESC
    LIMIT ${p(limit + 1)}`;
  // limit + 1: fetching one extra row tells us whether a next page exists
  // without a separate COUNT(*) query.

  return { sql, params, limit };
}
