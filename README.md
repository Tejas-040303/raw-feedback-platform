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
> logic, plus username/password accounts, are in place and tested. Redis, the job
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
| UI | **Tailwind CSS v4 + shadcn/ui** | Design tokens in one CSS file; accessible components copied into the repo (`apps/web/components/ui`), so they can be changed freely |
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
      mail/            Mailer interface and email templates
      moderation/      rule-based + Claude moderators
      auth/            sign-up, login, sessions, password rules
      common/          name normalisation, validation
    scripts/           cross-platform dev runner, migrate and seed commands
    test/              unit tests (no dependencies needed)
    test/db/           tests that run against a real Postgres
  web/                 Next.js frontend
    app/               pages: feed, entities/[id], write, account pages; globals.css holds the design tokens
    components/        site header, review item, entity picker, write-review form
    components/ui/     shadcn/ui building blocks (button, input, card, ...)
db/
  migrations/          SQL schema, applied in order by apps/api/scripts/db.ts
  seed.sql             starter categories and users
docker-compose.yml     Postgres 16 + Redis 7 for local development
```

## Getting Started

Works the same on **Windows** (PowerShell or cmd), macOS and Linux: every
`npm run` script is plain Node, with no bash syntax.

Requirements: Node.js 22.9+ and Docker Desktop (or a local PostgreSQL 15+).

1. Create your `.env` file in the repo root, then fill in values. The API and
   the database scripts read it automatically, so you don't need to `export`
   anything.

   | Shell | Command |
   |---|---|
   | PowerShell | `Copy-Item .env.example .env` |
   | cmd | `copy .env.example .env` |
   | bash / zsh | `cp .env.example .env` |

2. Install, start the database, and load the schema:

   ```
   npm install
   npm run db:up          # Postgres + Redis in Docker
   npm run db:migrate     # applies only migrations not yet applied; safe to re-run
   npm run db:seed        # starter categories and users (run once)
   ```

3. Run the API and the web app, each in its own terminal:

   ```
   npm run dev:api        # http://localhost:4000
   npm run dev:web        # http://localhost:3000
   ```

Tests:

```
npm test                       # unit tests, no database needed
npm run test:db -w apps/api    # schema, constraints, triggers, filter SQL
```

`test:db` uses `DATABASE_URL` from `.env` (or `TEST_DATABASE_URL` if set),
creates a throwaway database there and drops it afterwards. It needs the
`psql` command: on Windows, add PostgreSQL's `bin` folder (for example
`C:\Program Files\PostgreSQL\16\bin`) to your PATH.

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

### 4. Accounts

`/signup` asks for name, date of birth, email, username, password and confirmation;
`/login` takes a username **or** email plus password.

| Rule | |
|------|-|
| Password | 8–14 characters, with a lower-case letter, an upper-case letter, a number and a special character |
| Username | 3–30 characters: letters, numbers, `_` and `.`; unique ignoring case |
| Email | unique ignoring case |
| Date of birth | a real date in the past; minimum age 13 |

The rules live in one file, `apps/api/src/auth/account-rules.ts`. The signup page uses
a copy of it (`apps/web/app/account-rules.ts`) to check fields as you type, and a test
fails if the two copies differ. The API always re-checks: browser checks can be bypassed.

How it is secured:

- Passwords are stored as **scrypt** hashes with a random salt, never in plain text.
- After login the browser gets a random session token in an **HttpOnly, SameSite=Lax**
  cookie. JavaScript can't read it, and other sites can't make the browser send it on a
  POST. The database stores only the token's SHA-256 hash.
- Login gives the same error, and takes the same time, whether the username doesn't
  exist or the password is wrong, so it doesn't reveal which accounts exist.
- Sessions last 30 days. Logging out deletes the session on the server.
- **Failed logins are rate limited** (`db/migrations/003_login_throttle.sql`):

  | Limit | Allows | Then |
  |-------|--------|------|
  | Per account | 5 attempts / 15 min | locked for 15 min |
  | Per IP (IPv6: per /64) | 50 attempts / 15 min | locked for 15 min |

  The account limit stops guessing one user's password; the IP limit stops
  "password spraying" (a few common passwords tried against many accounts).
  Locks are temporary, so nobody can lock a user out for good. Blocked requests
  get `429` with a `Retry-After` header. Counters live in Postgres, so the
  limits hold across several API instances. Set `TRUST_PROXY` to the number of
  proxies in front of the API, or every user will share the proxy's IP.
- **Sign-ups are rate limited per network:** 10 per hour and 30 per day per IP
  (IPv6: per /64), then `429` with `Retry-After`. Each sign-up costs a
  password hash (CPU and 64 MiB of memory), and repeated "username taken" or
  "email already registered" answers reveal who has an account; the limit slows
  both down. Attempts are counted after the form is validated but before the
  password is hashed, so typos don't count and refused requests are cheap.
  It doesn't stop a botnet spread over many IPs; that needs a CAPTCHA or
  similar challenge. A large group signing up from one office or campus
  network (more than 10 in an hour) will hit it, so raise
  `REGISTER_PER_IP_HOUR` in `login-throttle.ts` if that's expected.

### 5. Email verification and password reset

```text
Sign up ──► "Confirm your email" mail ──► /verify-email ──► click "Confirm" ──► can post
Forgot password ──► "Reset your password" mail ──► /reset-password ──► new password
                                                    ──► logged out on every device
```

- **Posting and upvoting need a confirmed email.** Logging in doesn't, so a user
  who lost the first email can still log in and ask for another one.
- Links are single-use and short-lived: 24 hours to verify, 30 minutes to reset.
  Requesting a new email cancels the previous link. Tokens are stored only as hashes.
- `/forgot-password` always gives the same answer, at the same speed, whether or
  not the email has an account, so it can't be used to find out who's registered.
- Opening a link only shows a page; the user must click a button. Email security
  scanners open every link in a message, and would otherwise use the token up.
- Email-sending endpoints are rate limited: 3 per hour per address, 10 per hour per IP.

**Testing emails locally (current setup):** no email account or key is needed.
Emails are printed in the terminal running `npm run dev:api`, links included:

```text
── email to you@example.com ──
Subject: Confirm your email address
...
http://localhost:3000/verify-email?token=...
──────────
```

Sign up (or use "Forgot your password?"), copy the link from the API terminal into
the browser, and click the button on the page. In production the API refuses to start
with this console mailer, because printing reset links to production logs would let
anyone with log access take over accounts. Set `WEB_ORIGIN` to the site's public URL,
since email links are built from it.

#### Later phase: sending real email over SMTP (Gmail App Password)

Not built yet. The plan, so it can be picked up later:

**1. Google account (one-time)**
1. Turn on **2-Step Verification**: Google Account → Security. App Passwords only
   exist with it on (they're also unavailable on Advanced Protection accounts and on
   work/school accounts where an admin has disabled them).
2. Open <https://myaccount.google.com/apppasswords>, name it `raw-feedback-platform`,
   click **Create**, and copy the 16-character password. It is shown only once.

**2. Settings in `.env`** (never committed; `.env` is git-ignored)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465                    # implicit TLS; 587 would use STARTTLS
SMTP_USER=yourname@gmail.com
SMTP_PASS=abcdefghijklmnop       # the App Password, spaces removed
MAIL_FROM="Raw Feedback <yourname@gmail.com>"
```

**3. Code changes**
- Add the `nodemailer` dependency to `apps/api`.
- Add an `SmtpMailer implements Mailer` in `apps/api/src/mail/mailer.ts` that sends
  through the settings above.
- In `createMailer()`: use `SmtpMailer` when `SMTP_HOST` is set, otherwise
  `LogMailer`; keep refusing to start in production when neither is configured.
  Fail fast at startup if `SMTP_HOST` is set but `SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`
  are missing.
- Add the variables (empty) to `.env.example`, and unit tests for the selection logic.

Nothing else changes: the rest of the code only talks to the `Mailer` interface.

**Gmail vs a dedicated email service**

| | Gmail + App Password | Resend / Postmark / Amazon SES |
|---|---|---|
| Setup | ~5 minutes | Own domain + DNS records |
| Volume | ~500 recipients/day (personal account) | Thousands+ |
| From address | your Gmail address | `noreply@yourdomain.com` |
| Inbox placement | fine for testing | better, with SPF/DKIM/DMARC on your domain |
| Use for | development, demos | real users |

The App Password lets anyone who has it send mail as you: keep it only in `.env`,
and revoke it on the same page if it leaks. Before launching to real users, switch to
an email service by writing one more `Mailer` class.

## Data Model

```text
categories        (id, parent_id, name, name_key, slug)
entities          (id, category_id, name, name_key, country_code, region, city, city_key,
                   attributes JSONB, avg_rating, rating_count, feedback_count)
users             (id, display_name, full_name, username, email, email_verified_at, date_of_birth, password_hash)
sessions          (token_hash, user_id, expires_at)
login_throttle    (key, attempts, window_start, locked_until)
email_tokens      (token_hash, user_id, purpose, email, expires_at, used_at)
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
| POST | `/auth/register` | create account and log in |
| POST | `/auth/login` | log in with username or email |
| POST | `/auth/logout` | end the current session |
| GET | `/auth/me` | the logged-in user |
| POST | `/auth/verify-email` | confirm email with the token from the link |
| POST | `/auth/resend-verification` | send the confirmation email again |
| POST | `/auth/forgot-password` | email a password-reset link |
| POST | `/auth/reset-password` | set a new password with the token from the link |

Posting feedback and upvoting require a logged-in user with a confirmed email.

---

## Roadmap

1. ~~Project skeleton: schema, API, moderation, filters, duplicate detection~~
2. ~~Username/password accounts~~, ~~login rate limiting~~, ~~email verification and password reset~~; next: real email sending (SMTP via Gmail App Password for development, then an email service; see "Later phase" under Key Features 5), "Sign in with Google"
3. Review queue for `pending_review` posts and user abuse reports
4. Redis caching and rate limiting; BullMQ workers for moderation and counters
5. Read replicas and a dedicated search engine as traffic grows

---

## Contributing

Open an issue to discuss ideas before sending pull requests. Run `npm test` (and
`npm run test:db -w apps/api` for schema changes) before submitting.
