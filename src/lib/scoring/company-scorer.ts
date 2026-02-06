import { SCORING_CONFIG } from './config';
import type { CompanyInput } from './scorer';

export type { CompanyInput } from './scorer';

/**
 * Breakdown of individual company factor scores (0-100 each)
 */
export interface CompanyScoreBreakdown {
	revenue_score: number;
	growth_score: number;
	industry_score: number;
	distance_score: number;
	existing_score: number;
}

/**
 * Result of company-only scoring
 */
export interface CompanyScoreResult {
	/** Weighted company score (0-100) */
	company_score: number;
	/** Human-readable explanation in Swedish */
	reason: string;
	/** Individual factor scores */
	breakdown: CompanyScoreBreakdown;
	/** Which input factors had data */
	factors_used: string[];
	/** Warnings for missing data */
	warnings: string[];
}

// --- Helper functions (replicated from scorer.ts to keep company-scorer independent) ---

function findTierScore(value: number, tiers: { min: number; score: number }[]): number {
	for (const tier of tiers) {
		if (value >= tier.min) {
			return tier.score;
		}
	}
	return tiers[tiers.length - 1].score;
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
	const isTarget = SCORING_CONFIG.targetIndustries.some(
		target => normalizedIndustry.includes(target.toLowerCase())
	);
	return isTarget ? 90 : 50;
}

function calculateDistanceScore(distance_km: number | undefined): number {
	if (distance_km === undefined || distance_km === null) return 50;
	for (const tier of SCORING_CONFIG.distanceTiers) {
		if (distance_km <= tier.max) {
			return tier.score;
		}
	}
	return SCORING_CONFIG.distanceTiers[SCORING_CONFIG.distanceTiers.length - 1].score;
}

function formatRevenue(revenue: number): string {
	if (revenue >= 1_000_000) {
		return `${Math.round(revenue / 1_000_000)} MSEK`;
	}
	return `${Math.round(revenue / 1_000)} TSEK`;
}

function generateCompanyScoreReason(
	score: number,
	breakdown: CompanyScoreBreakdown,
	company: CompanyInput,
	factorsUsed: string[]
): string {
	const parts: string[] = [];

	if (score >= 70) {
		parts.push('Starkt företag:');
	} else if (score >= 40) {
		parts.push('Medelstarkt företag:');
	} else {
		parts.push('Svagare företag:');
	}

	const details: string[] = [];

	if (company.revenue !== undefined) {
		const revenueStr = formatRevenue(company.revenue);
		if (breakdown.revenue_score >= 80) {
			details.push(`hög omsättning (${revenueStr})`);
		} else if (breakdown.revenue_score >= 50) {
			details.push(`omsättning ${revenueStr}`);
		} else {
			details.push(`låg omsättning (${revenueStr})`);
		}
	}

	if (company.industry && factorsUsed.includes('industry')) {
		if (breakdown.industry_score >= 80) {
			details.push(`prioriterad bransch (${company.industry})`);
		} else {
			details.push(`bransch: ${company.industry}`);
		}
	}

	if (company.cagr_3y !== undefined) {
		const growthPercent = Math.round(company.cagr_3y * 100);
		if (breakdown.growth_score >= 80) {
			details.push(`stark tillväxt (${growthPercent}%)`);
		} else if (breakdown.growth_score <= 30) {
			details.push(`negativ tillväxt (${growthPercent}%)`);
		}
	}

	if (company.distance_km !== undefined) {
		if (breakdown.distance_score >= 80) {
			details.push(`nära (${Math.round(company.distance_km)} km)`);
		} else if (breakdown.distance_score <= 30) {
			details.push(`långt avstånd (${Math.round(company.distance_km)} km)`);
		}
	}

	if (details.length > 0) {
		parts.push(details.join(', ') + '.');
	}

	return parts.join(' ');
}

export function calculateCompanyScore(company: CompanyInput): CompanyScoreResult {
	const warnings: string[] = [];
	const factorsUsed: string[] = [];

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

	if (company.revenue === undefined) {
		warnings.push('No revenue data - using default score');
	}

	const companyScore = Math.round(
		revenueScore * SCORING_CONFIG.companyFactors.revenue +
		growthScore * SCORING_CONFIG.companyFactors.growth +
		industryScore * SCORING_CONFIG.companyFactors.industryFit +
		distanceScore * SCORING_CONFIG.companyFactors.distance +
		existingScore * SCORING_CONFIG.companyFactors.existingScore
	);

	const breakdown: CompanyScoreBreakdown = {
		revenue_score: revenueScore,
		growth_score: growthScore,
		industry_score: industryScore,
		distance_score: distanceScore,
		existing_score: existingScore
	};

	const reason = generateCompanyScoreReason(companyScore, breakdown, company, factorsUsed);

	return {
		company_score: companyScore,
		reason,
		breakdown,
		factors_used: factorsUsed,
		warnings
	};
}
