import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Redis } from '@upstash/redis';
import { SCORING_CONFIG } from '$lib/scoring/config';
import type { RequestHandler } from './$types';

const ICP_CONFIG_KEY = 'icp:config';

interface ICPConfig {
	weights: {
		person: number;
		company: number;
	};
	tiers: {
		gold: number;
		silver: number;
	};
	personFactors: {
		role: number;
		relationship: number;
		engagement: number;
	};
	companyFactors: {
		revenue: number;
		growth: number;
		industryFit: number;
		distance: number;
		existingScore: number;
	};
	roleScores: Record<string, number>;
	relationshipScores: Record<string, number>;
	industryTiers: Array<{ name: string; score: number; industries: string[] }>;
	defaultIndustryScore: number;
	revenueTiers: Array<{ min: number; score: number }>;
	growthTiers: Array<{ min: number; score: number }>;
	engagementTiers: Array<{ min: number; score: number }>;
	distanceTiers: Array<{ max: number; score: number }>;
}

function getRedis(): Redis | null {
	const url = env.KV_REST_API_URL;
	const token = env.KV_REST_API_TOKEN;

	if (!url || !token) {
		return null;
	}

	return new Redis({ url, token });
}

/**
 * GET - Retrieve current ICP configuration
 * Returns saved config or default SCORING_CONFIG
 */
export const GET: RequestHandler = async () => {
	const redis = getRedis();

	if (redis) {
		try {
			const saved = await redis.get<ICPConfig>(ICP_CONFIG_KEY);
			if (saved) {
				return json({
					config: saved,
					source: 'saved',
					lastModified: await redis.get<string>(`${ICP_CONFIG_KEY}:modified`)
				});
			}
		} catch (error) {
			console.error('Failed to load ICP config from Redis:', error);
		}
	}

	// Return default config
	return json({
		config: SCORING_CONFIG,
		source: 'default',
		lastModified: null
	});
};

/**
 * POST - Save ICP configuration
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const config: ICPConfig = await request.json();

		// Validate weights sum to 1.0
		if (Math.abs(config.weights.person + config.weights.company - 1.0) > 0.01) {
			return json({ error: 'Weights must sum to 1.0' }, { status: 400 });
		}

		const personFactorSum = config.personFactors.role + config.personFactors.relationship + config.personFactors.engagement;
		if (Math.abs(personFactorSum - 1.0) > 0.01) {
			return json({ error: 'Person factors must sum to 1.0' }, { status: 400 });
		}

		const companyFactorSum = Object.values(config.companyFactors).reduce((a, b) => a + b, 0);
		if (Math.abs(companyFactorSum - 1.0) > 0.01) {
			return json({ error: 'Company factors must sum to 1.0' }, { status: 400 });
		}

		// Validate tier thresholds
		if (config.tiers.gold <= config.tiers.silver) {
			return json({ error: 'Gold threshold must be greater than silver' }, { status: 400 });
		}

		const redis = getRedis();
		if (!redis) {
			return json({ error: 'Redis not configured' }, { status: 500 });
		}

		const now = new Date().toISOString();
		await redis.set(ICP_CONFIG_KEY, config);
		await redis.set(`${ICP_CONFIG_KEY}:modified`, now);

		return json({
			success: true,
			message: 'ICP configuration saved',
			lastModified: now
		});
	} catch (error) {
		console.error('Failed to save ICP config:', error);
		return json(
			{ error: 'Failed to save configuration', details: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};

/**
 * DELETE - Reset to default configuration
 */
export const DELETE: RequestHandler = async () => {
	const redis = getRedis();
	if (!redis) {
		return json({ error: 'Redis not configured' }, { status: 500 });
	}

	try {
		await redis.del(ICP_CONFIG_KEY);
		await redis.del(`${ICP_CONFIG_KEY}:modified`);

		return json({
			success: true,
			message: 'ICP configuration reset to defaults'
		});
	} catch (error) {
		console.error('Failed to reset ICP config:', error);
		return json({ error: 'Failed to reset configuration' }, { status: 500 });
	}
};
