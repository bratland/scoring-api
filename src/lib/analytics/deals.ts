/**
 * Deal Analytics Service
 * Aggregation functions for deal-based analytics
 */

import type { PipedriveDeal, PipedriveOrganization, PipedrivePipeline } from '$lib/pipedrive/client';
import { extractOrgId } from '$lib/pipedrive/client';
import type {
	DealOverview,
	ValueDistributionBucket,
	WinRateByPeriod,
	SalesCycleStats,
	CustomerRanking,
	PipelineDistribution
} from './types';

/**
 * Calculate overall deal statistics
 */
export function calculateDealOverview(deals: PipedriveDeal[]): DealOverview {
	const closedDeals = deals.filter(d => d.status === 'won' || d.status === 'lost');
	const wonDeals = deals.filter(d => d.status === 'won');

	const values = wonDeals.map(d => d.value || 0).filter(v => v > 0);
	const totalValue = values.reduce((sum, v) => sum + v, 0);
	const averageValue = values.length > 0 ? totalValue / values.length : 0;

	const sortedValues = [...values].sort((a, b) => a - b);
	const medianValue = sortedValues.length > 0
		? sortedValues.length % 2 === 0
			? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
			: sortedValues[Math.floor(sortedValues.length / 2)]
		: 0;

	const currency = wonDeals[0]?.currency || 'SEK';
	const valueDistribution = calculateValueDistribution(wonDeals);

	return {
		totalValue,
		averageValue,
		medianValue,
		dealCount: closedDeals.length,
		currency,
		valueDistribution
	};
}

/**
 * Calculate value distribution buckets
 */
function calculateValueDistribution(deals: PipedriveDeal[]): ValueDistributionBucket[] {
	const buckets: ValueDistributionBucket[] = [
		{ range: '0-50k', minValue: 0, maxValue: 50000, count: 0, totalValue: 0 },
		{ range: '50k-100k', minValue: 50000, maxValue: 100000, count: 0, totalValue: 0 },
		{ range: '100k-250k', minValue: 100000, maxValue: 250000, count: 0, totalValue: 0 },
		{ range: '250k-500k', minValue: 250000, maxValue: 500000, count: 0, totalValue: 0 },
		{ range: '500k-1M', minValue: 500000, maxValue: 1000000, count: 0, totalValue: 0 },
		{ range: '1M+', minValue: 1000000, maxValue: Infinity, count: 0, totalValue: 0 }
	];

	for (const deal of deals) {
		const value = deal.value || 0;
		for (const bucket of buckets) {
			if (value >= bucket.minValue && value < bucket.maxValue) {
				bucket.count++;
				bucket.totalValue += value;
				break;
			}
		}
	}

	return buckets.filter(b => b.count > 0);
}

/**
 * Calculate win rate by year
 */
export function calculateWinRateByYear(deals: PipedriveDeal[]): WinRateByPeriod[] {
	const byYear = new Map<number, { won: number; lost: number; open: number; wonValue: number; lostValue: number }>();

	for (const deal of deals) {
		let year: number;

		if (deal.status === 'won' && deal.won_time) {
			year = new Date(deal.won_time).getFullYear();
		} else if (deal.status === 'lost' && deal.lost_time) {
			year = new Date(deal.lost_time).getFullYear();
		} else if (deal.add_time) {
			year = new Date(deal.add_time).getFullYear();
		} else {
			continue;
		}

		if (!byYear.has(year)) {
			byYear.set(year, { won: 0, lost: 0, open: 0, wonValue: 0, lostValue: 0 });
		}

		const yearData = byYear.get(year)!;
		const value = deal.value || 0;

		if (deal.status === 'won') {
			yearData.won++;
			yearData.wonValue += value;
		} else if (deal.status === 'lost') {
			yearData.lost++;
			yearData.lostValue += value;
		} else if (deal.status === 'open') {
			yearData.open++;
		}
	}

	const results: WinRateByPeriod[] = [];
	for (const [year, data] of byYear) {
		const closed = data.won + data.lost;
		results.push({
			period: year.toString(),
			year,
			won: data.won,
			lost: data.lost,
			open: data.open,
			winRate: closed > 0 ? (data.won / closed) * 100 : 0,
			totalWonValue: data.wonValue,
			totalLostValue: data.lostValue
		});
	}

	return results.sort((a, b) => a.year - b.year);
}

/**
 * Calculate win rate by month for the last N months
 */
export function calculateWinRateByMonth(deals: PipedriveDeal[], months: number = 12): WinRateByPeriod[] {
	const now = new Date();
	const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

	const byMonth = new Map<string, { won: number; lost: number; open: number; wonValue: number; lostValue: number; year: number; month: number }>();

	for (const deal of deals) {
		let dealDate: Date;

		if (deal.status === 'won' && deal.won_time) {
			dealDate = new Date(deal.won_time);
		} else if (deal.status === 'lost' && deal.lost_time) {
			dealDate = new Date(deal.lost_time);
		} else if (deal.add_time) {
			dealDate = new Date(deal.add_time);
		} else {
			continue;
		}

		if (dealDate < cutoff) continue;

		const key = `${dealDate.getFullYear()}-${String(dealDate.getMonth() + 1).padStart(2, '0')}`;

		if (!byMonth.has(key)) {
			byMonth.set(key, {
				won: 0, lost: 0, open: 0, wonValue: 0, lostValue: 0,
				year: dealDate.getFullYear(),
				month: dealDate.getMonth() + 1
			});
		}

		const monthData = byMonth.get(key)!;
		const value = deal.value || 0;

		if (deal.status === 'won') {
			monthData.won++;
			monthData.wonValue += value;
		} else if (deal.status === 'lost') {
			monthData.lost++;
			monthData.lostValue += value;
		} else if (deal.status === 'open') {
			monthData.open++;
		}
	}

	const results: WinRateByPeriod[] = [];
	for (const [key, data] of byMonth) {
		const closed = data.won + data.lost;
		results.push({
			period: key,
			year: data.year,
			month: data.month,
			won: data.won,
			lost: data.lost,
			open: data.open,
			winRate: closed > 0 ? (data.won / closed) * 100 : 0,
			totalWonValue: data.wonValue,
			totalLostValue: data.lostValue
		});
	}

	return results.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Calculate sales cycle statistics for won deals
 */
export function calculateSalesCycle(deals: PipedriveDeal[]): SalesCycleStats {
	const wonDeals = deals.filter(d => d.status === 'won' && d.add_time && d.won_time);

	const cycleDays: number[] = [];
	for (const deal of wonDeals) {
		const addDate = new Date(deal.add_time);
		const wonDate = new Date(deal.won_time!);
		const days = Math.floor((wonDate.getTime() - addDate.getTime()) / (1000 * 60 * 60 * 24));
		if (days >= 0) {
			cycleDays.push(days);
		}
	}

	if (cycleDays.length === 0) {
		return {
			averageDays: 0,
			medianDays: 0,
			minDays: 0,
			maxDays: 0,
			sampleSize: 0
		};
	}

	const sortedDays = [...cycleDays].sort((a, b) => a - b);
	const averageDays = cycleDays.reduce((sum, d) => sum + d, 0) / cycleDays.length;
	const medianDays = sortedDays.length % 2 === 0
		? (sortedDays[sortedDays.length / 2 - 1] + sortedDays[sortedDays.length / 2]) / 2
		: sortedDays[Math.floor(sortedDays.length / 2)];

	return {
		averageDays: Math.round(averageDays),
		medianDays: Math.round(medianDays),
		minDays: sortedDays[0],
		maxDays: sortedDays[sortedDays.length - 1],
		sampleSize: cycleDays.length
	};
}

/**
 * Get top customers by won deal value
 */
export function getTopCustomers(
	deals: PipedriveDeal[],
	organizations: PipedriveOrganization[],
	limit: number = 10
): CustomerRanking[] {
	const orgMap = new Map<number, string>();
	for (const org of organizations) {
		orgMap.set(org.id, org.name);
	}

	const byOrg = new Map<number, { totalValue: number; wonDeals: number; currency: string }>();

	for (const deal of deals) {
		if (deal.status !== 'won') continue;

		const orgId = extractOrgId(deal.org_id);
		if (!orgId) continue;

		if (!byOrg.has(orgId)) {
			byOrg.set(orgId, { totalValue: 0, wonDeals: 0, currency: deal.currency || 'SEK' });
		}

		const orgData = byOrg.get(orgId)!;
		orgData.totalValue += deal.value || 0;
		orgData.wonDeals++;
	}

	const rankings: CustomerRanking[] = [];
	for (const [orgId, data] of byOrg) {
		rankings.push({
			orgId,
			orgName: orgMap.get(orgId) || `Organization #${orgId}`,
			totalWonValue: data.totalValue,
			wonDeals: data.wonDeals,
			averageDealSize: data.wonDeals > 0 ? data.totalValue / data.wonDeals : 0,
			currency: data.currency
		});
	}

	return rankings
		.sort((a, b) => b.totalWonValue - a.totalWonValue)
		.slice(0, limit);
}

/**
 * Get deal distribution by pipeline
 */
export function getPipelineDistribution(
	deals: PipedriveDeal[],
	pipelines: PipedrivePipeline[]
): PipelineDistribution[] {
	const pipelineMap = new Map<number, string>();
	for (const pipeline of pipelines) {
		pipelineMap.set(pipeline.id, pipeline.name);
	}

	const byPipeline = new Map<number, { count: number; value: number; won: number; lost: number; open: number }>();

	for (const deal of deals) {
		const pipelineId = deal.pipeline_id;
		if (!pipelineId) continue;

		if (!byPipeline.has(pipelineId)) {
			byPipeline.set(pipelineId, { count: 0, value: 0, won: 0, lost: 0, open: 0 });
		}

		const pipelineData = byPipeline.get(pipelineId)!;
		pipelineData.count++;
		pipelineData.value += deal.value || 0;

		if (deal.status === 'won') pipelineData.won++;
		else if (deal.status === 'lost') pipelineData.lost++;
		else if (deal.status === 'open') pipelineData.open++;
	}

	const results: PipelineDistribution[] = [];
	for (const [pipelineId, data] of byPipeline) {
		const closed = data.won + data.lost;
		results.push({
			pipelineId,
			pipelineName: pipelineMap.get(pipelineId) || `Pipeline #${pipelineId}`,
			dealCount: data.count,
			totalValue: data.value,
			wonCount: data.won,
			lostCount: data.lost,
			openCount: data.open,
			winRate: closed > 0 ? (data.won / closed) * 100 : 0
		});
	}

	return results.sort((a, b) => b.dealCount - a.dealCount);
}
