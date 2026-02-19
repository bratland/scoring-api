/**
 * Batch Person Scoring
 *
 * Scores all persons linked to organizations that have a distance value.
 * Reuses the same scoring pipeline as POST /api/score/pipedrive but
 * optimizes by pre-fetching all data and caching org enrichment results.
 *
 * Streams progress as NDJSON so the request doesn't time out.
 */

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { PipedriveClient, extractOrgId } from '$lib/pipedrive/client';
import { TicClient } from '$lib/tic';
import { CompanyEnricher, DEFAULT_TIC_FIELD_NAMES } from '$lib/enrichment';
import type { TicFieldMapping } from '$lib/enrichment';
import { PerplexityClient } from '$lib/perplexity';
import { calculateScore, type PersonInput, type CompanyInput } from '$lib/scoring/scorer';
import { json } from '@sveltejs/kit';

async function getFieldMapping(client: PipedriveClient): Promise<TicFieldMapping | null> {
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
		return mapping as TicFieldMapping;
	}
	return null;
}

async function getPersonFieldKeys(client: PipedriveClient): Promise<{ tierKey?: string; scoreKey?: string }> {
	const fieldsResult = await client.getPersonFields();
	if (!fieldsResult.success || !fieldsResult.data) return {};

	const keys: { tierKey?: string; scoreKey?: string } = {};
	for (const field of fieldsResult.data) {
		const lowerName = field.name.toLowerCase();
		if (lowerName === 'lead tier') keys.tierKey = field.key;
		if (lowerName === 'lead score') keys.scoreKey = field.key;
	}
	return keys;
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
	const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;
	if (!apiToken) {
		return json({ error: 'No Pipedrive API token configured' }, { status: 500 });
	}

	let skipExisting = true;
	try {
		const body = await request.json();
		skipExisting = body.skipExisting ?? true;
	} catch {
		// Empty body is fine
	}

	const client = new PipedriveClient({ apiToken });

	// Get field keys upfront
	const fieldMapping = await getFieldMapping(client);
	const personFieldKeys = await getPersonFieldKeys(client);
	const distanceFieldKey = fieldMapping?.distanceGbg;

	if (!distanceFieldKey) {
		return json({ error: 'Could not find distance field in Pipedrive' }, { status: 500 });
	}

	const stream = new ReadableStream({
		async start(controller) {
			const send = (data: Record<string, unknown>) => {
				controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + '\n'));
			};

			try {
				// 1. Fetch all orgs and persons in parallel
				send({ type: 'status', message: 'Fetching organizations and persons from Pipedrive...' });
				const [allOrgs, allPersons] = await Promise.all([
					client.getAllOrganizations(),
					client.getAllPersons()
				]);

				// 2. Filter orgs that have distance set and track distance values
				const orgsWithDistance = new Map<number, Record<string, unknown>>();
				const orgDistances = new Map<number, number>();
				for (const org of allOrgs) {
					const orgData = org as Record<string, unknown>;
					const distance = orgData[distanceFieldKey] as number | null;
					if (distance != null && distance >= 0) {
						orgsWithDistance.set(org.id, orgData);
						orgDistances.set(org.id, distance);
					}
				}

				// 3. Find persons linked to those orgs, sorted by org distance (closest first)
				const personsToScore = allPersons
					.filter(p => {
						const orgId = extractOrgId(p.org_id);
						return orgId != null && orgsWithDistance.has(orgId);
					})
					.sort((a, b) => {
						const distA = orgDistances.get(extractOrgId(a.org_id)!) ?? Infinity;
						const distB = orgDistances.get(extractOrgId(b.org_id)!) ?? Infinity;
						return distA - distB;
					});

				send({
					type: 'status',
					message: `Found ${orgsWithDistance.size} orgs with distance, ${personsToScore.length} persons to score (sorted closest to GBG first)`,
					totalOrgs: orgsWithDistance.size,
					totalPersons: personsToScore.length
				});

				// 4. Set up enrichment clients
				const ticApiKey = env.TIC_API_KEY;
				const perplexityApiKey = env.PERPLEXITY_API_KEY;

				let ticClient: TicClient | null = null;
				let enricher: CompanyEnricher | null = null;
				if (ticApiKey) {
					ticClient = new TicClient({ apiKey: ticApiKey });
					enricher = new CompanyEnricher(ticClient, client);
					if (fieldMapping) enricher.setFieldMapping(fieldMapping);
				}

				let perplexityClient: PerplexityClient | null = null;
				if (perplexityApiKey) {
					perplexityClient = new PerplexityClient({ apiKey: perplexityApiKey });
				}

				// Cache enriched org data to avoid re-enriching the same org
				const enrichedOrgCache = new Map<number, {
					revenue?: number;
					cagr3y?: number;
					industry?: string;
					distanceToGothenburg?: number;
					employees?: number;
				}>();

				let scored = 0;
				let skipped = 0;
				let errors = 0;
				const tierCounts = { GOLD: 0, SILVER: 0, BRONZE: 0 };

				for (let i = 0; i < personsToScore.length; i++) {
					const person = personsToScore[i];
					const personData = person as Record<string, unknown>;
					const orgId = extractOrgId(person.org_id)!;
					const orgData = orgsWithDistance.get(orgId)!;

					try {
						// Skip if already scored
						if (skipExisting && personFieldKeys.scoreKey) {
							const existingScore = personData[personFieldKeys.scoreKey] as number | null;
							if (existingScore != null && existingScore > 0) {
								skipped++;
								if ((i + 1) % 50 === 0) {
									send({ type: 'progress', processed: i + 1, total: personsToScore.length, scored, skipped, errors, tiers: tierCounts });
								}
								continue;
							}
						}

						// Enrich org (cached per org)
						let enrichedCompany = enrichedOrgCache.get(orgId);
						if (!enrichedCompany && enricher) {
							try {
								const enrichResult = await enricher.enrichCompany(orgId, orgData);
								if (enrichResult) {
									enrichedCompany = {
										revenue: enrichResult.revenue,
										cagr3y: enrichResult.cagr3y,
										industry: enrichResult.industry,
										distanceToGothenburg: enrichResult.distanceToGothenburg,
										employees: enrichResult.employees
									};
								}
							} catch {
								// TIC enrichment failed, continue without
							}
							enrichedOrgCache.set(orgId, enrichedCompany || {});
						}

						// Detect role via Perplexity if not set
						const existingFunctions = parseFunctions(personData['Functions'] || personData['functions']);
						let functions = existingFunctions;

						if (functions.length === 0 && perplexityClient && person.name) {
							try {
								const orgName = orgData.name as string | undefined;
								const email = (personData.email as Array<{ value: string }> | undefined)?.[0]?.value;
								const roleResult = await perplexityClient.findPersonRole(person.name, orgName, email);
								if (roleResult.confidence !== 'none' && roleResult.role) {
									functions = [roleResult.role];
								}
							} catch {
								// Perplexity failed, continue without
							}
						}

						// Calculate engagement
						const ninetyDaysAgo = new Date();
						ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

						const [activitiesResult, notesResult, mailResult, filesResult] = await Promise.all([
							client.getPersonActivities(person.id, 90),
							client.getPersonNotes(person.id),
							client.getPersonMailMessages(person.id),
							client.getPersonFiles(person.id)
						]);

						const activities = activitiesResult.success ? activitiesResult.data || [] : [];
						const notes = (notesResult.success ? notesResult.data || [] : [])
							.filter(n => new Date(n.add_time) >= ninetyDaysAgo);
						const mail = (mailResult.success ? mailResult.data || [] : [])
							.filter(m => new Date(m.message_time) >= ninetyDaysAgo);
						const files = (filesResult.success ? filesResult.data || [] : [])
							.filter(f => new Date(f.add_time) >= ninetyDaysAgo);

						const totalEngagement = activities.length + notes.length + mail.length + files.length;

						// Build scoring inputs
						const personInput: PersonInput = {
							functions,
							activities_90d: totalEngagement
						};

						const companyInput: CompanyInput = {
							revenue: enrichedCompany?.revenue,
							cagr_3y: enrichedCompany?.cagr3y,
							industry: enrichedCompany?.industry,
							distance_km: enrichedCompany?.distanceToGothenburg,
							employees: enrichedCompany?.employees
						};

						// Calculate score
						const scoreResult = calculateScore(personInput, companyInput);

						// Update Pipedrive
						if (personFieldKeys.tierKey && personFieldKeys.scoreKey) {
							await client.updatePerson(person.id, {
								[personFieldKeys.tierKey]: scoreResult.tier,
								[personFieldKeys.scoreKey]: Math.round(scoreResult.combined_score)
							});
						}

						tierCounts[scoreResult.tier]++;
						scored++;

						send({
							type: 'scored',
							personId: person.id,
							name: person.name,
							org: orgData.name,
							distanceGbg: orgDistances.get(orgId) ?? null,
							score: Math.round(scoreResult.combined_score),
							tier: scoreResult.tier,
							role: functions[0] || 'Unknown',
							engagement: totalEngagement
						});
					} catch (err) {
						errors++;
						send({
							type: 'error',
							personId: person.id,
							name: person.name,
							message: err instanceof Error ? err.message : 'Unknown error'
						});
					}

					// Progress every 50
					if ((i + 1) % 50 === 0) {
						send({ type: 'progress', processed: i + 1, total: personsToScore.length, scored, skipped, errors, tiers: tierCounts });
					}
				}

				send({
					type: 'done',
					totalPersons: personsToScore.length,
					scored,
					skipped,
					errors,
					tiers: tierCounts
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
		endpoint: 'POST /api/batch/score',
		description: 'Score all persons linked to organizations with distance calculated',
		options: {
			skipExisting: 'boolean (default: true) - Skip persons that already have a score'
		},
		notes: [
			'Streams progress as NDJSON',
			'Only scores persons linked to orgs with distance > 0',
			'Caches org enrichment to avoid duplicate TIC calls',
			'Uses Perplexity for role detection if Functions field is empty'
		]
	});
};
