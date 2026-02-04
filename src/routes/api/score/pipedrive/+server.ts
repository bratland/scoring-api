import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { PipedriveClient, extractOrgId } from '$lib/pipedrive/client';
import { TicClient } from '$lib/tic';
import { CompanyEnricher, DEFAULT_TIC_FIELD_NAMES } from '$lib/enrichment';
import { PerplexityClient } from '$lib/perplexity';
import { calculateScore, type PersonInput, type CompanyInput } from '$lib/scoring/scorer';
import type { TicFieldMapping } from '$lib/enrichment';

interface ScorePipedriveRequest {
	person_id: number;
}

// Default field keys for updating Pipedrive
const DEFAULT_TIER_FIELD_KEY = '5a4962a2b5338ec996e6807300212e9d2763be1c';  // "Lead Tier"
const DEFAULT_SCORE_FIELD_KEY = '49ee51d1e5e397fca73c124dde367245ee79783f'; // "Lead Score"

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
		cachedFieldMapping = mapping as TicFieldMapping;
		return cachedFieldMapping;
	}

	return null;
}

function validateApiKey(request: Request): boolean {
	const apiKey = env.SCORING_API_KEY;
	if (!apiKey) return true; // No API key configured = allow all

	const providedKey = request.headers.get('x-api-key') ||
	                    request.headers.get('authorization')?.replace('Bearer ', '');

	return providedKey === apiKey;
}

function findFieldValue(obj: Record<string, unknown>, fieldName: string): unknown {
	if (fieldName in obj) {
		return obj[fieldName];
	}

	for (const [key, value] of Object.entries(obj)) {
		if (key.toLowerCase() === fieldName.toLowerCase()) {
			return value;
		}
	}

	return undefined;
}

function parseFunctions(value: unknown): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === 'string') {
		return value.split(',').map(s => s.trim()).filter(Boolean);
	}
	return [];
}

export const POST: RequestHandler = async ({ request }) => {
	// Validate API key
	if (!validateApiKey(request)) {
		return json({ error: 'Invalid or missing API key' }, { status: 401 });
	}

	try {
		const body: ScorePipedriveRequest = await request.json();

		if (!body.person_id) {
			return json({ error: 'Missing person_id' }, { status: 400 });
		}

		// Use environment variable for Pipedrive token
		const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;
		if (!apiToken) {
			return json({ error: 'No Pipedrive API token configured' }, { status: 500 });
		}

		const client = new PipedriveClient({ apiToken });

		// ─────────────────────────────────────────────────────────────
		// 1. Fetch person from Pipedrive
		// ─────────────────────────────────────────────────────────────
		const personResult = await client.getPerson(body.person_id);
		if (!personResult.success || !personResult.data) {
			return json(
				{ error: 'Person not found', details: personResult.error },
				{ status: 404 }
			);
		}

		const person = personResult.data;
		const personData = person as {
			name?: string;
			email?: Array<{ value: string }>;
			[key: string]: unknown;
		};

		// ─────────────────────────────────────────────────────────────
		// 2. Fetch organization and enrich with TIC
		// ─────────────────────────────────────────────────────────────
		let organization: Record<string, unknown> | null = null;
		let enrichedCompany: {
			revenue?: number;
			cagr3y?: number;
			industry?: string;
			distanceToGothenburg?: number;
			employees?: number;
		} | null = null;

		const orgId = extractOrgId(person.org_id);
		if (orgId) {
			const orgResult = await client.getOrganization(orgId);
			if (orgResult.success && orgResult.data) {
				organization = orgResult.data as Record<string, unknown>;

				// Enrich with TIC if API key available
				const ticApiKey = env.TIC_API_KEY;
				if (ticApiKey) {
					try {
						const ticClient = new TicClient({ apiKey: ticApiKey });
						const enricher = new CompanyEnricher(ticClient, client);

						const fieldMapping = await getFieldMapping(client);
						if (fieldMapping) {
							enricher.setFieldMapping(fieldMapping);
						}

						const enrichResult = await enricher.enrichCompany(orgId, organization);
						if (enrichResult) {
							enrichedCompany = {
								revenue: enrichResult.revenue,
								cagr3y: enrichResult.cagr3y,
								industry: enrichResult.industry,
								distanceToGothenburg: enrichResult.distanceToGothenburg,
								employees: enrichResult.employees
							};
						}
					} catch (ticError) {
						console.warn('TIC enrichment failed:', ticError);
					}
				}
			}
		}

		// ─────────────────────────────────────────────────────────────
		// 3. Find person's role via Perplexity (if not in Pipedrive)
		// ─────────────────────────────────────────────────────────────
		let detectedRole: string | null = null;

		// First check if role exists in Pipedrive
		const existingFunctions = parseFunctions(findFieldValue(personData, 'Functions'));

		if (existingFunctions.length === 0 && personData.name) {
			const perplexityApiKey = env.PERPLEXITY_API_KEY;
			if (perplexityApiKey) {
				try {
					const perplexityClient = new PerplexityClient({ apiKey: perplexityApiKey });
					const orgName = organization?.name as string | undefined;
					const email = personData.email?.[0]?.value;

					const roleResult = await perplexityClient.findPersonRole(personData.name, orgName, email);

					if (roleResult.confidence !== 'none' && roleResult.role) {
						detectedRole = roleResult.role;
					}
				} catch (perplexityError) {
					console.warn('Perplexity role lookup failed:', perplexityError);
				}
			}
		}

		// ─────────────────────────────────────────────────────────────
		// 4. Calculate engagement (activities + notes + emails + files)
		// ─────────────────────────────────────────────────────────────
		const ninetyDaysAgo = new Date();
		ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

		const [activitiesResult, notesResult, mailResult, filesResult] = await Promise.all([
			client.getPersonActivities(body.person_id, 90),
			client.getPersonNotes(body.person_id),
			client.getPersonMailMessages(body.person_id),
			client.getPersonFiles(body.person_id)
		]);

		const activities = activitiesResult.success ? activitiesResult.data || [] : [];
		const notes = notesResult.success ? notesResult.data || [] : [];
		const mail = mailResult.success ? mailResult.data || [] : [];
		const files = filesResult.success ? filesResult.data || [] : [];

		// Filter to last 90 days
		const recentNotes = notes.filter(n => new Date(n.add_time) >= ninetyDaysAgo);
		const recentMail = mail.filter(m => new Date(m.message_time) >= ninetyDaysAgo);
		const recentFiles = files.filter(f => new Date(f.add_time) >= ninetyDaysAgo);

		const totalEngagement = activities.length + recentNotes.length + recentMail.length + recentFiles.length;

		// ─────────────────────────────────────────────────────────────
		// 5. Build scoring inputs
		// ─────────────────────────────────────────────────────────────
		const functions = existingFunctions.length > 0 ? existingFunctions : (detectedRole ? [detectedRole] : []);
		const relationshipStrength = findFieldValue(personData, 'Relationship Strength') as string | undefined;

		const personInput: PersonInput = {
			functions,
			relationship_strength: relationshipStrength,
			activities_90d: totalEngagement
		};

		const companyInput: CompanyInput = {
			revenue: enrichedCompany?.revenue,
			cagr_3y: enrichedCompany?.cagr3y,
			industry: enrichedCompany?.industry,
			distance_km: enrichedCompany?.distanceToGothenburg,
			employees: enrichedCompany?.employees
		};

		// ─────────────────────────────────────────────────────────────
		// 6. Calculate score
		// ─────────────────────────────────────────────────────────────
		const scoreResult = calculateScore(personInput, companyInput);

		// ─────────────────────────────────────────────────────────────
		// 7. Update Pipedrive with tier and score
		// ─────────────────────────────────────────────────────────────
		const updates: Record<string, unknown> = {
			[DEFAULT_TIER_FIELD_KEY]: scoreResult.tier,
			[DEFAULT_SCORE_FIELD_KEY]: Math.round(scoreResult.combined_score)
		};

		const updateResult = await client.updatePerson(body.person_id, updates);

		// ─────────────────────────────────────────────────────────────
		// 8. Return clean response (no mention of TIC/Perplexity)
		// ─────────────────────────────────────────────────────────────
		return json({
			success: true,
			person_id: body.person_id,
			person_name: person.name,
			organization_name: organization?.name || null,
			tier: scoreResult.tier,
			score: Math.round(scoreResult.combined_score),
			breakdown: {
				person_score: Math.round(scoreResult.person_score),
				company_score: Math.round(scoreResult.company_score),
				factors: scoreResult.breakdown
			},
			engagement: {
				activities: activities.length,
				notes: recentNotes.length,
				emails: recentMail.length,
				files: recentFiles.length,
				total: totalEngagement
			},
			pipedrive_updated: updateResult.success,
			warnings: scoreResult.warnings
		});

	} catch (error) {
		console.error('Scoring error:', error);
		return json(
			{
				error: 'Internal server error',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

// GET endpoint for usage info
export const GET: RequestHandler = async () => {
	return json({
		endpoint: 'POST /api/score/pipedrive',
		description: 'Calculate lead score for a Pipedrive person',
		request: {
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': 'your-api-key (if configured)'
			},
			body: {
				person_id: 'number (required) - Pipedrive person ID'
			}
		},
		response: {
			success: 'boolean',
			person_id: 'number',
			person_name: 'string',
			organization_name: 'string | null',
			tier: 'GOLD | SILVER | BRONZE',
			score: 'number (0-100)',
			breakdown: {
				person_score: 'number',
				company_score: 'number',
				factors: 'object with individual scores'
			},
			engagement: {
				activities: 'number',
				notes: 'number',
				emails: 'number',
				files: 'number',
				total: 'number'
			},
			pipedrive_updated: 'boolean',
			warnings: 'string[]'
		},
		tiers: {
			GOLD: '>= 70',
			SILVER: '40-69',
			BRONZE: '< 40'
		}
	});
};
