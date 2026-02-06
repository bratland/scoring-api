import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { calculateScore, type PersonInput, type CompanyInput } from '$lib/scoring/scorer';

interface ScorePersonRequest {
	person: PersonInput;
	company: CompanyInput;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body: ScorePersonRequest = await request.json();

		if (!body.person) {
			return json({ error: 'Missing "person" object in request body' }, { status: 400 });
		}

		if (!body.company) {
			return json({ error: 'Missing "company" object in request body' }, { status: 400 });
		}

		const result = calculateScore(body.person, body.company);

		return json(result);
	} catch (error) {
		console.error('Scoring error:', error);
		return json(
			{ error: 'Invalid request body', details: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 400 }
		);
	}
};

