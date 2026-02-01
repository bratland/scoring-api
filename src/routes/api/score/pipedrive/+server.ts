import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PipedriveClient, extractOrgId } from '$lib/pipedrive/client';
import { calculateScore, type PersonInput, type CompanyInput } from '$lib/scoring/scorer';
import { SCORING_CONFIG } from '$lib/scoring/config';

interface ScorePipedriveRequest {
	person_id: number;
	api_token: string;
	tier_field_key?: string; // Custom field key for storing tier (e.g., "lead_tier")
	score_field_key?: string; // Custom field key for storing score
	field_mapping?: {
		// Map Pipedrive field keys to scoring inputs
		functions?: string;
		relationship_strength?: string;
		revenue?: string;
		cagr_3y?: string;
		score?: string;
		industry?: string;
	};
}

const DEFAULT_FIELD_MAPPING = {
	functions: 'Functions',
	relationship_strength: 'Relationship Strength',
	revenue: 'Omsättning',
	cagr_3y: 'CAGR 3Y',
	score: 'Score',
	industry: 'Bransch SE'
};

function findFieldValue(obj: Record<string, unknown>, fieldName: string): unknown {
	// Try exact match first
	if (fieldName in obj) {
		return obj[fieldName];
	}

	// Try case-insensitive match on field names
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
		// Could be comma-separated or a single value
		return value.split(',').map(s => s.trim()).filter(Boolean);
	}
	return [];
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body: ScorePipedriveRequest = await request.json();

		// Validate required fields
		if (!body.person_id) {
			return json({ error: 'Missing person_id' }, { status: 400 });
		}
		if (!body.api_token) {
			return json({ error: 'Missing api_token' }, { status: 400 });
		}

		const client = new PipedriveClient({ apiToken: body.api_token });
		const fieldMapping = { ...DEFAULT_FIELD_MAPPING, ...body.field_mapping };

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
		const updates: Record<string, unknown> = {};

		if (body.tier_field_key) {
			updates[body.tier_field_key] = scoreResult.tier;
		}

		if (body.score_field_key) {
			updates[body.score_field_key] = scoreResult.combined_score;
		}

		// Update person in Pipedrive if we have fields to update
		let updateResult = null;
		if (Object.keys(updates).length > 0) {
			updateResult = await client.updatePerson(body.person_id, updates);
		}

		return json({
			success: true,
			person_id: body.person_id,
			person_name: person.name,
			organization_name: organization?.name || null,
			scoring: scoreResult,
			pipedrive_update: updateResult ? {
				success: updateResult.success,
				error: updateResult.error,
				fields_updated: Object.keys(updates)
			} : {
				skipped: true,
				reason: 'No tier_field_key or score_field_key provided'
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

// GET endpoint to help discover field mappings
export const GET: RequestHandler = async ({ url }) => {
	const apiToken = url.searchParams.get('api_token');

	if (!apiToken) {
		return json({
			description: 'Pipedrive scoring endpoint',
			usage: {
				method: 'POST',
				body: {
					person_id: 12345,
					api_token: 'your-pipedrive-api-token',
					tier_field_key: 'abc123hash', // Custom field key for tier
					score_field_key: 'def456hash', // Custom field key for score
					field_mapping: {
						functions: 'Functions',
						relationship_strength: 'Relationship Strength',
						revenue: 'Omsättning',
						cagr_3y: 'CAGR 3Y',
						score: 'Score',
						industry: 'Bransch SE'
					}
				}
			},
			tip: 'Add ?api_token=xxx to discover your Pipedrive field keys'
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
		suggested_mapping: DEFAULT_FIELD_MAPPING,
		scoring_config: {
			role_scores: SCORING_CONFIG.roleScores,
			relationship_scores: SCORING_CONFIG.relationshipScores
		}
	});
};
