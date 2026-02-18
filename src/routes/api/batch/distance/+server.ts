/**
 * Batch Distance Calculation
 *
 * Calculates distance to Gothenburg for all organizations and stores in Pipedrive.
 * No TIC or Perplexity API calls - uses only geocoding (pre-cached + Nominatim fallback).
 *
 * Streams progress as NDJSON so the request doesn't time out on large datasets.
 */

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { PipedriveClient } from '$lib/pipedrive/client';
import { geocodeCity, isCityInCache } from '$lib/geo';
import { distanceToGothenburg } from '$lib/tic';
import { DEFAULT_TIC_FIELD_NAMES, type TicFieldMapping } from '$lib/enrichment';
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
				send({ type: 'status', message: `Found ${allOrgs.length} organizations`, total: allOrgs.length });

				let updated = 0;
				let skipped = 0;
				let noAddress = 0;
				let geocodeFailed = 0;

				for (let i = 0; i < allOrgs.length; i++) {
					const org = allOrgs[i];
					const orgData = org as Record<string, unknown>;
					const existingDistance = orgData[distanceFieldKey] as number | null;

					// Skip if already has distance and not forcing
					if (existingDistance && !forceRecalculate) {
						skipped++;
						if ((i + 1) % 100 === 0) {
							send({ type: 'progress', processed: i + 1, total: allOrgs.length, updated, skipped, noAddress, geocodeFailed });
						}
						continue;
					}

					const address = orgData.address as string | null;
					const city = extractCityFromAddress(address);

					if (!city) {
						noAddress++;
						continue;
					}

					// In cacheOnly mode, skip cities not in pre-populated cache
					if (cacheOnly && !isCityInCache(city)) {
						geocodeFailed++;
						send({ type: 'not_cached', orgId: org.id, name: org.name, city });
						continue;
					}

					const geoResult = await geocodeCity(city);
					if (!geoResult) {
						geocodeFailed++;
						send({ type: 'geocode_failed', orgId: org.id, name: org.name, city });
						continue;
					}

					const distance = Math.round(distanceToGothenburg(geoResult.latitude, geoResult.longitude));

					await client.updateOrganization(org.id, {
						[distanceFieldKey]: distance
					});

					updated++;

					// Log every update
					send({ type: 'updated', orgId: org.id, name: org.name, city, distance });

					// Progress every 100
					if ((i + 1) % 100 === 0) {
						send({ type: 'progress', processed: i + 1, total: allOrgs.length, updated, skipped, noAddress, geocodeFailed });
					}
				}

				send({
					type: 'done',
					total: allOrgs.length,
					updated,
					skipped,
					noAddress,
					geocodeFailed
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
			cacheOnly: 'boolean (default: false) - Only geocode cities in pre-populated cache (no Nominatim API calls)'
		},
		notes: [
			'Streams progress as NDJSON - each line is a JSON object',
			'No TIC or Perplexity API calls - only geocoding and Pipedrive updates',
			'Uses pre-cached Swedish cities (50+) to minimize Nominatim API calls',
			'Skips orgs that already have distance unless forceRecalculate=true'
		]
	});
};
