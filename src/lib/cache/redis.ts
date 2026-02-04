/**
 * Redis Cache for TIC data
 *
 * Uses Upstash Redis via Vercel KV integration.
 * Requires environment variables:
 * - KV_REST_API_URL
 * - KV_REST_API_TOKEN
 */

import { Redis } from '@upstash/redis';
import { env } from '$env/dynamic/private';
import type { TicCompanyData } from '../tic/types';

// Cache TTL in seconds (7 days)
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

// Prefix for TIC cache keys
const TIC_CACHE_PREFIX = 'tic:company:';
const GEO_CACHE_PREFIX = 'geo:city:';

let redisClient: Redis | null = null;

/**
 * Get or create Redis client
 */
function getRedis(): Redis | null {
	if (redisClient) return redisClient;

	const url = env.KV_REST_API_URL;
	const token = env.KV_REST_API_TOKEN;

	if (!url || !token) {
		console.warn('Redis not configured - KV_REST_API_URL or KV_REST_API_TOKEN missing');
		return null;
	}

	redisClient = new Redis({ url, token });
	return redisClient;
}

/**
 * Get cached TIC company data
 */
export async function getTicCache(orgNumber: string): Promise<TicCompanyData | null> {
	const redis = getRedis();
	if (!redis) return null;

	try {
		const normalized = orgNumber.replace(/-/g, '');
		const key = `${TIC_CACHE_PREFIX}${normalized}`;
		const data = await redis.get<TicCompanyData>(key);
		return data;
	} catch (error) {
		console.error('Redis get error:', error);
		return null;
	}
}

/**
 * Set TIC company data in cache
 */
export async function setTicCache(
	orgNumber: string,
	data: TicCompanyData,
	ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<boolean> {
	const redis = getRedis();
	if (!redis) return false;

	try {
		const normalized = orgNumber.replace(/-/g, '');
		const key = `${TIC_CACHE_PREFIX}${normalized}`;
		await redis.set(key, data, { ex: ttlSeconds });
		return true;
	} catch (error) {
		console.error('Redis set error:', error);
		return false;
	}
}

/**
 * Get cached geocoding data for a city
 */
export async function getGeoCache(city: string): Promise<{ latitude: number; longitude: number } | null> {
	const redis = getRedis();
	if (!redis) return null;

	try {
		const normalized = city.toLowerCase().trim();
		const key = `${GEO_CACHE_PREFIX}${normalized}`;
		const data = await redis.get<{ latitude: number; longitude: number }>(key);
		return data;
	} catch (error) {
		console.error('Redis get error:', error);
		return null;
	}
}

/**
 * Set geocoding data in cache (long TTL - cities don't move)
 */
export async function setGeoCache(
	city: string,
	coords: { latitude: number; longitude: number }
): Promise<boolean> {
	const redis = getRedis();
	if (!redis) return false;

	try {
		const normalized = city.toLowerCase().trim();
		const key = `${GEO_CACHE_PREFIX}${normalized}`;
		// Cities don't move - cache for 1 year
		await redis.set(key, coords, { ex: 365 * 24 * 60 * 60 });
		return true;
	} catch (error) {
		console.error('Redis set error:', error);
		return false;
	}
}

/**
 * Check if Redis is configured and available
 */
export function isRedisConfigured(): boolean {
	return !!(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
}

/**
 * Seed the cache with pre-fetched data (run once after setup)
 */
export async function seedTicCache(data: Record<string, TicCompanyData>): Promise<number> {
	const redis = getRedis();
	if (!redis) return 0;

	let count = 0;
	for (const [orgNumber, companyData] of Object.entries(data)) {
		const success = await setTicCache(orgNumber, companyData);
		if (success) count++;
	}
	return count;
}
