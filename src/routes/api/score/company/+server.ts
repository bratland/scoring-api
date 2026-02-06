import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { PipedriveClient } from '$lib/pipedrive/client';
import { DEFAULT_TIC_FIELD_NAMES, CompanyEnricher } from '$lib/enrichment';
import { calculateCompanyScore } from '$lib/scoring/company-scorer';
import type { CompanyInput } from '$lib/scoring/company-scorer';
import type { TicFieldMapping } from '$lib/enrichment';
import { geocodeCity, distanceToGothenburg } from '$lib/geo';
import { PerplexityClient } from '$lib/perplexity';
import { TicClient } from '$lib/tic';
import { SCORING_CONFIG } from '$lib/scoring/config';

interface ScoreCompanyRequest {
	org_id: number;
}

// Cache field mapping to avoid fetching on every request
let cachedFieldMapping: TicFieldMapping | null = null;

async function getFieldMapping(client: PipedriveClient): Promise<TicFieldMapping | null> {
	if (cachedFieldMapping) return cachedFieldMapping;

	const fieldsResult = await client.getOrganizationFields();
	if (!fieldsResult.success || !fieldsResult.data) return null;

	const fieldNameToKey: Record<string, string> = {};
	for (const field of fieldsResult.data) {
		fieldNameToKey[field.name.toLowerCase()] = field.key;
	}

	const mapping: Partial<TicFieldMapping> = {};
	for (const [mappingKey, displayName] of Object.entries(DEFAULT_TIC_FIELD_NAMES)) {
		const key = fieldNameToKey[displayName.toLowerCase()];
		if (key) {
			mapping[mappingKey as keyof TicFieldMapping] = key;
		}
	}

	if (mapping.orgNumber) {
		// Only cache if critical score fields are also mapped
		// This ensures we re-fetch if new fields were added to Pipedrive
		if (mapping.companyScore) {
			cachedFieldMapping = mapping as TicFieldMapping;
		}
		return mapping as TicFieldMapping;
	}

	return null;
}

function validateApiKey(request: Request): boolean {
	const apiKey = env.SCORING_API_KEY;
	if (!apiKey) return true;

	const providedKey = request.headers.get('x-api-key') ||
	                    request.headers.get('authorization')?.replace('Bearer ', '');

	return providedKey === apiKey;
}

function parseNumber(value: unknown): number | undefined {
	if (value === null || value === undefined) return undefined;
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
		return isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}

function parseMonetaryField(value: unknown): number | undefined {
	if (value === null || value === undefined) return undefined;
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const cleaned = value.replace(/[^\d.-]/g, '');
		const parsed = parseFloat(cleaned);
		return isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}

/**
 * Extract city from Pipedrive organization data.
 * Tries configured city field, then standard address field, then address_locality.
 */
function extractCity(orgData: Record<string, unknown>, fieldMapping: TicFieldMapping | null): string | undefined {
	if (fieldMapping?.city) {
		const cityValue = orgData[fieldMapping.city];
		if (typeof cityValue === 'string' && cityValue.trim()) {
			return cityValue.trim();
		}
	}

	const address = orgData.address as string | undefined;
	if (address) {
		const parts = address.split(',');
		if (parts.length >= 2) {
			const lastPart = parts[parts.length - 1].trim();
			const cityMatch = lastPart.replace(/^\d{3}\s?\d{2}\s*/, '').trim();
			if (cityMatch) return cityMatch;
		}
	}

	const locality = orgData.address_locality as string | undefined;
	if (locality) return locality;

	return undefined;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!validateApiKey(request)) {
		return json({ error: 'Invalid or missing API key' }, { status: 401 });
	}

	try {
		const body: ScoreCompanyRequest = await request.json();

		if (!body.org_id) {
			return json({ error: 'Missing org_id' }, { status: 400 });
		}

		const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;
		if (!apiToken) {
			return json({ error: 'No Pipedrive API token configured' }, { status: 500 });
		}

		const client = new PipedriveClient({ apiToken });

		// ─────────────────────────────────────────────────────────────
		// 1. Fetch organization from Pipedrive
		// ─────────────────────────────────────────────────────────────
		const orgResult = await client.getOrganization(body.org_id);
		if (!orgResult.success || !orgResult.data) {
			return json(
				{ error: 'Organization not found', details: orgResult.error },
				{ status: 404 }
			);
		}

		const organization = orgResult.data as Record<string, unknown>;
		const orgName = (organization.name as string) || undefined;

		// ─────────────────────────────────────────────────────────────
		// 2. Read existing data from Pipedrive org fields
		// ─────────────────────────────────────────────────────────────
		const fieldMapping = await getFieldMapping(client);

		let revenue: number | undefined;
		let cagr3y: number | undefined;
		let industry: string | undefined;
		let distanceKm: number | undefined;
		let employees: number | undefined;
		let creditScore: number | undefined;
		let orgNumber: string | undefined;
		let ticUpdated: string | undefined;

		if (fieldMapping) {
			revenue = parseMonetaryField(organization[fieldMapping.revenue]);
			cagr3y = parseNumber(organization[fieldMapping.cagr3y]);
			distanceKm = parseNumber(organization[fieldMapping.distanceGbg]);
			employees = parseNumber(organization[fieldMapping.employees]);
			creditScore = parseNumber(organization[fieldMapping.score]);

			const industryValue = organization[fieldMapping.industry];
			if (typeof industryValue === 'string' && industryValue.trim()) {
				industry = industryValue.trim();
			}

			const orgNumberValue = organization[fieldMapping.orgNumber];
			if (typeof orgNumberValue === 'string' && orgNumberValue.trim()) {
				orgNumber = orgNumberValue.trim();
			}

			const ticUpdatedValue = organization[fieldMapping.ticUpdated];
			if (typeof ticUpdatedValue === 'string' && ticUpdatedValue.trim()) {
				ticUpdated = ticUpdatedValue.trim();
			}
		}

		// ─────────────────────────────────────────────────────────────
		// 3. Perplexity: fill in missing data (city, org number, industry)
		// ─────────────────────────────────────────────────────────────
		let perplexityUsed = false;
		const needsCity = distanceKm === undefined && !extractCity(organization, fieldMapping);
		const needsOrgNumber = !orgNumber;
		const needsIndustry = !industry;

		if ((needsCity || needsOrgNumber || needsIndustry) && orgName && env.PERPLEXITY_API_KEY) {
			const perplexity = new PerplexityClient({ apiKey: env.PERPLEXITY_API_KEY });
			const info = await perplexity.findCompanyInfo(orgName);
			perplexityUsed = true;

			if (info.orgNumber && needsOrgNumber) {
				orgNumber = info.orgNumber;
				// Store org number in Pipedrive
				if (fieldMapping?.orgNumber) {
					try {
						await client.updateOrganization(body.org_id, {
							[fieldMapping.orgNumber]: orgNumber
						});
					} catch (e) {
						console.warn('Failed to store org number:', e);
					}
				}
			}

			if (info.industry && needsIndustry) {
				industry = info.industry;
				// Store industry in Pipedrive
				if (fieldMapping?.industry) {
					try {
						await client.updateOrganization(body.org_id, {
							[fieldMapping.industry]: industry
						});
					} catch (e) {
						console.warn('Failed to store industry:', e);
					}
				}
			}

			if (info.city && needsCity) {
				// Geocode the city for distance
				const geoResult = await geocodeCity(info.city);
				if (geoResult) {
					distanceKm = distanceToGothenburg(geoResult.latitude, geoResult.longitude);
					if (fieldMapping?.distanceGbg) {
						try {
							await client.updateOrganization(body.org_id, {
								[fieldMapping.distanceGbg]: Math.round(distanceKm)
							});
						} catch (e) {
							console.warn('Failed to store distance:', e);
						}
					}
				}
			}
		}

		// ─────────────────────────────────────────────────────────────
		// 3b. Resolve distance from existing address if still missing
		// ─────────────────────────────────────────────────────────────
		if (distanceKm === undefined) {
			const city = extractCity(organization, fieldMapping);
			if (city) {
				const geoResult = await geocodeCity(city);
				if (geoResult) {
					distanceKm = distanceToGothenburg(geoResult.latitude, geoResult.longitude);
					if (fieldMapping?.distanceGbg) {
						try {
							await client.updateOrganization(body.org_id, {
								[fieldMapping.distanceGbg]: Math.round(distanceKm)
							});
						} catch (e) {
							console.warn('Failed to store distance:', e);
						}
					}
				}
			}
		}

		// ─────────────────────────────────────────────────────────────
		// 4. Calculate PRELIMINARY company score
		// ─────────────────────────────────────────────────────────────
		const preliminaryInput: CompanyInput = {
			revenue,
			cagr_3y: cagr3y,
			industry,
			distance_km: distanceKm,
			score: creditScore
		};

		const preliminaryResult = calculateCompanyScore(preliminaryInput);

		// ─────────────────────────────────────────────────────────────
		// 5. Conditional TIC enrichment
		//    Only if: score >= threshold AND never TIC-enriched AND TIC key exists
		// ─────────────────────────────────────────────────────────────
		let ticEnriched = false;
		let finalRevenue = revenue;
		let finalCagr = cagr3y;
		let finalIndustry = industry;
		let finalDistance = distanceKm;
		let finalCreditScore = creditScore;
		let finalEmployees = employees;

		const shouldEnrich =
			preliminaryResult.company_score >= SCORING_CONFIG.preScoreThreshold &&
			!ticUpdated &&
			env.TIC_API_KEY &&
			(orgNumber || orgName);

		if (shouldEnrich) {
			const ticClient = new TicClient({ apiKey: env.TIC_API_KEY! });
			const enricher = new CompanyEnricher(ticClient, client);
			if (fieldMapping) {
				enricher.setFieldMapping(fieldMapping);
			}

			const enriched = await enricher.enrichCompany(body.org_id, organization);

			if (enriched.dataSource === 'tic') {
				ticEnriched = true;

				// Update local variables with enriched data
				if (enriched.revenue !== undefined) finalRevenue = enriched.revenue;
				if (enriched.cagr3y !== undefined) finalCagr = enriched.cagr3y;
				if (enriched.industry) finalIndustry = enriched.industry;
				if (enriched.distanceToGothenburg !== undefined) finalDistance = enriched.distanceToGothenburg;
				if (enriched.creditScore !== undefined) finalCreditScore = enriched.creditScore;
				if (enriched.employees !== undefined) finalEmployees = enriched.employees;
			}
		}

		// ─────────────────────────────────────────────────────────────
		// 6. Calculate FINAL company score (with enriched data if available)
		// ─────────────────────────────────────────────────────────────
		const finalInput: CompanyInput = {
			revenue: finalRevenue,
			cagr_3y: finalCagr,
			industry: finalIndustry,
			distance_km: finalDistance,
			score: finalCreditScore
		};

		const scoreResult = ticEnriched
			? calculateCompanyScore(finalInput)
			: preliminaryResult;

		// ─────────────────────────────────────────────────────────────
		// 7. Write company score back to Pipedrive
		// ─────────────────────────────────────────────────────────────
		let pipedriveUpdated = false;
		if (fieldMapping?.companyScore) {
			try {
				const updates: Record<string, unknown> = {};
				updates[fieldMapping.companyScore] = Math.round(scoreResult.company_score);
				if (fieldMapping.companyScoreReason) {
					updates[fieldMapping.companyScoreReason] = scoreResult.reason;
				}
				await client.updateOrganization(body.org_id, updates);
				pipedriveUpdated = true;
			} catch (updateError) {
				console.warn('Failed to update company score in Pipedrive:', updateError);
			}
		}

		// ─────────────────────────────────────────────────────────────
		// 8. Return response
		// ─────────────────────────────────────────────────────────────
		return json({
			success: true,
			org_id: body.org_id,
			org_name: orgName || null,
			available_data: {
				org_number: orgNumber,
				revenue: finalRevenue,
				cagr_3y: finalCagr,
				industry: finalIndustry,
				distance_km: finalDistance,
				employees: finalEmployees,
				credit_score: finalCreditScore,
				tic_updated: ticUpdated || (ticEnriched ? new Date().toISOString() : undefined)
			},
			scoring: {
				company_score: scoreResult.company_score,
				reason: scoreResult.reason,
				breakdown: scoreResult.breakdown,
				factors_used: scoreResult.factors_used,
				warnings: scoreResult.warnings
			},
			enrichment: {
				perplexity_used: perplexityUsed,
				tic_enriched: ticEnriched,
				preliminary_score: ticEnriched ? preliminaryResult.company_score : undefined,
				threshold: SCORING_CONFIG.preScoreThreshold,
				skipped_tic_reason: !shouldEnrich
					? !env.TIC_API_KEY ? 'no_tic_key'
					: ticUpdated ? 'already_enriched'
					: preliminaryResult.company_score < SCORING_CONFIG.preScoreThreshold ? 'below_threshold'
					: 'no_identifier'
					: undefined
			},
			pipedrive_updated: pipedriveUpdated
		});

	} catch (error) {
		console.error('Company pre-scoring error:', error);
		return json(
			{
				error: 'Internal server error',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

export const GET: RequestHandler = async () => {
	return json({
		endpoint: 'POST /api/score/company',
		description: 'Pre-score a company. Fills missing data via Perplexity (org number, city, industry). If preliminary score passes threshold and company has never been TIC-enriched, triggers TIC enrichment automatically.',
		request: {
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': 'your-api-key (if configured)'
			},
			body: {
				org_id: 'number (required) - Pipedrive organization ID'
			}
		},
		response: {
			success: 'boolean',
			org_id: 'number',
			org_name: 'string | null',
			available_data: {
				org_number: 'string | undefined - Organization number',
				revenue: 'number | undefined - Revenue in SEK',
				cagr_3y: 'number | undefined - 3-year CAGR',
				industry: 'string | undefined - Industry description',
				distance_km: 'number | undefined - Distance to Gothenburg (km)',
				employees: 'number | undefined - Employee count',
				credit_score: 'number | undefined - Credit score (0-100)',
				tic_updated: 'string | undefined - Last TIC enrichment timestamp'
			},
			scoring: {
				company_score: 'number (0-100)',
				reason: 'string - Swedish explanation',
				breakdown: 'object - Individual factor scores',
				factors_used: 'string[]',
				warnings: 'string[]'
			},
			enrichment: {
				perplexity_used: 'boolean - Whether Perplexity was called for missing data',
				tic_enriched: 'boolean - Whether TIC enrichment was triggered',
				preliminary_score: 'number | undefined - Score before TIC enrichment',
				threshold: 'number - Pre-score threshold for TIC enrichment',
				skipped_tic_reason: 'string | undefined - Why TIC was skipped: below_threshold, already_enriched, no_tic_key, no_identifier'
			},
			pipedrive_updated: 'boolean'
		},
		flow: [
			'1. Read existing data from Pipedrive',
			'2. Perplexity: find missing org number, city, industry (single API call)',
			'3. Geocode city for distance if needed',
			'4. Calculate preliminary company score',
			`5. If score >= ${SCORING_CONFIG.preScoreThreshold} and never TIC-enriched: call TIC for financial data`,
			'6. Calculate final score (with enriched data if available)',
			'7. Write score + reason to Pipedrive'
		]
	});
};
