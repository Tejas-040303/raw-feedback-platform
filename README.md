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

> **Status:** early stage. The repository holds only this README for now.
> The architecture and tech stack below are the **planned** design. Nothing has been built yet.

---

## Goals

- **Raw feedback first:** users post what they actually experienced. Moderation only removes abuse and spam, not opinions.
- **Open-ended categories:** adding a new category or entity must not need a schema change.
- **Scales smoothly:** the platform should stay fast as users and feedback grow, without a rewrite.

---

## Planned Tech Stack

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

## Planned Data Model

```text
categories (id, name, slug, parent_id)
entities   (id, category_id, name, slug, attributes JSONB, created_at)
users      (id, display_name, auth_provider, created_at)
feedback   (id, entity_id, user_id, body, rating NULL, status, created_at, updated_at)
```

- `parent_id` allows sub-categories, e.g. Travel → Beaches.
- `attributes JSONB` holds per-category details, like a car's model year or a restaurant's cuisine.
- `status` tracks moderation: `published`, `flagged`, or `removed`.
- Key indexes: `feedback (entity_id, created_at DESC)` and `entities (category_id, slug)`.

---

## Roadmap

1. Project scaffolding (monorepo, Docker Compose for Postgres + Redis)
2. Categories and entities: create, browse, search
3. User accounts and posting feedback
4. Moderation pipeline and abuse reporting
5. Caching, read replicas, and dedicated search as traffic grows

---

## Contributing

The project is in its design phase. Open an issue to discuss ideas before sending pull requests.
