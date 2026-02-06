# Requirements

Source of truth for all functional and non-functional requirements in the Scoring Engine.

---

## REQ-001: Lead Scoring Model

**Status:** Implemented

The system calculates a combined lead score (0-100) based on two independent dimensions:

### Person Score (60% of combined)

| Factor | Weight | Source |
|--------|--------|--------|
| Role/Function | 55% | Pipedrive field or Perplexity detection |
| Engagement (90 days) | 45% | Pipedrive activities, notes, mail, files |

### Company Score (40% of combined)

| Factor | Weight | Source |
|--------|--------|--------|
| Revenue | 25% | TIC.io financial data |
| Growth (CAGR) | 20% | TIC.io financial history |
| Industry Fit | 20% | TIC.io SNI code |
| Distance to Gothenburg | 20% | TIC.io coordinates / geocoding |
| Existing Score (credit) | 15% | TIC.io credit score |

### Tier Classification

| Tier | Threshold |
|------|-----------|
| GOLD | combined >= 70 |
| SILVER | combined >= 40 |
| BRONZE | combined < 40 |

---

## REQ-002: TIC.io Company Enrichment

**Status:** Implemented

The system enriches Pipedrive organizations with company data from TIC.io.

### Constraints

- **1,000 API calls/month** (hard limit from TIC subscription)
- Up to 3 TIC API calls per new company (search + financials + credit)
- Maximum ~333 new companies can be enriched per month

### Caching (mandatory)

All TIC data must be cached. Cache is checked in this order:

1. Pipedrive organization fields (TTL: 7 days)
2. Redis/Upstash KV (TTL: 7 days)
3. Development seed cache (hardcoded test data)
4. Live TIC API (last resort)

After a live fetch, results are stored in both Redis and Pipedrive.

---

## REQ-003: Role Detection via Perplexity

**Status:** Implemented

When a person has no role in Pipedrive's "Functions" field, the system uses Perplexity AI to detect their role via web search.

### Constraints

- Rate limit: 1 QPS, 50 requests/minute
- Model: `sonar-pro`
- Results are NOT cached (re-queried on every scoring request for persons without role)

### Known Gap

Perplexity results should be cached to avoid redundant API calls.

---

## REQ-004: Pipedrive Integration

**Status:** Implemented

The system reads person and organization data from Pipedrive, and writes back scoring results.

### Read Operations

- Person record (name, email, org_id, Functions field)
- Organization record (name, address, custom fields)
- Engagement data: activities, notes, mail messages, files (last 90 days)
- Field mappings (organization fields, person fields)

### Write Operations

- Person: Lead Tier, Lead Score
- Organization: TIC enrichment data (revenue, SNI, CAGR, distance, etc.)

### Rate Limits

- 80 requests per 2 seconds
- Minimum 50ms between requests
- Automatic backoff on 429 (2100ms wait)

---

## REQ-005: Distance Calculation

**Status:** Implemented

Distance from company location to Gothenburg is calculated using coordinates.

### Priority Order

1. TIC coordinates (from workplace data)
2. Pre-populated geocoding cache (50+ Swedish cities)
3. Runtime geocoding cache (in-memory)
4. Nominatim API (rate limit: 1 req/sec, free)

---

## REQ-006: API Endpoints

**Status:** Implemented

### Scoring Endpoints

| Endpoint | Auth | External Calls | Description |
|----------|------|----------------|-------------|
| `POST /api/score/person` | No | None | Pure scoring with pre-built inputs |
| `POST /api/score/bulk` | No | None | Bulk scoring (max 1000 items) |
| `POST /api/score/pipedrive` | API key | TIC, Perplexity, Pipedrive | Full enrichment + scoring pipeline |
| `GET /api/score/config` | No | None | View scoring configuration |

### Analysis Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/analysis/activities-weekly` | Activities per week (last 3 months) |
| `GET /api/analysis/activities-per-user` | Activities per sales rep |
| `GET /api/analysis/scoring-summary` | Score distribution per tier |

### UI Pages

| Page | Description |
|------|-------------|
| `/` | Dashboard with navigation and scoring test |
| `/customers` | Organizations with TIC enrichment data |
| `/persons` | Contact persons with scores |
| `/icp` | ICP Editor for scoring weights |
| `/docs` | API documentation |
| `/analysis` | Analysis dashboard |

---

## REQ-007: Company Pre-scoring

**Status:** Implemented

### Background

The current system scores a person and their company in a single monolithic request (`/api/score/pipedrive`). This couples person-level scoring to company enrichment, making TIC API budget uncontrollable. Every person-scoring triggers company enrichment, even for companies that would score low.

### Requirement

The endpoint `POST /api/score/company` evaluates a company in a single call:

1. **Read** existing data from Pipedrive org fields
2. **Fill gaps** via Perplexity (org number, city/distance, industry) - single API call
3. **Calculate preliminary score** from all available data
4. **Conditional TIC enrichment**: if preliminary score >= threshold (25) and the company has never been TIC-enriched → call TIC for financial data
5. **Calculate final score** with enriched data (if TIC was triggered)
6. **Write** score + reason + enriched data back to Pipedrive

### TIC Enrichment Decision

| Condition | TIC Called? |
|-----------|-------------|
| Preliminary score < 25 | No (below threshold) |
| TIC Uppdaterad field has a timestamp | No (already enriched) |
| No TIC API key configured | No |
| Score >= 25 AND never enriched AND identifier exists | Yes |

### Data Resolution (Perplexity)

When org number, city, or industry is missing in Pipedrive, a single Perplexity API call fetches all three. Results are stored back in Pipedrive for future use.

| Missing Data | Resolution |
|-------------|-----------|
| Org number | Perplexity web search → store in Pipedrive |
| City/Distance | Perplexity city → geocode (50+ cities cached) → distance |
| Industry | Perplexity industry description → store in Pipedrive |

### Scoring Pipeline (Full)

**Step 1 - Company Pre-score + Conditional Enrichment (`POST /api/score/company`):**
Single endpoint handles data resolution, scoring, and conditional TIC enrichment.

**Step 2 - Full Person Score (`POST /api/score/pipedrive`):**
Score a person using their role, engagement, and the company data. Only run for persons at companies that passed pre-scoring.

### Storage

All data is stored in **Pipedrive organization fields**.

| Field | Type | Description | Populated by |
|-------|------|-------------|--------------|
| Organisationsnummer | Text | Swedish org number (XXXXXX-XXXX) | Manual, Perplexity, or TIC |
| Omsattning | Monetary | Revenue in SEK | TIC enrichment or manual |
| CAGR 3Y | Number | Growth rate (decimal, e.g. 0.15) | TIC enrichment |
| Industry (Official) | Text | SNI description / industry | TIC, Perplexity, or manual |
| Avstand GBG | Number | Distance to Gothenburg in km | TIC, geocoding, or Perplexity |
| Antal anstallda | Number | Employee count | TIC enrichment or manual |
| Score | Number | Credit score (0-100) | TIC enrichment |
| Company Score | Number | Weighted company pre-score (0-100) | Pre-scoring endpoint |
| Company Score Reason | Text | Human-readable explanation (Swedish) | Pre-scoring endpoint |
| TIC Uppdaterad | Text | ISO timestamp of last TIC enrichment | Pre-scoring endpoint |

### Motivation

1. **TIC budget control**: Only companies scoring >= 25 preliminary get TIC enrichment (1000 calls/month)
2. **Smart data filling**: Perplexity fills missing org number, city, and industry in a single call
3. **Works with partial data**: Companies with no data still get a score from defaults
4. **Track enrichment**: TIC Uppdaterad field tracks which companies have been enriched and when
5. **Business visibility**: Score reason text gives salespeople an instant summary of the company

### Acceptance Criteria

- [x] Company can be scored independently without any person data
- [x] Missing data (org number, city, industry) filled via Perplexity
- [x] Distance resolved via geocoding or Perplexity fallback
- [x] TIC enrichment only triggered for companies scoring >= threshold
- [x] TIC enrichment skipped for already-enriched companies (TIC Uppdaterad exists)
- [x] Computed company score (0-100) stored in Pipedrive
- [x] Human-readable score reason in Swedish stored alongside score
- [x] Score handles missing data gracefully with sensible defaults
- [x] The company score calculation is identical to the company portion of the existing combined scorer
- [x] TIC enrichment timestamp tracked in Pipedrive
- [ ] Person scoring can use a pre-computed company score from Pipedrive

### Open Questions

- Should pre-scoring run on a schedule (n8n workflow) or be triggered manually?
- Should `/api/score/pipedrive` be updated to skip TIC enrichment when a fresh company pre-score already exists?
- Should the pre-score threshold (currently 25) be configurable via the ICP editor?
