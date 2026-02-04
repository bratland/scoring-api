# Scoring Engine

Lead scoring service for persons and companies with TIC.io enrichment.

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run check    # Type checking
```

## Environment Variables

```bash
TARGET_PIPEDRIVE_API_TOKEN=  # Pipedrive API token
SCORING_API_KEY=             # API key for auth (optional)
TIC_API_KEY=                 # TIC.io API key for company enrichment
PERPLEXITY_API_KEY=          # Perplexity API for role detection
```

## Rate Limiting

The Pipedrive client includes built-in rate limiting:
- 80 requests per 2 seconds (Pipedrive limit)
- Minimum 50ms between requests
- Automatic backoff on 429 (2100ms)
- Max 3 retries with exponential backoff

Rate limit state is updated from response headers:
- `x-ratelimit-remaining`
- `x-ratelimit-reset`

## API Endpoints

### Scoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/score/pipedrive` | POST | Score person from Pipedrive and update record |
| `/api/score/person` | POST | Score single person with company context |
| `/api/score/bulk` | POST | Score multiple persons (max 1000) |
| `/api/score/config` | GET | View scoring configuration |

### Analysis

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analysis/activities-weekly` | GET | Activities per week (last 3 months) |
| `/api/analysis/activities-per-user` | GET | Activities per sales rep |
| `/api/analysis/scoring-summary` | GET | Score distribution per tier |

## Scoring Model

### Person Score (60% of total)
- Role/Function: 40%
- Relationship Strength: 30%
- Engagement (activities): 30%

### Company Score (40% of total)
- Revenue: 25%
- Growth (CAGR): 20%
- Industry Fit: 20%
- Distance to Gothenburg: 20%
- Existing Score: 15%

### Tiers
- **GOLD**: Combined score >= 70
- **SILVER**: Combined score 40-69
- **BRONZE**: Combined score < 40

## Pages

- `/` - Dashboard with navigation and scoring test
- `/customers` - View all organizations with TIC enrichment data
- `/persons` - View all contact persons with scores
- `/icp` - ICP Editor for configuring scoring weights
- `/docs` - API documentation
- `/analysis` - Analysis dashboard with scoring overview and engagement analytics

## TIC.io Integration

### CRITICAL: Caching Requirement

**We have 1000 API calls/month. Every TIC request MUST be cached.**

Rules:
1. NEVER call TIC API without checking cache first
2. Cache TIC responses in Pipedrive organization fields
3. Store `TIC Uppdaterad` timestamp to track freshness
4. Default cache TTL: 7 days (configurable)
5. Batch operations must deduplicate org lookups

## OpenStreetMap Geocoding (Fallback)

Used when TIC doesn't have coordinates. Calculates distance to Gothenburg from city name.

### Caching Strategy
- **Pre-populated cache**: 50+ Swedish cities with coordinates (no API call needed)
- **Runtime cache**: Stores all geocoded results in memory
- **Pipedrive cache**: Store coordinates in TIC Latitude/Longitude fields

### Rate Limits
Nominatim is free but heavily rate-limited (1 req/sec). The pre-populated cache
covers most Swedish cities to minimize API calls.

### Priority for Distance Calculation
1. TIC coordinates (if available)
2. Cached geocoding result
3. Live Nominatim API call (last resort)

### TIC Data Used

| Data | TIC Field | Used For |
|------|-----------|----------|
| Revenue | `rs_NetSalesK` | Revenue Score |
| Employees | `fn_NumberOfEmployees` | Company size |
| Credit Score | Credit Score | Existing Score |
| SNI Code | SNI codes | Industry Score |
| Coordinates | Workplace location | Distance Score |

### TIC Client Implementation

```typescript
// src/lib/tic/client.ts
// All methods MUST check Pipedrive cache before calling TIC API
class TicClient {
  async getCompanyData(orgNumber: string, cachedData?: CachedTicData): Promise<TicCompanyData>
  // Returns cached data if fresh, otherwise fetches from TIC
}
```

### Pipedrive Cache Fields (Organization)

| Field | Description |
|-------|-------------|
| Organisationsnummer | Swedish org number (XXXXXX-XXXX) |
| TIC Company ID | TIC internal ID |
| TIC Omsättning | Cached revenue from TIC |
| TIC Anställda | Cached employee count |
| TIC Kreditbetyg | Cached credit score |
| TIC SNI | Cached industry code |
| TIC Lat/Long | Cached coordinates |
| TIC Uppdaterad | Cache timestamp |

## Configuration

Edit `src/lib/scoring/config.ts` to adjust:
- Weight distribution
- Tier thresholds
- Role scores
- Revenue tiers
- Target industries
- Distance tiers

## Deployment

Configured for Vercel. Environment variables must be set in Vercel dashboard.

Required Vercel env vars:
- `TARGET_PIPEDRIVE_API_TOKEN`
- `TIC_API_KEY`
- `PERPLEXITY_API_KEY`

Optional:
- `SCORING_API_KEY` (enables API authentication)
