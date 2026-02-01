/**
 * Scoring Configuration
 * Adjust weights and thresholds to fine-tune the scoring model
 */

export const SCORING_CONFIG = {
	// Weight distribution between person and company scores
	weights: {
		person: 0.6,
		company: 0.4
	},

	// Tier thresholds (combined score)
	tiers: {
		gold: 70,
		silver: 40
		// Below silver = bronze
	},

	// Person scoring weights (must sum to 1.0)
	personFactors: {
		role: 0.4,
		relationship: 0.3,
		engagement: 0.3
	},

	// Company scoring weights (must sum to 1.0)
	companyFactors: {
		revenue: 0.3,
		growth: 0.25,
		industryFit: 0.25,
		existingScore: 0.2
	},

	// Role scores (0-100)
	roleScores: {
		'CEO': 100,
		'Board': 95,
		'Entrepreneur': 90,
		'Finance': 85,
		'HR': 85,
		'Sales': 80,
		'Operations': 75,
		'Technology': 75,
		'Development': 70,
		'Projects': 70,
		'Production': 65,
		'Procurement': 65,
		'Legal': 60,
		'Communications': 60,
		'Logistics': 55,
		'Health': 50,
		'None': 30
	} as Record<string, number>,

	// Relationship strength scores (0-100)
	relationshipScores: {
		'We know each other': 100,
		'We\'ve heard of each other': 60,
		'Weak': 30
	} as Record<string, number>,

	// Revenue tiers (SEK) and their scores
	revenueTiers: [
		{ min: 100_000_000, score: 100 },  // > 100 MSEK
		{ min: 50_000_000, score: 85 },    // 50-100 MSEK
		{ min: 20_000_000, score: 70 },    // 20-50 MSEK
		{ min: 10_000_000, score: 55 },    // 10-20 MSEK
		{ min: 5_000_000, score: 40 },     // 5-10 MSEK
		{ min: 2_000_000, score: 25 },     // 2-5 MSEK
		{ min: 0, score: 10 }              // < 2 MSEK
	],

	// Growth (CAGR) scoring
	growthTiers: [
		{ min: 0.20, score: 100 },   // > 20% growth
		{ min: 0.15, score: 85 },    // 15-20%
		{ min: 0.10, score: 70 },    // 10-15%
		{ min: 0.05, score: 55 },    // 5-10%
		{ min: 0.00, score: 40 },    // 0-5%
		{ min: -0.10, score: 25 },   // -10% to 0%
		{ min: -Infinity, score: 10 } // < -10%
	],

	// Target industries (high fit = high score)
	targetIndustries: [
		'Tech',
		'IT',
		'Consulting',
		'Professional Services',
		'Software',
		'SaaS'
	],

	// Engagement scoring (activities in last 90 days)
	engagementTiers: [
		{ min: 20, score: 100 },
		{ min: 10, score: 80 },
		{ min: 5, score: 60 },
		{ min: 2, score: 40 },
		{ min: 1, score: 25 },
		{ min: 0, score: 10 }
	]
};

export type Tier = 'GOLD' | 'SILVER' | 'BRONZE';
