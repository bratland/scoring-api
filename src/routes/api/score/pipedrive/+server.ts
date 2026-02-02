import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { PipedriveClient, extractOrgId } from '$lib/pipedrive/client';
import { calculateScore, type PersonInput, type CompanyInput } from '$lib/scoring/scorer';
import { SCORING_CONFIG } from '$lib/scoring/config';

interface ScorePipedriveRequest {
	person_id: number;
	api_token?: string; // Optional - uses env var if not provided
	tier_field_key?: string;
	score_field_key?: string;
	field_mapping?: {
		functions?: string;
		relationship_strength?: string;
		revenue?: string;
		cagr_3y?: string;
		score?: string;
		industry?: string;
	};
}

// Default field keys for this Pipedrive instance
const DEFAULT_TIER_FIELD_KEY = '89c2b747b8d3f93a35ad244ac66444415300ae68';
const DEFAULT_SCORE_FIELD_KEY = 'c93c9446c16874d8eb9464e1cf1215ee3ae26a80';

const DEFAULT_FIELD_MAPPING = {
	functions: 'Functions',
	relationship_strength: 'Relationship Strength',
	revenue: 'Omsättning',
	cagr_3y: 'CAGR 3Y',
	score: 'Score',
	industry: 'Bransch SE'
};

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

function parseNumericValue(value: unknown): number | undefined {
	if (value === null || value === undefined) return undefined;
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
		return isNaN(parsed) ? undefined : parsed;
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

		// Use provided token or fall back to environment variable
		const apiToken = body.api_token || env.PIPEDRIVE_API_TOKEN;
		if (!apiToken) {
			return json({ error: 'No Pipedrive API token available' }, { status: 400 });
		}

		const client = new PipedriveClient({ apiToken });
		const fieldMapping = { ...DEFAULT_FIELD_MAPPING, ...body.field_mapping };

		// Use default field keys if not provided
		const tierFieldKey = body.tier_field_key || DEFAULT_TIER_FIELD_KEY;
		const scoreFieldKey = body.score_field_key || DEFAULT_SCORE_FIELD_KEY;

		// Fetch person data
		const personResult = await client.getPerson(body.person_id);
		if (!personResult.success || !personResult.data) {
			return json(
				{ error: 'Failed to fetch person', details: personResult.error },
				{ status: 404 }
			);
		}

		const person = personResult.data;
		let organization: Record<string, unknown> | null = null;

		// Fetch organization if linked
		const orgId = extractOrgId(person.org_id);
		if (orgId) {
			const orgResult = await client.getOrganization(orgId);
			if (orgResult.success && orgResult.data) {
				organization = orgResult.data as Record<string, unknown>;
			}
		}

		// Fetch activities for engagement score
		const activitiesResult = await client.getPersonActivities(body.person_id, 90);
		const activityCount = activitiesResult.success && activitiesResult.data
			? activitiesResult.data.length
			: 0;

		// Build scoring inputs from Pipedrive data
		const personInput: PersonInput = {
			functions: parseFunctions(findFieldValue(person as Record<string, unknown>, fieldMapping.functions)),
			relationship_strength: findFieldValue(person as Record<string, unknown>, fieldMapping.relationship_strength) as string | undefined,
			activities_90d: activityCount
		};

		const companyInput: CompanyInput = organization ? {
			revenue: parseNumericValue(findFieldValue(organization, fieldMapping.revenue)),
			cagr_3y: parseNumericValue(findFieldValue(organization, fieldMapping.cagr_3y)),
			score: parseNumericValue(findFieldValue(organization, fieldMapping.score)),
			industry: findFieldValue(organization, fieldMapping.industry) as string | undefined
		} : {};

		// Calculate score
		const scoreResult = calculateScore(personInput, companyInput);

		// Prepare update payload
		const updates: Record<string, unknown> = {
			[tierFieldKey]: scoreResult.tier,
			[scoreFieldKey]: scoreResult.combined_score
		};

		// Update person in Pipedrive
		const updateResult = await client.updatePerson(body.person_id, updates);

		return json({
			success: true,
			person_id: body.person_id,
			person_name: person.name,
			organization_name: organization?.name || null,
			scoring: scoreResult,
			pipedrive_update: {
				success: updateResult.success,
				error: updateResult.error,
				fields_updated: Object.keys(updates)
			},
			data_used: {
				person: personInput,
				company: companyInput
			}
		});

	} catch (error) {
		console.error('Pipedrive scoring error:', error);
		return json(
			{
				error: 'Internal server error',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

// GET endpoint for health check and usage info
export const GET: RequestHandler = async ({ request, url }) => {
	// API key not required for GET (documentation endpoint)

	const apiToken = url.searchParams.get('api_token') || env.PIPEDRIVE_API_TOKEN;

	if (!apiToken) {
		return json({
			description: 'Pipedrive scoring endpoint',
			usage: {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': 'your-scoring-api-key'
				},
				body: {
					person_id: 12345
				},
				note: 'Pipedrive API token and field keys are pre-configured'
			}
		});
	}

	// Discover fields
	const client = new PipedriveClient({ apiToken });

	const [personFields, orgFields] = await Promise.all([
		client.getPersonFields(),
		client.getOrganizationFields()
	]);

	return json({
		person_fields: personFields.success ? personFields.data?.map(f => ({
			key: f.key,
			name: f.name,
			type: f.field_type,
			options: f.options
		})) : [],
		organization_fields: orgFields.success ? orgFields.data?.map(f => ({
			key: f.key,
			name: f.name,
			type: f.field_type
		})) : [],
		configured_defaults: {
			tier_field_key: DEFAULT_TIER_FIELD_KEY,
			score_field_key: DEFAULT_SCORE_FIELD_KEY,
			field_mapping: DEFAULT_FIELD_MAPPING
		},
		scoring_config: {
			role_scores: SCORING_CONFIG.roleScores,
			relationship_scores: SCORING_CONFIG.relationshipScores
		}
	});
};
