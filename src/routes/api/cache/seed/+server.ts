/**
 * Seed the Redis cache with pre-fetched TIC data
 *
 * POST /api/cache/seed
 * Requires x-api-key header
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { seedTicCache, isRedisConfigured } from '$lib/cache';
import { TIC_CACHE_SEED } from '$lib/tic';

function validateApiKey(request: Request): boolean {
	const apiKey = env.SCORING_API_KEY;
	if (!apiKey) return true;

	const providedKey = request.headers.get('x-api-key') ||
	                    request.headers.get('authorization')?.replace('Bearer ', '');

	return providedKey === apiKey;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!validateApiKey(request)) {
		return json({ error: 'Invalid or missing API key' }, { status: 401 });
	}

	if (!isRedisConfigured()) {
		return json({
			error: 'Redis not configured',
			help: 'Set KV_REST_API_URL and KV_REST_API_TOKEN environment variables'
		}, { status: 500 });
	}

	try {
		const count = await seedTicCache(TIC_CACHE_SEED);
		return json({
			success: true,
			message: `Seeded ${count} companies to Redis cache`,
			companies: Object.keys(TIC_CACHE_SEED)
		});
	} catch (error) {
		return json({
			error: 'Failed to seed cache',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

export const GET: RequestHandler = async () => {
	return json({
		configured: isRedisConfigured(),
		seedData: {
			companies: Object.keys(TIC_CACHE_SEED).length,
			orgNumbers: Object.keys(TIC_CACHE_SEED)
		}
	});
};
