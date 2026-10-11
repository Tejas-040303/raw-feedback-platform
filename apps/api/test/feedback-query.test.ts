import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedbackQuery, decodeCursor, encodeCursor, MAX_LIMIT } from '../src/feedback/feedback-query.ts';

test('user values only ever appear as parameters', () => {
  const evil = "x'; DROP TABLE feedback; --";
  const { sql, params } = buildFeedbackQuery({ category: evil, q: evil, city: evil });
  assert.ok(!sql.includes('DROP TABLE'));
  assert.deepEqual(params.slice(0, 3), [evil, evil, evil]);
});

test('filters become WHERE clauses with numbered params', () => {
  const { sql, params } = buildFeedbackQuery({ category: 'restaurants', minRating: 4, minUpvotes: 10, country: 'in' });
  assert.match(sql, /c\.slug = \$1/);
  assert.match(sql, /e\.country_code = \$2/);
  assert.match(sql, /f\.rating >= \$3/);
  assert.match(sql, /f\.upvotes >= \$4/);
  assert.deepEqual(params, ['restaurants', 'IN', 4, 10, 21]);
});

test('limit is clamped and one extra row is fetched', () => {
  assert.equal(buildFeedbackQuery({ limit: 10_000 }).limit, MAX_LIMIT);
  const { params } = buildFeedbackQuery({ limit: 5 });
  assert.equal(params.at(-1), 6);
});

test('cursor round-trips and rejects garbage', () => {
  const c = encodeCursor('2026-10-11 04:00:00.123456+00', '42');
  assert.deepEqual(decodeCursor(c), ['2026-10-11 04:00:00.123456+00', '42']);
  assert.throws(() => decodeCursor('not-a-cursor'));
  assert.throws(() => decodeCursor(Buffer.from('[1,"1; DROP"]').toString('base64url')));
});

test('unknown sort is rejected', () => {
  assert.throws(() => buildFeedbackQuery({ sort: 'id; DROP TABLE x' as never }));
});
