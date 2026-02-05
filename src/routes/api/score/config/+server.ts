import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SCORING_CONFIG } from '$lib/scoring/config';

export const GET: RequestHandler = async () => {
	return json({
		description: 'Current scoring configuration',
		config: SCORING_CONFIG,
		usage: {
			single: {
				method: 'POST',
				endpoint: '/api/score/person',
				body: {
					person: {
						functions: ['CEO', 'Sales'],
						activities_90d: 10
					},
					company: {
						revenue: 15000000,
						cagr_3y: 0.15,
						score: 65,
						industry: 'Tech'
					}
				}
			},
			bulk: {
				method: 'POST',
				endpoint: '/api/score/bulk',
				body: {
					items: [
						{
							id: 'person-123',
							person: { functions: ['CEO'] },
							company: { revenue: 50000000 }
						}
					]
				}
			},
			test: {
				method: 'GET',
				endpoint: '/api/score/person?functions=CEO,Sales&revenue=15000000&cagr=0.15'
			}
		}
	});
};
