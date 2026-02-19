/**
 * Batch Distance Calculation
 *
 * Calculates distance to Gothenburg for all organizations and stores in Pipedrive.
 * Uses three geocoding strategies in priority order:
 * 1. Pre-cached Swedish cities (instant, free)
 * 2. Google Maps Geocoding API on full address (fast, ~$5/1000 req)
 * 3. Nominatim fallback on city name (slow, 1 req/sec)
 *
 * Streams progress as NDJSON so the request doesn't time out on large datasets.
 */

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { PipedriveClient } from '$lib/pipedrive/client';
import { geocodeCity, geocodeAddress, isCityInCache, addToCache } from '$lib/geo';
import type { GeocodingResult } from '$lib/geo';
import { distanceToGothenburg } from '$lib/tic';
import { DEFAULT_TIC_FIELD_NAMES } from '$lib/enrichment';
import { json } from '@sveltejs/kit';

// Countries, regions, and other non-city values to filter out
const NON_CITY_VALUES = new Set([
	'sweden', 'sverige', 'norway', 'norge', 'denmark', 'danmark', 'finland',
	'germany', 'deutschland', 'uk', 'united kingdom', 'usa', 'united states',
	'france', 'spain', 'italy', 'israel', 'netherlands', 'holland',
	'north holland', 'south holland', 'ca', 'ny', 'tx',
	'västra götaland county', 'vastra gotaland county', 'västra götaland', 'vastra gotaland',
	'stockholms län', 'skåne län', 'paphos district', 'cyprus',
]);

function isValidCity(value: string): boolean {
	if (!value || value.length < 2) return false;
	if (/^\d+$/.test(value)) return false; // Pure numbers
	if (NON_CITY_VALUES.has(value.toLowerCase())) return false;
	if (/^[A-Z]{2}$/.test(value)) return false; // Two-letter codes (CA, NY, etc.)
	return true;
}

function extractCityFromAddress(address: string | null | undefined): string | null {
	if (!address) return null;

	const parts = address.split(',').map(p => p.trim());

	// Match Swedish postal codes (5 digits) followed by city name
	for (const part of parts) {
		const postalMatch = part.match(/^\d{3}\s?\d{2}\s+(.+)/);
		if (postalMatch) {
			const city = postalMatch[1].trim();
			if (isValidCity(city)) return city;
		}
	}

	// Try the part before the last (typically city before country)
	if (parts.length >= 2) {
		const beforeCountry = parts[parts.length - 2]?.trim();
		if (isValidCity(beforeCountry)) {
			return beforeCountry;
		}
	}

	// Fallback: try the 4th part (index 3)
	if (parts.length >= 4) {
		const candidate = parts[3]?.trim();
		if (isValidCity(candidate)) {
			return candidate;
		}
	}

	return null;
}

async function getDistanceFieldKey(client: PipedriveClient): Promise<string | null> {
	const fieldsResult = await client.getOrganizationFields();
	if (!fieldsResult.success || !fieldsResult.data) return null;

	const targetName = DEFAULT_TIC_FIELD_NAMES.distanceGbg.toLowerCase();
	for (const field of fieldsResult.data) {
		if (field.name.toLowerCase() === targetName) {
			return field.key;
		}
	}
	return null;
}

/**
 * Try to geocode an org using all available strategies.
 * Returns coordinates or null.
 */
async function geocodeOrg(
	address: string | null,
	city: string | null,
	googleApiKey: string | null
): Promise<{ result: GeocodingResult; source: string } | null> {
	// Strategy 1: Cached city lookup (instant, free)
	if (city && isCityInCache(city)) {
		const result = await geocodeCity(city);
		if (result) return { result, source: 'cache' };
	}

	// Strategy 2: Google Maps on full address (fast)
	if (address && googleApiKey) {
		const result = await geocodeAddress(address, { apiKey: googleApiKey });
		if (result) {
			// Cache the result by city name for future lookups
			if (result.city) {
				addToCache(result.city, result);
			}
			return { result, source: 'google' };
		}
	}

	// Strategy 3: Nominatim on city name (slow, 1 req/sec)
	if (city) {
		const result = await geocodeCity(city);
		if (result) return { result, source: 'nominatim' };
	}

	return null;
}

export const POST: RequestHandler = async ({ request }) => {
	const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;
	if (!apiToken) {
		return json({ error: 'No Pipedrive API token configured' }, { status: 500 });
	}

	let forceRecalculate = false;
	let cacheOnly = false;
	try {
		const body = await request.json();
		forceRecalculate = body.forceRecalculate ?? false;
		cacheOnly = body.cacheOnly ?? false;
	} catch {
		// Empty body is fine
	}

	const googleApiKey = env.GOOGLE_MAPS_API_KEY || null;

	const client = new PipedriveClient({ apiToken });
	const distanceFieldKey = await getDistanceFieldKey(client);

	if (!distanceFieldKey) {
		return json({ error: 'Could not find "Avstånd GBG" field in Pipedrive' }, { status: 500 });
	}

	// Stream NDJSON progress
	const stream = new ReadableStream({
		async start(controller) {
			const send = (data: Record<string, unknown>) => {
				controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + '\n'));
			};

			try {
				// Fetch all organizations
				send({ type: 'status', message: 'Fetching organizations from Pipedrive...' });
				const allOrgs = await client.getAllOrganizations();
				send({
					type: 'status',
					message: `Found ${allOrgs.length} organizations`,
					total: allOrgs.length,
					googleMaps: !!googleApiKey,
					cacheOnly
				});

				let updated = 0;
				let skipped = 0;
				let noAddress = 0;
				let geocodeFailed = 0;
				const sourceCounts = { cache: 0, google: 0, nominatim: 0 };

				for (let i = 0; i < allOrgs.length; i++) {
					const org = allOrgs[i];
					const orgData = org as Record<string, unknown>;
					const existingDistance = orgData[distanceFieldKey] as number | null;

					// Skip if already has distance and not forcing
					if (existingDistance && !forceRecalculate) {
						skipped++;
						if ((i + 1) % 100 === 0) {
							send({ type: 'progress', processed: i + 1, total: allOrgs.length, updated, skipped, noAddress, geocodeFailed, sources: sourceCounts });
						}
						continue;
					}

					const address = orgData.address as string | null;
					const city = extractCityFromAddress(address);

					// In cacheOnly mode, only use cached cities
					if (cacheOnly) {
						if (!city || !isCityInCache(city)) {
							if (city) {
								geocodeFailed++;
							} else {
								noAddress++;
							}
							continue;
						}
						const geoResult = await geocodeCity(city);
						if (!geoResult) {
							geocodeFailed++;
							continue;
						}
						const distance = Math.round(distanceToGothenburg(geoResult.latitude, geoResult.longitude));
						await client.updateOrganization(org.id, { [distanceFieldKey]: distance });
						updated++;
						sourceCounts.cache++;
						send({ type: 'updated', orgId: org.id, name: org.name, city, distance, source: 'cache' });
						continue;
					}

					// Full mode: try all geocoding strategies
					if (!address && !city) {
						noAddress++;
						continue;
					}

					const geo = await geocodeOrg(address, city, googleApiKey);
					if (!geo) {
						geocodeFailed++;
						send({ type: 'geocode_failed', orgId: org.id, name: org.name, address: address?.substring(0, 80) });
						continue;
					}

					const distance = Math.round(distanceToGothenburg(geo.result.latitude, geo.result.longitude));
					sourceCounts[geo.source as keyof typeof sourceCounts]++;

					await client.updateOrganization(org.id, {
						[distanceFieldKey]: distance
					});

					updated++;
					send({ type: 'updated', orgId: org.id, name: org.name, city: geo.result.city || city, distance, source: geo.source });

					// Progress every 100
					if ((i + 1) % 100 === 0) {
						send({ type: 'progress', processed: i + 1, total: allOrgs.length, updated, skipped, noAddress, geocodeFailed, sources: sourceCounts });
					}
				}

				send({
					type: 'done',
					total: allOrgs.length,
					updated,
					skipped,
					noAddress,
					geocodeFailed,
					sources: sourceCounts
				});
			} catch (error) {
				send({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
			}

			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Transfer-Encoding': 'chunked'
		}
	});
};

export const GET: RequestHandler = async () => {
	return json({
		endpoint: 'POST /api/batch/distance',
		description: 'Calculate distance to Gothenburg for all organizations',
		options: {
			forceRecalculate: 'boolean (default: false) - Recalculate even if distance already exists',
			cacheOnly: 'boolean (default: false) - Only use pre-cached cities (no API calls)'
		},
		notes: [
			'Streams progress as NDJSON - each line is a JSON object',
			'Geocoding priority: 1) Pre-cached cities, 2) Google Maps API, 3) Nominatim',
			'Google Maps requires GOOGLE_MAPS_API_KEY env var',
			'Skips orgs that already have distance unless forceRecalculate=true'
		]
	});
};
