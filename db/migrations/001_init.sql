-- 001_init.sql — core schema for the Raw Feedback Platform.
-- Requires PostgreSQL 15+ (uses UNIQUE NULLS NOT DISTINCT).

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy "did you mean" duplicate detection

-- ─────────────────────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Categories (Restaurants, Travel, Automobiles, ...)
-- name_key is the normalised name computed by the API
-- (src/common/normalize.ts). Uniqueness on name_key — not on
-- name — is what stops "Restaurants" / "restaurants " / "Restaurants!"
-- from all being created.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id   BIGINT REFERENCES categories(id),
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,
  slug        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_key_uq UNIQUE NULLS NOT DISTINCT (parent_id, name_key),
  CONSTRAINT categories_slug_uq     UNIQUE (slug)
);
CREATE INDEX categories_name_trgm ON categories USING gin (name_key gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- Entities (a specific restaurant, city, car model, company, ...)
-- An entity is identified by (category, normalised name, location).
-- "Domino's, Pune" and "Domino's, Mumbai" are different entities;
-- "Dominos , pune" is the SAME entity as "Domino's, Pune".
-- ─────────────────────────────────────────────────────────────
CREATE TABLE entities (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id   BIGINT NOT NULL REFERENCES categories(id),
  name          TEXT NOT NULL,
  name_key      TEXT NOT NULL,
  slug          TEXT NOT NULL,
  country_code  CHAR(2),           -- ISO 3166-1 alpha-2, upper-case
  region        TEXT,
  city          TEXT,
  city_key      TEXT,              -- normalised city, part of identity
  attributes    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- category-specific fields
  -- Aggregates, maintained by trigger (see bottom). Denormalised so that
  -- "entities with avg rating >= 4" never scans the feedback table.
  avg_rating      NUMERIC(3,2),
  rating_count    INTEGER NOT NULL DEFAULT 0,
  feedback_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entities_identity_uq
    UNIQUE NULLS NOT DISTINCT (category_id, name_key, country_code, city_key),
  CONSTRAINT entities_slug_uq UNIQUE (category_id, slug)
);
CREATE INDEX entities_name_trgm   ON entities USING gin (name_key gin_trgm_ops);
CREATE INDEX entities_location_idx ON entities (country_code, city_key);
CREATE INDEX entities_rating_idx   ON entities (category_id, avg_rating DESC NULLS LAST);

-- ─────────────────────────────────────────────────────────────
-- Feedback
-- ─────────────────────────────────────────────────────────────
CREATE TABLE feedback (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id   BIGINT NOT NULL REFERENCES entities(id),
  user_id     BIGINT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
  status      TEXT NOT NULL DEFAULT 'published'
              CHECK (status IN ('published', 'pending_review', 'removed')),
  upvotes     INTEGER NOT NULL DEFAULT 0,
  search_tsv  TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', body)) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One index per supported sort order. Each ends in id so cursor
-- pagination (sort_value, id) is an index range scan, never an OFFSET.
CREATE INDEX feedback_entity_new_idx ON feedback (entity_id, created_at DESC, id DESC) WHERE status = 'published';
CREATE INDEX feedback_new_idx        ON feedback (created_at DESC, id DESC)            WHERE status = 'published';
CREATE INDEX feedback_top_idx        ON feedback (upvotes DESC, id DESC)               WHERE status = 'published';
CREATE INDEX feedback_search_idx     ON feedback USING gin (search_tsv);

-- One vote per user per feedback. The PK makes double-voting impossible
-- even under concurrent requests.
CREATE TABLE feedback_votes (
  feedback_id  BIGINT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_id, user_id)
);

-- Audit trail of rejected submissions. Stores reasons, not the abusive
-- text itself, so the platform does not retain content it refused.
CREATE TABLE moderation_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  entity_id   BIGINT REFERENCES entities(id),
  decision    TEXT NOT NULL CHECK (decision IN ('rejected', 'pending_review')),
  categories  TEXT[] NOT NULL DEFAULT '{}',
  provider    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX moderation_events_user_idx ON moderation_events (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Triggers keeping the denormalised counters correct.
-- These run in the same transaction as the write, so counters can never
-- drift. At high write volume, move them to a background worker.
-- ─────────────────────────────────────────────────────────────
CREATE FUNCTION refresh_entity_stats(p_entity_id BIGINT) RETURNS void AS $$
  UPDATE entities e SET
    avg_rating     = s.avg_rating,
    rating_count   = s.rating_count,
    feedback_count = s.feedback_count
  FROM (
    SELECT round(avg(rating)::numeric, 2) AS avg_rating,
           count(rating)                  AS rating_count,
           count(*)                       AS feedback_count
    FROM feedback
    WHERE entity_id = p_entity_id AND status = 'published'
  ) s
  WHERE e.id = p_entity_id;
$$ LANGUAGE sql;

CREATE FUNCTION feedback_stats_trg() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM refresh_entity_stats(OLD.entity_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.entity_id <> OLD.entity_id) THEN
    PERFORM refresh_entity_stats(NEW.entity_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feedback_stats
AFTER INSERT OR DELETE OR UPDATE OF status, rating, entity_id ON feedback
FOR EACH ROW EXECUTE FUNCTION feedback_stats_trg();

CREATE FUNCTION feedback_votes_trg() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE feedback SET upvotes = upvotes + 1 WHERE id = NEW.feedback_id;
  ELSE
    UPDATE feedback SET upvotes = upvotes - 1 WHERE id = OLD.feedback_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feedback_votes_count
AFTER INSERT OR DELETE ON feedback_votes
FOR EACH ROW EXECUTE FUNCTION feedback_votes_trg();
