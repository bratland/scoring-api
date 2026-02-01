import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { calculateBulkScores, type PersonInput, type CompanyInput } from '$lib/scoring/scorer';

interface BulkScoreRequest {
	items: Array<{
		id?: string | number;
		person: PersonInput;
		company: CompanyInput;
	}>;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body: BulkScoreRequest = await request.json();

		if (!body.items || !Array.isArray(body.items)) {
			return json({ error: 'Missing "items" array in request body' }, { status: 400 });
		}

		if (body.items.length > 1000) {
			return json({ error: 'Maximum 1000 items per request' }, { status: 400 });
		}

		const results = calculateBulkScores(body.items);

		// Calculate summary statistics
		const summary = {
			total: results.length,
			gold: results.filter(r => r.tier === 'GOLD').length,
			silver: results.filter(r => r.tier === 'SILVER').length,
			bronze: results.filter(r => r.tier === 'BRONZE').length,
			average_score: Math.round(
				results.reduce((sum, r) => sum + r.combined_score, 0) / results.length
			)
		};

		return json({
			results,
			summary
		});
	} catch (error) {
		console.error('Bulk scoring error:', error);
		return json(
			{ error: 'Invalid request body', details: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 400 }
		);
	}
};
