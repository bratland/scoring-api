/**
 * Analytics Overview API Endpoint
 * Returns aggregated deal analytics for ICP Insights dashboard
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PipedriveClient } from '$lib/pipedrive/client';
import {
	calculateDealOverview,
	calculateWinRateByYear,
	calculateSalesCycle,
	getTopCustomers,
	getPipelineDistribution
} from '$lib/analytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;

	if (!apiToken) {
		return json({ error: 'Pipedrive API token not configured' }, { status: 500 });
	}

	try {
		const client = new PipedriveClient({ apiToken });

		// Fetch all data in parallel for performance
		const [deals, pipelinesResult, organizations] = await Promise.all([
			client.getAllDeals(),
			client.getPipelines(),
			client.getAllOrganizations()
		]);

		const pipelines = pipelinesResult.data || [];

		// Calculate all analytics
		const dealOverview = calculateDealOverview(deals);
		const winRateByYear = calculateWinRateByYear(deals);
		const salesCycle = calculateSalesCycle(deals);
		const topCustomers = getTopCustomers(deals, organizations, 10);
		const pipelineDistribution = getPipelineDistribution(deals, pipelines);

		return json({
			success: true,
			data: {
				dealOverview,
				winRateByYear,
				salesCycle,
				topCustomers,
				pipelineDistribution,
				generatedAt: new Date().toISOString()
			},
			meta: {
				totalDeals: deals.length,
				totalOrganizations: organizations.length,
				totalPipelines: pipelines.length
			}
		});
	} catch (error) {
		console.error('Failed to fetch analytics overview:', error);
		return json(
			{
				error: 'Failed to fetch analytics overview',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
