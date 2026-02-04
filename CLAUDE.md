# Scoring API

Lead scoring service for persons and companies. Calculates Gold/Silver/Bronze tiers.

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run check    # Type checking
```

## Environment Variables

```bash
PIPEDRIVE_API_TOKEN=     # Pipedrive API token
SCORING_API_KEY=         # API key for authenticating requests
TIC_API_KEY=             # TIC.io API key for company data enrichment
KV_REST_API_URL=         # Upstash Redis URL (from Vercel KV)
KV_REST_API_TOKEN=       # Upstash Redis token (from Vercel KV)
```

## API Endpoints

### POST /api/score/pipedrive
Score a person from Pipedrive and update their record.

```json
{
  "person_id": 12345,
  "api_token": "optional-override"
}
```

### POST /api/score/person
Score a single person with company context.

```json
{
  "person": {
    "functions": ["CEO", "Sales"],
    "relationship_strength": "We know each other",
    "activities_90d": 10
  },
  "company": {
    "revenue": 15000000,
    "cagr_3y": 0.15,
    "score": 65,
    "industry": "Tech",
    "distance_km": 50
  }
}
```

### POST /api/score/bulk
Score multiple persons (max 1000).

### GET /api/score/config
View current scoring configuration.

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
- **GOLD**: Combined score ≥ 70
- **SILVER**: Combined score 40-69
- **BRONZE**: Combined score < 40

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
- `PIPEDRIVE_API_TOKEN`
- `SCORING_API_KEY`
- `TIC_API_KEY`
