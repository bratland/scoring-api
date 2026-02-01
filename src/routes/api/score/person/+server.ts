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

// Also support GET with query params for simple testing
export const GET: RequestHandler = async ({ url }) => {
	const functions = url.searchParams.get('functions')?.split(',') || [];
	const relationship = url.searchParams.get('relationship') || undefined;
	const activities = url.searchParams.get('activities');
	const revenue = url.searchParams.get('revenue');
	const cagr = url.searchParams.get('cagr');
	const industry = url.searchParams.get('industry') || undefined;
	const companyScore = url.searchParams.get('score');

	const person: PersonInput = {
		functions: functions.length > 0 ? functions : undefined,
		relationship_strength: relationship,
		activities_90d: activities ? parseInt(activities, 10) : undefined
	};

	const company: CompanyInput = {
		revenue: revenue ? parseFloat(revenue) : undefined,
		cagr_3y: cagr ? parseFloat(cagr) : undefined,
		industry,
		score: companyScore ? parseFloat(companyScore) : undefined
	};

	const result = calculateScore(person, company);

	return json(result);
};
