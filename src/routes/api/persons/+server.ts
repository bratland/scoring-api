import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PipedriveClient, extractOrgId } from '$lib/pipedrive/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const apiToken = env.TARGET_PIPEDRIVE_API_TOKEN;

	if (!apiToken) {
		return json({ error: 'Pipedrive API token not configured' }, { status: 500 });
	}

	try {
		const client = new PipedriveClient({ apiToken });
		const persons = await client.getAllPersons();

		// Get query params for filtering
		const search = url.searchParams.get('search')?.toLowerCase();
		const orgId = url.searchParams.get('org_id');
		const sortBy = url.searchParams.get('sort') || 'name';
		const sortOrder = url.searchParams.get('order') || 'asc';

		// Filter
		let filtered = persons;

		if (search) {
			filtered = filtered.filter(person =>
				person.name?.toLowerCase().includes(search) ||
				String(person.id).includes(search)
			);
		}

		if (orgId) {
			const orgIdNum = parseInt(orgId, 10);
			filtered = filtered.filter(person => {
				const personOrgId = extractOrgId(person.org_id);
				return personOrgId === orgIdNum;
			});
		}

		// Sort
		filtered.sort((a, b) => {
			let aVal = a[sortBy as keyof typeof a];
			let bVal = b[sortBy as keyof typeof b];

			if (typeof aVal === 'string') aVal = aVal.toLowerCase();
			if (typeof bVal === 'string') bVal = bVal.toLowerCase();

			if (aVal === undefined || aVal === null) return 1;
			if (bVal === undefined || bVal === null) return -1;

			if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
			return 0;
		});

		return json({
			success: true,
			data: filtered,
			total: filtered.length,
			originalTotal: persons.length
		});
	} catch (error) {
		console.error('Failed to fetch persons:', error);
		return json(
			{ error: 'Failed to fetch persons', details: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
