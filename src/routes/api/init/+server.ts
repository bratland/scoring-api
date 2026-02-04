import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { PipedriveClient } from '$lib/pipedrive/client';

// Required person fields for scoring
const REQUIRED_PERSON_FIELDS = [
	{ name: 'Lead Tier', field_type: 'varchar' },
	{ name: 'Lead Score', field_type: 'double' },
	{ name: 'Functions', field_type: 'varchar' },
	{ name: 'Relationship Strength', field_type: 'varchar' }
];

// Required organization fields for scoring
const REQUIRED_ORG_FIELDS = [
	{ name: 'Org. nummer', field_type: 'varchar' },
	{ name: 'Omsättning', field_type: 'double' },
	{ name: 'CAGR 3Y', field_type: 'double' },
	{ name: 'Bransch SE', field_type: 'varchar' },
	{ name: 'Avstånd GBG', field_type: 'double' },
	{ name: 'Antal anställda', field_type: 'double' }
];

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

	const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;
	if (!apiToken) {
		return json({ error: 'No Pipedrive API token configured' }, { status: 500 });
	}

	const client = new PipedriveClient({ apiToken });
	const created: string[] = [];
	const existing: string[] = [];
	const errors: string[] = [];

	// Get existing person fields
	const personFieldsResult = await client.getPersonFields();
	const existingPersonFields = new Map<string, string>();
	if (personFieldsResult.success && personFieldsResult.data) {
		for (const field of personFieldsResult.data) {
			existingPersonFields.set(field.name.toLowerCase(), field.key);
		}
	}

	// Get existing organization fields
	const orgFieldsResult = await client.getOrganizationFields();
	const existingOrgFields = new Map<string, string>();
	if (orgFieldsResult.success && orgFieldsResult.data) {
		for (const field of orgFieldsResult.data) {
			existingOrgFields.set(field.name.toLowerCase(), field.key);
		}
	}

	// Create missing person fields
	for (const field of REQUIRED_PERSON_FIELDS) {
		const existingKey = existingPersonFields.get(field.name.toLowerCase());
		if (existingKey) {
			existing.push(`Person: ${field.name}`);
		} else {
			const result = await client.createPersonField(field.name, field.field_type);
			if (result.success && result.data) {
				created.push(`Person: ${field.name} (${result.data.key})`);
			} else {
				errors.push(`Person: ${field.name} - ${result.error}`);
			}
		}
	}

	// Create missing organization fields
	for (const field of REQUIRED_ORG_FIELDS) {
		const existingKey = existingOrgFields.get(field.name.toLowerCase());
		if (existingKey) {
			existing.push(`Organization: ${field.name}`);
		} else {
			const result = await client.createOrganizationField(field.name, field.field_type);
			if (result.success && result.data) {
				created.push(`Organization: ${field.name} (${result.data.key})`);
			} else {
				errors.push(`Organization: ${field.name} - ${result.error}`);
			}
		}
	}

	// Fetch updated field keys for config
	const updatedPersonFields = await client.getPersonFields();
	const updatedOrgFields = await client.getOrganizationFields();

	const fieldKeys: Record<string, string> = {};

	if (updatedPersonFields.success && updatedPersonFields.data) {
		for (const field of updatedPersonFields.data) {
			const lowerName = field.name.toLowerCase();
			if (lowerName === 'lead tier') fieldKeys.TIER_FIELD_KEY = field.key;
			if (lowerName === 'lead score') fieldKeys.SCORE_FIELD_KEY = field.key;
			if (lowerName === 'functions') fieldKeys.FUNCTIONS_FIELD_KEY = field.key;
			if (lowerName === 'relationship strength') fieldKeys.RELATIONSHIP_FIELD_KEY = field.key;
		}
	}

	if (updatedOrgFields.success && updatedOrgFields.data) {
		for (const field of updatedOrgFields.data) {
			const lowerName = field.name.toLowerCase();
			if (lowerName === 'org. nummer') fieldKeys.ORG_NUMBER_FIELD_KEY = field.key;
			if (lowerName === 'omsättning') fieldKeys.REVENUE_FIELD_KEY = field.key;
			if (lowerName === 'cagr 3y') fieldKeys.CAGR_FIELD_KEY = field.key;
			if (lowerName === 'bransch se') fieldKeys.INDUSTRY_FIELD_KEY = field.key;
			if (lowerName === 'avstånd gbg') fieldKeys.DISTANCE_FIELD_KEY = field.key;
			if (lowerName === 'antal anställda') fieldKeys.EMPLOYEES_FIELD_KEY = field.key;
		}
	}

	return json({
		success: errors.length === 0,
		created,
		existing,
		errors: errors.length > 0 ? errors : undefined,
		field_keys: fieldKeys
	});
};

export const GET: RequestHandler = async () => {
	return json({
		endpoint: 'POST /api/init',
		description: 'Initialize Pipedrive with required fields for scoring',
		creates: {
			person_fields: REQUIRED_PERSON_FIELDS.map(f => f.name),
			organization_fields: REQUIRED_ORG_FIELDS.map(f => f.name)
		},
		note: 'Only creates fields that do not already exist'
	});
};
