/**
 * Single Sales Rep Analytics API Endpoint
 * Returns detailed performance metrics for a specific sales representative
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PipedriveClient } from '$lib/pipedrive/client';
import { calculateSalesRepPerformance, getSalesRepById } from '$lib/analytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;

	if (!apiToken) {
		return json({ error: 'Pipedrive API token not configured' }, { status: 500 });
	}

	const userId = parseInt(params.id, 10);
	if (isNaN(userId)) {
		return json({ error: 'Invalid user ID' }, { status: 400 });
	}

	try {
		const client = new PipedriveClient({ apiToken });

		// Fetch all data in parallel
		const [deals, usersResult] = await Promise.all([
			client.getAllDeals(),
			client.getUsers()
		]);

		const users = usersResult.data || [];

		// Calculate performance for all sales reps
		const performances = calculateSalesRepPerformance(deals, users);

		// Get specific sales rep
		const salesRep = getSalesRepById(performances, userId);

		if (!salesRep) {
			return json({ error: 'Sales rep not found' }, { status: 404 });
		}

		// Calculate rank
		const sortedByValue = [...performances].sort((a, b) => b.totalWonValue - a.totalWonValue);
		const rankByValue = sortedByValue.findIndex(p => p.userId === userId) + 1;

		const sortedByWinRate = [...performances]
			.filter(p => p.wonDeals + p.lostDeals >= 5) // Only include reps with enough deals
			.sort((a, b) => b.winRate - a.winRate);
		const rankByWinRate = sortedByWinRate.findIndex(p => p.userId === userId) + 1;

		return json({
			success: true,
			data: {
				...salesRep,
				rankByValue,
				rankByWinRate: rankByWinRate > 0 ? rankByWinRate : null,
				totalSalesReps: performances.length,
				generatedAt: new Date().toISOString()
			}
		});
	} catch (error) {
		console.error('Failed to fetch sales rep analytics:', error);
		return json(
			{
				error: 'Failed to fetch sales rep analytics',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
