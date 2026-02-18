import { SCORING_CONFIG, type Tier } from './config';

export interface PersonInput {
	functions?: string[];
	activities_90d?: number;
}

export interface CompanyInput {
	revenue?: number;
	cagr_3y?: number;
	score?: number;
	industry?: string;
	employees?: number;
	distance_km?: number;  // Distance to Gothenburg in km
}

export interface ScoreBreakdown {
	role_score: number;
	engagement_score: number;
	revenue_score: number;
	growth_score: number;
	industry_score: number;
	distance_score: number;
	existing_score: number;
}

export interface ScoringResult {
	person_score: number;
	company_score: number;
	combined_score: number;
	tier: Tier;
	breakdown: ScoreBreakdown;
	factors_used: string[];
	warnings: string[];
	reason: string;
}

function findTierScore(value: number, tiers: { min: number; score: number }[]): number {
	for (const tier of tiers) {
		if (value >= tier.min) {
			return tier.score;
		}
	}
	return tiers[tiers.length - 1].score;
}

function calculateRoleScore(functions: string[]): number {
	if (!functions || functions.length === 0) {
		return SCORING_CONFIG.roleScores['None'] || 30;
	}

	// Take the highest scoring role
	const scores = functions.map(f => SCORING_CONFIG.roleScores[f] || 40);
	return Math.max(...scores);
}

function calculateEngagementScore(activities: number | undefined): number {
	if (activities === undefined || activities === null) return 10;
	return findTierScore(activities, SCORING_CONFIG.engagementTiers);
}

function calculateRevenueScore(revenue: number | undefined): number {
	if (revenue === undefined || revenue === null) return 30;
	return findTierScore(revenue, SCORING_CONFIG.revenueTiers);
}

function calculateGrowthScore(cagr: number | undefined): number {
	if (cagr === undefined || cagr === null) return 40;
	return findTierScore(cagr, SCORING_CONFIG.growthTiers);
}

function calculateIndustryScore(industry: string | undefined): number {
	if (!industry) return 50;

	const normalizedIndustry = industry.toLowerCase();

	for (const tier of SCORING_CONFIG.industryTiers) {
		const isMatch = tier.industries.some(
			target => normalizedIndustry.includes(target.toLowerCase())
		);
		if (isMatch) return tier.score;
	}

	return SCORING_CONFIG.defaultIndustryScore;
}

function calculateDistanceScore(distance_km: number | undefined): number {
	if (distance_km === undefined || distance_km === null) return 50; // Unknown distance

	for (const tier of SCORING_CONFIG.distanceTiers) {
		if (distance_km <= tier.max) {
			return tier.score;
		}
	}
	return SCORING_CONFIG.distanceTiers[SCORING_CONFIG.distanceTiers.length - 1].score;
}

function determineTier(score: number): Tier {
	if (score >= SCORING_CONFIG.tiers.gold) return 'GOLD';
	if (score >= SCORING_CONFIG.tiers.silver) return 'SILVER';
	return 'BRONZE';
}

function formatRevenue(revenue: number): string {
	if (revenue >= 1_000_000) {
		return `${Math.round(revenue / 1_000_000)} MSEK`;
	}
	return `${Math.round(revenue / 1_000)} TSEK`;
}

function generateScoreReason(
	tier: Tier,
	breakdown: ScoreBreakdown,
	person: PersonInput,
	company: CompanyInput,
	factorsUsed: string[]
): string {
	const parts: string[] = [];

	// Tier summary
	parts.push(`${tier}:`);

	// Person factors
	const personParts: string[] = [];

	if (person.functions?.length) {
		const topRole = person.functions[0];
		if (breakdown.role_score >= 90) {
			personParts.push(`${topRole} (beslutsfattare)`);
		} else if (breakdown.role_score >= 70) {
			personParts.push(`${topRole}`);
		} else {
			personParts.push(`${topRole} (lägre prioritet)`);
		}
	} else {
		personParts.push('Roll saknas');
	}

	if (person.activities_90d !== undefined) {
		if (breakdown.engagement_score >= 80) {
			personParts.push(`hög aktivitet (${person.activities_90d} aktiviteter)`);
		} else if (breakdown.engagement_score >= 40) {
			personParts.push(`viss aktivitet (${person.activities_90d})`);
		} else {
			personParts.push('låg aktivitet');
		}
	}

	if (personParts.length > 0) {
		parts.push(personParts.join(', ') + '.');
	}

	// Company factors
	const companyParts: string[] = [];

	if (company.revenue !== undefined) {
		const revenueStr = formatRevenue(company.revenue);
		if (breakdown.revenue_score >= 80) {
			companyParts.push(`hög omsättning (${revenueStr})`);
		} else if (breakdown.revenue_score >= 50) {
			companyParts.push(`omsättning ${revenueStr}`);
		} else {
			companyParts.push(`låg omsättning (${revenueStr})`);
		}
	}

	if (company.industry && factorsUsed.includes('industry')) {
		if (breakdown.industry_score >= 80) {
			companyParts.push(`prioriterad bransch (${company.industry})`);
		} else {
			companyParts.push(`bransch: ${company.industry}`);
		}
	}

	if (company.cagr_3y !== undefined) {
		const growthPercent = Math.round(company.cagr_3y * 100);
		if (breakdown.growth_score >= 80) {
			companyParts.push(`stark tillväxt (${growthPercent}%)`);
		} else if (breakdown.growth_score <= 30) {
			companyParts.push(`negativ tillväxt (${growthPercent}%)`);
		}
	}

	if (company.distance_km !== undefined) {
		if (breakdown.distance_score >= 80) {
			companyParts.push(`nära (${Math.round(company.distance_km)} km)`);
		} else if (breakdown.distance_score <= 30) {
			companyParts.push(`långt avstånd (${Math.round(company.distance_km)} km)`);
		}
	}

	if (companyParts.length > 0) {
		parts.push('Företag: ' + companyParts.join(', ') + '.');
	}

	return parts.join(' ');
}

export function calculateScore(person: PersonInput, company: CompanyInput): ScoringResult {
	const warnings: string[] = [];
	const factorsUsed: string[] = [];

	// Calculate person scores
	const roleScore = calculateRoleScore(person.functions || []);
	if (person.functions?.length) factorsUsed.push('functions');

	const engagementScore = calculateEngagementScore(person.activities_90d);
	if (person.activities_90d !== undefined) factorsUsed.push('activities_90d');

	// Calculate company scores
	const revenueScore = calculateRevenueScore(company.revenue);
	if (company.revenue !== undefined) factorsUsed.push('revenue');

	const growthScore = calculateGrowthScore(company.cagr_3y);
	if (company.cagr_3y !== undefined) factorsUsed.push('cagr_3y');

	const industryScore = calculateIndustryScore(company.industry);
	if (company.industry) factorsUsed.push('industry');

	const distanceScore = calculateDistanceScore(company.distance_km);
	if (company.distance_km !== undefined) factorsUsed.push('distance_km');

	const existingScore = company.score ?? 50;
	if (company.score !== undefined) factorsUsed.push('company_score');

	// Warnings for missing important data
	if (!person.functions?.length) {
		warnings.push('No role/function provided - using default score');
	}
	if (company.revenue === undefined) {
		warnings.push('No revenue data - using default score');
	}

	// Calculate weighted person score
	const personScore = Math.round(
		roleScore * SCORING_CONFIG.personFactors.role +
		engagementScore * SCORING_CONFIG.personFactors.engagement
	);

	// Calculate weighted company score
	const companyScore = Math.round(
		revenueScore * SCORING_CONFIG.companyFactors.revenue +
		growthScore * SCORING_CONFIG.companyFactors.growth +
		industryScore * SCORING_CONFIG.companyFactors.industryFit +
		distanceScore * SCORING_CONFIG.companyFactors.distance +
		existingScore * SCORING_CONFIG.companyFactors.existingScore
	);

	// Calculate combined score
	const combinedScore = Math.round(
		personScore * SCORING_CONFIG.weights.person +
		companyScore * SCORING_CONFIG.weights.company
	);

	const tier = determineTier(combinedScore);

	const breakdown: ScoreBreakdown = {
		role_score: roleScore,
		engagement_score: engagementScore,
		revenue_score: revenueScore,
		growth_score: growthScore,
		industry_score: industryScore,
		distance_score: distanceScore,
		existing_score: existingScore
	};

	const reason = generateScoreReason(tier, breakdown, person, company, factorsUsed);

	return {
		person_score: personScore,
		company_score: companyScore,
		combined_score: combinedScore,
		tier,
		breakdown,
		factors_used: factorsUsed,
		warnings,
		reason
	};
}

export function calculateBulkScores(
	items: Array<{ person: PersonInput; company: CompanyInput; id?: string | number }>
): Array<ScoringResult & { id?: string | number }> {
	return items.map(item => ({
		...calculateScore(item.person, item.company),
		id: item.id
	}));
}
