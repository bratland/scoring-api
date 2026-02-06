# Architecture

Current system architecture for the Scoring Engine.

---

## System Overview

```
                          +------------------+
                          |    SvelteKit     |
                          |    Frontend      |
                          |  (UI Pages)      |
                          +--------+---------+
                                   |
                          +--------v---------+
                          |    SvelteKit     |
                          |   API Routes     |
                          | (Server-side)    |
                          +--------+---------+
                                   |
              +--------------------+--------------------+
              |                    |                    |
     +--------v-------+  +--------v-------+  +---------v------+
     |   Scoring       |  |  Enrichment    |  |   Analytics    |
     |   Engine        |  |  Layer         |  |   Layer        |
     | (Pure logic)    |  | (Orchestrator) |  | (Read-only)    |
     +--------+--------+  +--------+-------+  +--------+-------+
              |                    |                    |
              |           +-------+-------+            |
              |           |               |            |
         +---------+ +----v----+  +-------v--+  +-----v------+
         | Config  | |  TIC    |  | Perplexity|  | Pipedrive  |
         | (Static)| | Client  |  | Client    |  | Client     |
         +---------+ +----+----+  +----------+   +-----+------+
                          |                             |
                     +----v----+                        |
                     |  Cache  |                        |
                     | (Redis) |                        |
                     +---------+                        |
                                                        |
                     +----------+              +--------v--------+
                     | Nominatim|              |   Pipedrive     |
                     | (Geo)   |              |   (External)    |
                     +----------+              +-----------------+
```

---

## Layer Structure

### Layer 1: UI (Frontend)

**Location:** `src/routes/*.svelte`

Svelte pages that render data. Contains no business logic. All data flows from API routes.

| Page | Purpose |
|------|---------|
| `/` | Dashboard with navigation and manual scoring test |
| `/customers` | Organization list with TIC data |
| `/persons` | Person list with scores |
| `/persons/[id]` | Person detail view |
| `/icp` | ICP weight editor |
| `/docs` | API documentation |
| `/analysis` | Analytics dashboard |

**Components:** `src/lib/components/` (Chart, Leaderboard, StatCard)

### Layer 2: API Routes (Controllers)

**Location:** `src/routes/api/`

SvelteKit server-side request handlers. Responsible for:
- Request validation and authentication
- Orchestrating calls to domain services
- Response formatting

No business logic lives here. Routes delegate to the domain layer.

#### Score Routes

| Route | File | Responsibility |
|-------|------|----------------|
| `POST /api/score/person` | `score/person/+server.ts` | Pass-through to `calculateScore()` |
| `POST /api/score/bulk` | `score/bulk/+server.ts` | Pass-through to `calculateBulkScores()` |
| `POST /api/score/pipedrive` | `score/pipedrive/+server.ts` | Full orchestration: fetch, enrich, score, update |
| `GET /api/score/config` | `score/config/+server.ts` | Return static config |

#### Other Routes

| Route | File | Responsibility |
|-------|------|----------------|
| `GET /api/organizations` | `organizations/+server.ts` | List Pipedrive organizations |
| `GET /api/persons` | `persons/+server.ts` | List Pipedrive persons |
| `GET /api/persons/[id]` | `persons/[id]/+server.ts` | Get person detail |
| `POST /api/icp` | `icp/+server.ts` | ICP configuration |
| `POST /api/init` | `init/+server.ts` | Initialize field mappings |
| `POST /api/cache/seed` | `cache/seed/+server.ts` | Seed TIC cache |
| `GET /api/analytics/*` | `analytics/*/+server.ts` | Analytics queries |

### Layer 3: Domain Services

#### Scoring Engine

**Location:** `src/lib/scoring/`

Pure calculation logic with zero side effects or external dependencies.

| File | Responsibility |
|------|----------------|
| `config.ts` | Scoring weights, tiers, thresholds (static) |
| `scorer.ts` | `calculateScore()`, `calculateBulkScores()` |
| `scorer.test.ts` | 45 test cases covering all scoring logic |

**Interfaces:**
- Input: `PersonInput` (functions, activities_90d) + `CompanyInput` (revenue, cagr_3y, score, industry, employees, distance_km)
- Output: `ScoringResult` (person_score, company_score, combined_score, tier, breakdown, warnings, reason)

**Key property:** Person score and company score are calculated independently. They combine only at the final weighted sum.

#### Company Enrichment

**Location:** `src/lib/enrichment/`

Orchestrates TIC data fetching, distance calculation, and Pipedrive write-back.

| File | Responsibility |
|------|----------------|
| `company-enricher.ts` | `CompanyEnricher.enrichCompany()` - main orchestration |

**Data flow:**
1. Read Pipedrive org data (org number, city)
2. Call TIC client (handles caching internally)
3. Calculate distance (TIC coords or geocoding fallback)
4. Calculate hourly labor cost
5. Write enriched data back to Pipedrive org fields
6. Return `EnrichedCompanyData`

**Note:** This class couples read (enrich) and write (update Pipedrive) operations. A future refactoring could separate these.

#### Analytics

**Location:** `src/lib/analytics/`

Read-only analytics queries against Pipedrive data.

| File | Responsibility |
|------|----------------|
| `deals.ts` | Deal pipeline analytics |
| `salesRep.ts` | Sales rep performance |
| `types.ts` | Analytics type definitions |

### Layer 4: External Service Clients

#### TIC Client

**Location:** `src/lib/tic/`

| File | Responsibility |
|------|----------------|
| `client.ts` | `TicClient` - API calls with multi-layer caching |
| `types.ts` | TIC API type definitions |
| `cache-seed.ts` | Development seed data (3 companies) |

**API calls per company (worst case: 3):**
1. `GET /search/companies?q={orgNumber}&query_by=registrationNumber`
2. `GET /datasets/companies/{id}/financial-summary` (parallel with 3)
3. `GET /datasets/companies/{id}/credit-score` (parallel with 2)

**Cache strategy (checked in order):**
1. Pipedrive org fields (TTL: 7 days)
2. Redis/Upstash KV (TTL: 7 days)
3. Seed cache (hardcoded)
4. Live API

**Constraint:** 1,000 API calls/month.

#### Perplexity Client

**Location:** `src/lib/perplexity/`

| File | Responsibility |
|------|----------------|
| `client.ts` | `PerplexityClient.findPersonRole()` - AI role detection |

**Rate limits:** 1 QPS, 50 req/min. Model: `sonar-pro`.

**No result caching.** Each call for a person without a role triggers a new API request.

#### Pipedrive Client

**Location:** `src/lib/pipedrive/`

| File | Responsibility |
|------|----------------|
| `client.ts` | `PipedriveClient` - CRUD operations |
| `rateLimiter.ts` | Adaptive rate limiter (80 req/2s) |

**Rate limiting:** Reads `x-ratelimit-remaining` and `x-ratelimit-reset` headers. Backs off 2100ms on 429. Max 3 retries with exponential backoff.

#### Geocoding (Nominatim)

**Location:** `src/lib/geo/`

| File | Responsibility |
|------|----------------|
| `nominatim.ts` | Geocoding with pre-populated Swedish city cache |

**Cache:** 50+ Swedish cities pre-populated. Runtime in-memory cache. Redis cache (TTL: 1 year).

### Layer 5: Infrastructure

#### Cache

**Location:** `src/lib/cache/`

| File | Responsibility |
|------|----------------|
| `redis.ts` | Upstash Redis client |
| `index.ts` | `getTicCache()`, `setTicCache()` helpers |

**Provider:** Upstash Redis (serverless, Vercel-compatible).

---

## Data Flow: Full Pipedrive Scoring

Current monolithic flow for `POST /api/score/pipedrive`:

```
Request { person_id }
    |
    v
[1] Pipedrive: GET person         (1 API call)
    |
    v
[2] Pipedrive: GET organization   (1 API call)
    |
    v
[3] TIC: enrichCompany()          (0-3 API calls, depending on cache)
    |   +-- Check Pipedrive cache
    |   +-- Check Redis cache
    |   +-- Check seed cache
    |   +-- Fetch from TIC API (search + financials + credit)
    |   +-- Calculate distance (coords or geocoding)
    |   +-- Write back to Pipedrive org fields
    |
    v
[4] Perplexity: findPersonRole()  (0-1 API call, if no role in Pipedrive)
    |
    v
[5] Pipedrive: engagement         (4 parallel API calls)
    |   +-- GET activities
    |   +-- GET notes
    |   +-- GET mailMessages
    |   +-- GET files
    |
    v
[6] Scorer: calculateScore()      (pure function, no API calls)
    |
    v
[7] Pipedrive: PUT person         (1 API call - update tier + score)
    |
    v
Response { tier, score, breakdown, engagement, warnings }
```

**Total API calls per request: 8-10** (after field mapping cache warmup)

---

## External Dependencies

| Service | Purpose | Limit | Cost |
|---------|---------|-------|------|
| Pipedrive | CRM data (persons, orgs, activities) | 80 req/2s | Subscription |
| TIC.io | Company financial data, credit, SNI | 1,000/month | Subscription |
| Perplexity | AI role detection | 1 QPS, 50/min | Per-query |
| Nominatim/OSM | Geocoding fallback | 1 req/sec | Free |
| Upstash Redis | TIC data caching | Plan-dependent | Upstash plan |

---

## Deployment

- **Platform:** Vercel (via `@sveltejs/adapter-vercel`)
- **Runtime:** Node.js (serverless functions)
- **Environment variables:** Set in Vercel dashboard

### Required

- `TARGET_PIPEDRIVE_API_TOKEN`
- `TIC_API_KEY`
- `PERPLEXITY_API_KEY`

### Optional

- `SCORING_API_KEY` (enables API authentication)
- `KV_REST_API_URL` (Upstash Redis)
- `KV_REST_API_TOKEN` (Upstash Redis)

---

## Known Architectural Issues

1. **Monolithic scoring pipeline:** `POST /api/score/pipedrive` performs all enrichment, scoring, and write-back in a single request. Company enrichment and person scoring are not independently callable.

2. **No company-only scoring:** The system always scores person + company together. There is no endpoint or function to score a company independently.

3. **Perplexity results not cached:** Re-queried on every request for persons without a role in Pipedrive.

4. **Enrichment couples read and write:** `CompanyEnricher.enrichCompany()` both fetches TIC data and writes to Pipedrive in the same operation.

5. **Field mapping cached in-memory only:** Resets on every cold start (serverless deployment).

6. **Revenue unit ambiguity:** TIC returns revenue in thousands SEK (`rs_NetSalesK`). The enricher converts to full SEK for Pipedrive storage. The scorer receives full SEK values from the enricher, which aligns with `revenueTiers` in config (defined in full SEK). However, when reading cached Pipedrive data directly, the units may differ.
