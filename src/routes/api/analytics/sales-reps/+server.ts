/**
 * Sales Reps Analytics API Endpoint
 * Returns performance metrics for all sales representatives
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PipedriveClient } from '$lib/pipedrive/client';
import { calculateSalesRepPerformance, getLeaderboard } from '$lib/analytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;

	if (!apiToken) {
		return json({ error: 'Pipedrive API token not configured' }, { status: 500 });
	}

	try {
		const client = new PipedriveClient({ apiToken });

		// Get sort parameter
		const sortBy = url.searchParams.get('sortBy') as 'totalWonValue' | 'wonDeals' | 'winRate' || 'totalWonValue';
		const limit = parseInt(url.searchParams.get('limit') || '10', 10);

		// Fetch all data in parallel
		const [deals, usersResult] = await Promise.all([
			client.getAllDeals(),
			client.getUsers()
		]);

		const users = usersResult.data || [];

		// Calculate performance for all sales reps
		const performances = calculateSalesRepPerformance(deals, users);
		const leaderboard = getLeaderboard(performances, sortBy, limit);

		return json({
			success: true,
			data: {
				performances,
				leaderboard,
				generatedAt: new Date().toISOString()
			},
			meta: {
				totalDeals: deals.length,
				totalSalesReps: performances.length
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
