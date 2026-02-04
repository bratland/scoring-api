import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PipedriveClient, extractOrgId } from '$lib/pipedrive/client';
import { TicClient } from '$lib/tic';
import { CompanyEnricher, DEFAULT_TIC_FIELD_NAMES } from '$lib/enrichment';
import { PerplexityClient, type PersonRoleResult } from '$lib/perplexity';
import type { TicFieldMapping } from '$lib/enrichment';
import type { RequestHandler } from './$types';

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

	// Map display names to actual field keys
	const mapping: Partial<TicFieldMapping> = {};
	for (const [mappingKey, displayName] of Object.entries(DEFAULT_TIC_FIELD_NAMES)) {
		const key = fieldNameToKey[displayName.toLowerCase()];
		if (key) {
			mapping[mappingKey as keyof TicFieldMapping] = key;
		}
	}

	// Only cache if we found the org number field (minimum requirement)
	if (mapping.orgNumber) {
		cachedFieldMapping = mapping as TicFieldMapping;
		return cachedFieldMapping;
	}

	return null;
}

export const GET: RequestHandler = async ({ params }) => {
	const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;

	if (!apiToken) {
		return json({ error: 'Pipedrive API token not configured' }, { status: 500 });
	}

	const personId = parseInt(params.id, 10);
	if (isNaN(personId)) {
		return json({ error: 'Invalid person ID' }, { status: 400 });
	}

	try {
		const client = new PipedriveClient({ apiToken });

		// Fetch person
		const personResult = await client.getPerson(personId);
		if (!personResult.success || !personResult.data) {
			return json({ error: personResult.error || 'Person not found' }, { status: 404 });
		}

		const person = personResult.data;

		// Fetch organization if exists
		let organization = null;
		let enrichedCompany = null;
		const orgId = extractOrgId(person.org_id);

		if (orgId) {
			const orgResult = await client.getOrganization(orgId);
			if (orgResult.success && orgResult.data) {
				organization = orgResult.data;

				// Enrich company data from TIC if API key is available
				const ticApiKey = env.TIC_API_KEY;
				if (ticApiKey) {
					const ticClient = new TicClient({ apiKey: ticApiKey });
					const enricher = new CompanyEnricher(ticClient, client);

					// Get field mapping from Pipedrive
					const fieldMapping = await getFieldMapping(client);
					if (fieldMapping) {
						enricher.setFieldMapping(fieldMapping);
					}

					try {
						enrichedCompany = await enricher.enrichCompany(
							orgId,
							organization as Record<string, unknown>
						);
					} catch (enrichError) {
						console.warn('Failed to enrich company data:', enrichError);
					}
				}
			}
		}

		// Fetch recent activities
		const activitiesResult = await client.getPersonActivities(personId, 90);
		const activities = activitiesResult.success ? activitiesResult.data || [] : [];

		// Fetch notes, emails and files for engagement calculation
		const notesResult = await client.getPersonNotes(personId);
		const notes = notesResult.success ? notesResult.data || [] : [];

		const mailResult = await client.getPersonMailMessages(personId);
		const mailMessages = mailResult.success ? mailResult.data || [] : [];

		const filesResult = await client.getPersonFiles(personId);
		const files = filesResult.success ? filesResult.data || [] : [];

		// Filter to last 90 days
		const ninetyDaysAgo = new Date();
		ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

		const recentNotes = notes.filter((n) => new Date(n.add_time) >= ninetyDaysAgo);
		const recentMail = mailMessages.filter((m) => new Date(m.message_time) >= ninetyDaysAgo);
		const recentFiles = files.filter((f) => new Date(f.add_time) >= ninetyDaysAgo);

		// Look up person's role using Perplexity if API key is available
		let personRole: PersonRoleResult | null = null;
		const perplexityApiKey = env.PERPLEXITY_API_KEY;
		const personData = person as { name?: string; email?: Array<{ value: string }> };
		if (perplexityApiKey && personData.name) {
			try {
				const perplexityClient = new PerplexityClient({ apiKey: perplexityApiKey });
				const orgName = organization?.name as string | undefined;
				const email = personData.email?.[0]?.value;
				personRole = await perplexityClient.findPersonRole(personData.name, orgName, email);
			} catch (roleError) {
				console.warn('Failed to lookup person role:', roleError);
			}
		}

		return json({
			success: true,
			person,
			organization,
			enrichedCompany,
			personRole,
			activities,
			activityCount90d: activities.length,
			engagement: {
				notes: recentNotes.length,
				emails: recentMail.length,
				files: recentFiles.length,
				total: activities.length + recentNotes.length + recentMail.length + recentFiles.length
			}
		});
	} catch (error) {
		console.error('Failed to fetch person:', error);
		return json(
			{ error: 'Failed to fetch person', details: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
