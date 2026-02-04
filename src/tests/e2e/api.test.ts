import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * E2E/Integration tests for Scoring API endpoints
 * These tests directly import and call the server handlers
 *
 * Note: Analysis endpoints require mocking PipedriveClient which is complex
 * in the SvelteKit environment. Those are better tested with Playwright.
 */

import { POST as postScorePerson, GET as getScorePerson } from '../../routes/api/score/person/+server';
import { POST as postScoreBulk } from '../../routes/api/score/bulk/+server';
import { GET as getScoreConfig } from '../../routes/api/score/config/+server';

describe('Scoring API Endpoints', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /api/score/person', () => {
		it('should score a person with full data', async () => {
			const request = new Request('http://localhost/api/score/person', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					person: {
						functions: ['CEO'],
						relationship_strength: 'We know each other',
						activities_90d: 15
					},
					company: {
						revenue: 50_000_000,
						cagr_3y: 0.15,
						industry: 'Tech',
						distance_km: 50
					}
				})
			});

			const response = await postScorePerson({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveProperty('tier');
			expect(data).toHaveProperty('combined_score');
			expect(data).toHaveProperty('breakdown');
			expect(['GOLD', 'SILVER', 'BRONZE']).toContain(data.tier);
		});

		it('should return GOLD tier for optimal inputs', async () => {
			const request = new Request('http://localhost/api/score/person', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					person: {
						functions: ['CEO'],
						relationship_strength: 'We know each other',
						activities_90d: 25
					},
					company: {
						revenue: 150_000_000,
						cagr_3y: 0.25,
						industry: 'Tech',
						distance_km: 30,
						score: 90
					}
				})
			});

			const response = await postScorePerson({ request } as any);
			const data = await response.json();

			expect(data.tier).toBe('GOLD');
			expect(data.combined_score).toBeGreaterThanOrEqual(70);
		});

		it('should return BRONZE tier for minimal data', async () => {
			const request = new Request('http://localhost/api/score/person', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					person: {},
					company: {}
				})
			});

			const response = await postScorePerson({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.tier).toBe('BRONZE');
			expect(data.warnings.length).toBeGreaterThan(0);
		});

		it('should reject missing person object', async () => {
			const request = new Request('http://localhost/api/score/person', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ company: {} })
			});

			const response = await postScorePerson({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('person');
		});

		it('should reject missing company object', async () => {
			const request = new Request('http://localhost/api/score/person', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ person: {} })
			});

			const response = await postScorePerson({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('company');
		});

		it('should reject invalid JSON', async () => {
			const request = new Request('http://localhost/api/score/person', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'invalid json'
			});

			const response = await postScorePerson({ request } as any);

			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/score/person', () => {
		it('should score via query params', async () => {
			const url = new URL('http://localhost/api/score/person?functions=CEO&revenue=50000000');

			const response = await getScorePerson({ url } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveProperty('tier');
			expect(data).toHaveProperty('combined_score');
		});

		it('should handle multiple functions', async () => {
			const url = new URL('http://localhost/api/score/person?functions=CEO,Sales&revenue=50000000');

			const response = await getScorePerson({ url } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.breakdown.role_score).toBe(100); // CEO is highest
		});
	});

	describe('POST /api/score/bulk', () => {
		it('should score multiple items', async () => {
			const request = new Request('http://localhost/api/score/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					items: [
						{ id: 1, person: { functions: ['CEO'] }, company: { revenue: 100_000_000 } },
						{ id: 2, person: { functions: ['Sales'] }, company: { revenue: 10_000_000 } }
					]
				})
			});

			const response = await postScoreBulk({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.results).toHaveLength(2);
			expect(data.results[0].id).toBe(1);
			expect(data.results[1].id).toBe(2);
		});

		it('should return summary statistics', async () => {
			const request = new Request('http://localhost/api/score/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					items: [
						{ id: 1, person: { functions: ['CEO'] }, company: { revenue: 100_000_000, cagr_3y: 0.2, industry: 'Tech' } },
						{ id: 2, person: { functions: ['None'] }, company: { revenue: 500_000 } }
					]
				})
			});

			const response = await postScoreBulk({ request } as any);
			const data = await response.json();

			expect(data).toHaveProperty('summary');
			expect(data.summary.total).toBe(2);
			expect(data.summary.gold + data.summary.silver + data.summary.bronze).toBe(2);
			expect(data.summary).toHaveProperty('average_score');
		});

		it('should handle empty items array', async () => {
			const request = new Request('http://localhost/api/score/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items: [] })
			});

			const response = await postScoreBulk({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.results).toHaveLength(0);
		});

		it('should reject more than 1000 items', async () => {
			const items = Array(1001).fill(null).map((_, i) => ({
				id: i,
				person: {},
				company: {}
			}));

			const request = new Request('http://localhost/api/score/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items })
			});

			const response = await postScoreBulk({ request } as any);

			expect(response.status).toBe(400);
		});

		it('should reject missing items array', async () => {
			const request = new Request('http://localhost/api/score/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const response = await postScoreBulk({ request } as any);

			expect(response.status).toBe(400);
		});

		it('should preserve string and number ids', async () => {
			const request = new Request('http://localhost/api/score/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					items: [
						{ id: 'abc-123', person: {}, company: {} },
						{ id: 456, person: {}, company: {} }
					]
				})
			});

			const response = await postScoreBulk({ request } as any);
			const data = await response.json();

			expect(data.results[0].id).toBe('abc-123');
			expect(data.results[1].id).toBe(456);
		});
	});

	describe('GET /api/score/config', () => {
		it('should return scoring configuration', async () => {
			const response = await getScoreConfig({} as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveProperty('config');
			expect(data).toHaveProperty('usage');
		});

		it('should include weights in config', async () => {
			const response = await getScoreConfig({} as any);
			const data = await response.json();

			expect(data.config.weights.person).toBe(0.6);
			expect(data.config.weights.company).toBe(0.4);
		});

		it('should include tier thresholds', async () => {
			const response = await getScoreConfig({} as any);
			const data = await response.json();

			expect(data.config.tiers.gold).toBe(70);
			expect(data.config.tiers.silver).toBe(40);
		});

		it('should include role scores', async () => {
			const response = await getScoreConfig({} as any);
			const data = await response.json();

			expect(data.config.roleScores).toHaveProperty('CEO');
			expect(data.config.roleScores.CEO).toBe(100);
		});

		it('should include usage examples', async () => {
			const response = await getScoreConfig({} as any);
			const data = await response.json();

			expect(data.usage).toHaveProperty('single');
			expect(data.usage).toHaveProperty('bulk');
			expect(data.usage).toHaveProperty('test');
		});
	});
});
