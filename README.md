# Raw Feedback Platform

A platform for honest, unfiltered feedback on almost anything: restaurants, travel
destinations, automobiles, companies and their services, government work, NGOs,
and more.

Feedback is organised in three levels:

```text
Category   →  Restaurants, Travel, Automobiles, Companies, Government, NGOs, ...
  Entity   →  a specific thing in that category, e.g. a restaurant, a city, a car model
    Feedback → raw text written by a user about that entity
```

> **Status:** project skeleton. The database schema, API, moderation and filtering
> logic are in place and tested. Authentication is a placeholder, and Redis, the job
> queue and the dedicated search engine are still planned.

---

## Goals

- **Raw feedback first:** users post what they actually experienced. Moderation only removes abuse and spam, not opinions.
- **Open-ended categories:** adding a new category or entity must not need a schema change.
- **Scales smoothly:** the platform should stay fast as users and feedback grow, without a rewrite.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **Next.js (React) + TypeScript** | Server-side rendering makes entity and feedback pages fast and indexable by search engines |
| API | **Node.js + TypeScript (NestJS)** | One language across the stack, with a structured, modular backend |
| Primary database | **PostgreSQL** | Category → Entity → Feedback is relational data. You get transactions, constraints, and indexes, plus `JSONB` for category-specific attributes |
| Cache | **Redis** | Caches hot entity pages and ratings. Also handles rate limiting and sessions |
| Search | **PostgreSQL full-text search** first, **OpenSearch** later | Start simple, and move search out of the database once volume needs it |
| File storage | **S3-compatible object storage** + CDN | For images attached to feedback. Files never go in the database |
| Background jobs | **BullMQ (Redis-backed)** | Handles moderation, notifications, and rating recomputation outside the request path |
| Auth | **OAuth/OIDC login** (e.g. Google) + email | Avoids storing passwords, and ties feedback to accountable accounts |
| Infra | **Docker**, CI via GitHub Actions | Same environment locally and in production |

### How it scales

```text
Users ─► CDN (static assets, images)
      ─► Load balancer ─► Stateless API instances (scale out horizontally)
                              │
                ┌─────────────┼──────────────┐
                ▼             ▼              ▼
             Redis      PostgreSQL       Job queue ─► Workers
            (cache)   (primary + read      (moderation,
                        replicas)           aggregates)
```

- API servers keep no state, so you can add more instances behind the load balancer.
- Reads far outnumber writes. Read replicas and the Redis cache absorb read traffic.
- Aggregates such as average rating and feedback count are computed by workers, not on every page view.
- Lists use cursor-based pagination, never `OFFSET`, so pages stay fast deep into large lists.

---

## Repository Layout

```text
apps/
  api/                 NestJS REST API (TypeScript)
    src/
      categories/      list/create categories
      entities/        search/create entities, duplicate detection
      feedback/        list with filters, post, upvote
      moderation/      rule-based + Claude moderators
      common/          name normalisation, validation, placeholder auth
    test/              unit tests (no dependencies needed)
    test/db/           tests that run against a real Postgres
  web/                 Next.js frontend: filter page + post form
db/
  migrations/          SQL schema
  seed.sql             starter categories and users
docker-compose.yml     Postgres 16 + Redis 7 for local development
```

## Getting Started

Requirements: Node.js 22+, Docker (or a local PostgreSQL 15+), `psql`.

```bash
cp .env.example .env            # then fill in values; export them in your shell
npm install
npm run db:up                   # start Postgres + Redis
npm run db:migrate
npm run db:seed
npm run dev:api                 # http://localhost:4000
npm run dev:web                 # http://localhost:3000
```

Tests:

```bash
npm test                                        # unit tests
TEST_DATABASE_URL=postgres://rfp:rfp@localhost:5432/postgres \
  npm run test:db -w apps/api                   # schema, constraints, triggers, filter SQL
```

---

## Key Features

### 1. Abuse detection with a suggested rewrite

Every post goes through two moderation stages before it is saved:

```text
POST /feedback
   │
   ▼
Rule moderator (instant, free)        insults at people, threats,
   │   abusive? ──► 422 + rewrite      phone numbers / emails, link spam
   ▼
Claude moderator (if ANTHROPIC_API_KEY is set)
   │   abusive? ──► 422 + rewrite      understands context, writes a natural rewrite
   │   API error? ─► 202, saved as pending_review (hidden until checked)
   ▼
201, published
```

If a post is rejected, the API responds `422` with what was wrong and a
`suggestedRewrite`: the same post with the abuse removed and every complaint kept.
The user can accept it into the editor, change it, and submit it again. A resubmitted
post goes through moderation again, so the rewrite is never trusted automatically.

Harsh criticism is allowed. "The food was disgusting and the manager was rude" gets
published; "The manager is an idiot, here's his number" gets rejected with a rewrite.
Rejected text is not stored. Only the reason is logged, in `moderation_events`.

### 2. No duplicate categories or entities

Names are normalised into a key (`apps/api/src/common/normalize.ts`) by folding case,
accents, punctuation, a leading "the" and legal suffixes:

| Input | Key |
|-------|-----|
| `Domino's Pizza`, `dominos  pizza`, `Dominos-Pizza!` | `dominos pizza` |
| `Tata Motors Pvt. Ltd.` | `tata motors` |
| `Café Coffee Day` | `cafe coffee day` |

An entity is identified by **category + name key + country + city**, so "Domino's, Pune"
and "Domino's, Mumbai" are different entities. Duplicates are stopped in three layers:

1. **Exact duplicate** returns `409 DUPLICATE` with the existing entry.
2. **Near duplicate** (`pg_trgm` similarity, e.g. "Dominoes" vs "Domino's") returns
   `409 POSSIBLE_DUPLICATE` with candidates. The user picks one, or resends with
   `confirmNew: true`.
3. **Database unique constraint**, the real guarantee. It also catches two users
   creating the same entity at the same moment, which an application-level check can't.

### 3. Filtering and search

`GET /feedback` accepts any combination of:

| Parameter | Example | Meaning |
|-----------|---------|---------|
| `category` | `restaurants` | category slug |
| `entityId` | `42` | one entity |
| `q` | `cold food` | full-text search in the feedback |
| `country`, `city` | `IN`, `Pune` | entity location |
| `minRating`, `maxRating` | `4` | 1–5 stars |
| `minUpvotes` | `10` | popularity |
| `from`, `to` | `2026-01-01` | date range |
| `sort` | `newest` \| `top` \| `rating` | order |
| `limit`, `cursor` | `20` | pagination |

The response is `{ items, nextCursor }`. Pass `nextCursor` back as `?cursor=` to get
the next page. Pagination uses cursors, not `OFFSET`, so page 500 is as fast as page 1.

`GET /entities` searches entities by `category`, `q` (typo-tolerant), `country`, `city`
and `minAvgRating`, sorted by `rating`, `popular` or `name`.

---

## Data Model

```text
categories        (id, parent_id, name, name_key, slug)
entities          (id, category_id, name, name_key, country_code, region, city, city_key,
                   attributes JSONB, avg_rating, rating_count, feedback_count)
users             (id, display_name)
feedback          (id, entity_id, user_id, body, rating, status, upvotes, search_tsv)
feedback_votes    (feedback_id, user_id)          one vote per user, enforced by the primary key
moderation_events (user_id, entity_id, decision, categories, provider)
```

- `avg_rating`, `feedback_count` and `upvotes` are kept up to date by database triggers,
  so lists and filters never compute them on the fly.
- `attributes JSONB` holds per-category details, like a car's model year or a restaurant's cuisine.
- `status` is `published`, `pending_review` or `removed`. Only `published` feedback is visible.

## API Summary

| Method | Path | |
|--------|------|-|
| GET | `/health` | health check |
| GET / POST | `/categories` | list / create |
| GET / POST | `/entities` | search / create (with duplicate detection) |
| GET | `/entities/:id` | one entity |
| GET / POST | `/feedback` | filter / post (with moderation) |
| POST / DELETE | `/feedback/:id/upvote` | upvote / remove upvote (idempotent) |

> **Auth is a placeholder.** Write endpoints read the user id from an `x-user-id`
> header so the skeleton can be tried end to end. Replace it with OAuth/OIDC before
> deploying anything.

---

## Roadmap

1. ~~Project skeleton: schema, API, moderation, filters, duplicate detection~~
2. Real authentication (OAuth/OIDC) replacing the `x-user-id` placeholder
3. Review queue for `pending_review` posts and user abuse reports
4. Redis caching and rate limiting; BullMQ workers for moderation and counters
5. Read replicas and a dedicated search engine as traffic grows

---

## Contributing

Open an issue to discuss ideas before sending pull requests. Run `npm test` (and
`npm run test:db -w apps/api` for schema changes) before submitting.
