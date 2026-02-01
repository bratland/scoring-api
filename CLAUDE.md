# Scoring API

Lead scoring service for persons and companies. Calculates Gold/Silver/Bronze tiers.

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run check    # Type checking
```

## API Endpoints

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
    "industry": "Tech"
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
- Revenue: 30%
- Growth (CAGR): 25%
- Industry Fit: 25%
- Existing Score: 20%

### Tiers
- **GOLD**: Combined score ≥ 70
- **SILVER**: Combined score 40-69
- **BRONZE**: Combined score < 40

## Configuration

Edit `src/lib/scoring/config.ts` to adjust:
- Weight distribution
- Tier thresholds
- Role scores
- Revenue tiers
- Target industries

## Deployment

Configured for Vercel. Push to GitHub and connect to Vercel for automatic deployments.
