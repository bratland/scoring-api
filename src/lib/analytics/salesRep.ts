/**
 * Sales Rep Analytics Service
 * Performance calculations and leaderboard for sales representatives
 */

import type { PipedriveDeal, PipedriveUser } from '$lib/pipedrive/client';
import { extractUserId } from '$lib/pipedrive/client';
import type { SalesRepPerformance, MonthlyTrend } from './types';

/**
 * Calculate performance metrics for all sales reps
 */
export function calculateSalesRepPerformance(
	deals: PipedriveDeal[],
	users: PipedriveUser[]
): SalesRepPerformance[] {
	const userMap = new Map<number, string>();
	for (const user of users) {
		userMap.set(user.id, user.name);
	}

	const byUser = new Map<number, {
		wonDeals: PipedriveDeal[];
		lostDeals: PipedriveDeal[];
		openDeals: PipedriveDeal[];
		allDeals: PipedriveDeal[];
	}>();

	for (const deal of deals) {
		const userId = extractUserId(deal.user_id);
		if (!userId) continue;

		if (!byUser.has(userId)) {
			byUser.set(userId, { wonDeals: [], lostDeals: [], openDeals: [], allDeals: [] });
		}

		const userData = byUser.get(userId)!;
		userData.allDeals.push(deal);

		if (deal.status === 'won') userData.wonDeals.push(deal);
		else if (deal.status === 'lost') userData.lostDeals.push(deal);
		else if (deal.status === 'open') userData.openDeals.push(deal);
	}

	const performances: SalesRepPerformance[] = [];

	for (const [userId, data] of byUser) {
		const totalWonValue = data.wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
		const totalLostValue = data.lostDeals.reduce((sum, d) => sum + (d.value || 0), 0);
		const totalOpenValue = data.openDeals.reduce((sum, d) => sum + (d.value || 0), 0);

		const closedDeals = data.wonDeals.length + data.lostDeals.length;
		const winRate = closedDeals > 0 ? (data.wonDeals.length / closedDeals) * 100 : 0;

		const avgDealSize = data.wonDeals.length > 0
			? totalWonValue / data.wonDeals.length
			: 0;

		const avgSalesCycleDays = calculateAvgSalesCycle(data.wonDeals);
		const monthlyTrend = calculateMonthlyTrend(data.allDeals);
		const currency = data.allDeals[0]?.currency || 'SEK';

		performances.push({
			userId,
			userName: userMap.get(userId) || `User #${userId}`,
			wonDeals: data.wonDeals.length,
			lostDeals: data.lostDeals.length,
			openDeals: data.openDeals.length,
			totalDeals: data.allDeals.length,
			winRate: Math.round(winRate * 10) / 10,
			totalWonValue,
			totalLostValue,
			totalOpenValue,
			avgDealSize: Math.round(avgDealSize),
			avgSalesCycleDays,
			currency,
			monthlyTrend
		});
	}

	return performances;
}

/**
 * Calculate average sales cycle for won deals
 */
function calculateAvgSalesCycle(wonDeals: PipedriveDeal[]): number {
	const cycleDays: number[] = [];

	for (const deal of wonDeals) {
		if (!deal.add_time || !deal.won_time) continue;

		const addDate = new Date(deal.add_time);
		const wonDate = new Date(deal.won_time);
		const days = Math.floor((wonDate.getTime() - addDate.getTime()) / (1000 * 60 * 60 * 24));

		if (days >= 0) {
			cycleDays.push(days);
		}
	}

	if (cycleDays.length === 0) return 0;

	return Math.round(cycleDays.reduce((sum, d) => sum + d, 0) / cycleDays.length);
}

/**
 * Calculate monthly trend for a sales rep
 */
function calculateMonthlyTrend(deals: PipedriveDeal[], months: number = 12): MonthlyTrend[] {
	const now = new Date();
	const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

	const byMonth = new Map<string, MonthlyTrend>();

	// Initialize all months in range
	for (let i = 0; i < months; i++) {
		const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
		byMonth.set(key, {
			month: key,
			year: date.getFullYear(),
			monthNum: date.getMonth() + 1,
			wonValue: 0,
			wonDeals: 0,
			lostDeals: 0,
			newDeals: 0
		});
	}

	for (const deal of deals) {
		// Track won deals by won_time
		if (deal.status === 'won' && deal.won_time) {
			const wonDate = new Date(deal.won_time);
			if (wonDate >= cutoff) {
				const key = `${wonDate.getFullYear()}-${String(wonDate.getMonth() + 1).padStart(2, '0')}`;
				const monthData = byMonth.get(key);
				if (monthData) {
					monthData.wonValue += deal.value || 0;
					monthData.wonDeals++;
				}
			}
		}

		// Track lost deals by lost_time
		if (deal.status === 'lost' && deal.lost_time) {
			const lostDate = new Date(deal.lost_time);
			if (lostDate >= cutoff) {
				const key = `${lostDate.getFullYear()}-${String(lostDate.getMonth() + 1).padStart(2, '0')}`;
				const monthData = byMonth.get(key);
				if (monthData) {
					monthData.lostDeals++;
				}
			}
		}

		// Track new deals by add_time
		if (deal.add_time) {
			const addDate = new Date(deal.add_time);
			if (addDate >= cutoff) {
				const key = `${addDate.getFullYear()}-${String(addDate.getMonth() + 1).padStart(2, '0')}`;
				const monthData = byMonth.get(key);
				if (monthData) {
					monthData.newDeals++;
				}
			}
		}
	}

	return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Get leaderboard sorted by won value
 */
export function getLeaderboard(
	performances: SalesRepPerformance[],
	sortBy: 'totalWonValue' | 'wonDeals' | 'winRate' = 'totalWonValue',
	limit: number = 10
): SalesRepPerformance[] {
	const sorted = [...performances].sort((a, b) => {
		switch (sortBy) {
			case 'totalWonValue':
				return b.totalWonValue - a.totalWonValue;
			case 'wonDeals':
				return b.wonDeals - a.wonDeals;
			case 'winRate':
				// Only compare win rate if both have enough deals
				const aRelevant = a.wonDeals + a.lostDeals >= 5;
				const bRelevant = b.wonDeals + b.lostDeals >= 5;
				if (aRelevant && bRelevant) return b.winRate - a.winRate;
				if (aRelevant) return -1;
				if (bRelevant) return 1;
				return b.winRate - a.winRate;
			default:
				return b.totalWonValue - a.totalWonValue;
		}
	});

	return sorted.slice(0, limit);
}

/**
 * Get performance for a single sales rep
 */
export function getSalesRepById(
	performances: SalesRepPerformance[],
	userId: number
): SalesRepPerformance | null {
	return performances.find(p => p.userId === userId) || null;
}
