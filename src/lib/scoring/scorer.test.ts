import { describe, it, expect } from 'vitest';
import { calculateScore, calculateBulkScores, type PersonInput, type CompanyInput } from './scorer';

describe('scorer', () => {
	describe('calculateScore', () => {
		describe('tier determination', () => {
			it('should return GOLD tier for high scores', () => {
				const person: PersonInput = {
					functions: ['CEO'],
					activities_90d: 25
				};
				const company: CompanyInput = {
					revenue: 150_000_000,
					cagr_3y: 0.25,
					industry: 'Tech',
					distance_km: 30,
					score: 85
				};

				const result = calculateScore(person, company);

				expect(result.tier).toBe('GOLD');
				expect(result.combined_score).toBeGreaterThanOrEqual(70);
			});

			it('should return SILVER tier for medium scores', () => {
				const person: PersonInput = {
					functions: ['Operations'],
					activities_90d: 5
				};
				const company: CompanyInput = {
					revenue: 15_000_000,
					cagr_3y: 0.08,
					industry: 'Manufacturing',
					distance_km: 200
				};

				const result = calculateScore(person, company);

				expect(result.tier).toBe('SILVER');
				expect(result.combined_score).toBeGreaterThanOrEqual(40);
				expect(result.combined_score).toBeLessThan(70);
			});

			it('should return BRONZE tier for low scores', () => {
				const person: PersonInput = {
					functions: [],
					activities_90d: 0
				};
				const company: CompanyInput = {
					revenue: 500_000,
					cagr_3y: -0.15
				};

				const result = calculateScore(person, company);

				expect(result.tier).toBe('BRONZE');
				expect(result.combined_score).toBeLessThan(40);
			});
		});

		describe('person scoring', () => {
			it('should score CEO highest', () => {
				const ceo = calculateScore({ functions: ['CEO'] }, {});
				const sales = calculateScore({ functions: ['Sales'] }, {});

				expect(ceo.breakdown.role_score).toBeGreaterThan(sales.breakdown.role_score);
			});

			it('should take highest role when multiple functions', () => {
				const result = calculateScore({ functions: ['Sales', 'CEO'] }, {});

				expect(result.breakdown.role_score).toBe(100); // CEO score
			});

			it('should use default for unknown role', () => {
				const result = calculateScore({ functions: ['UnknownRole'] }, {});

				expect(result.breakdown.role_score).toBe(40); // Default for unknown
			});

			it('should score high engagement highest', () => {
				const high = calculateScore({ activities_90d: 25 }, {});
				const low = calculateScore({ activities_90d: 1 }, {});

				expect(high.breakdown.engagement_score).toBeGreaterThan(low.breakdown.engagement_score);
			});
		});

		describe('company scoring', () => {
			it('should score high revenue highest', () => {
				const high = calculateScore({}, { revenue: 150_000_000 });
				const low = calculateScore({}, { revenue: 1_000_000 });

				expect(high.breakdown.revenue_score).toBeGreaterThan(low.breakdown.revenue_score);
			});

			it('should score high growth highest', () => {
				const high = calculateScore({}, { cagr_3y: 0.25 });
				const low = calculateScore({}, { cagr_3y: -0.05 });

				expect(high.breakdown.growth_score).toBeGreaterThan(low.breakdown.growth_score);
			});

			it('should score target industry higher', () => {
				const tech = calculateScore({}, { industry: 'Tech' });
				const other = calculateScore({}, { industry: 'Agriculture' });

				expect(tech.breakdown.industry_score).toBeGreaterThan(other.breakdown.industry_score);
			});

			it('should score closer distance higher', () => {
				const close = calculateScore({}, { distance_km: 30 });
				const far = calculateScore({}, { distance_km: 500 });

				expect(close.breakdown.distance_score).toBeGreaterThan(far.breakdown.distance_score);
			});
		});

		describe('factors tracking', () => {
			it('should track used factors', () => {
				const result = calculateScore(
					{ functions: ['CEO'], activities_90d: 10 },
					{ revenue: 50_000_000 }
				);

				expect(result.factors_used).toContain('functions');
				expect(result.factors_used).toContain('activities_90d');
				expect(result.factors_used).toContain('revenue');
			});

			it('should not include unused factors', () => {
				const result = calculateScore({ functions: ['CEO'] }, {});

				expect(result.factors_used).toContain('functions');
				expect(result.factors_used).not.toContain('revenue');
				expect(result.factors_used).not.toContain('cagr_3y');
			});
		});

		describe('score reason', () => {
			it('should include tier in reason', () => {
				const result = calculateScore(
					{ functions: ['CEO'], activities_90d: 25 },
					{ revenue: 150_000_000, cagr_3y: 0.25, industry: 'Tech', distance_km: 30 }
				);

				expect(result.reason).toContain('GOLD');
			});

			it('should mention role in reason', () => {
				const result = calculateScore({ functions: ['CEO'] }, {});

				expect(result.reason).toContain('CEO');
			});

			it('should mention high revenue when present', () => {
				const result = calculateScore({}, { revenue: 150_000_000 });

				expect(result.reason).toMatch(/omsättning|MSEK/i);
			});

			it('should note missing data in reason', () => {
				const result = calculateScore({}, {});

				expect(result.reason).toMatch(/saknas/i);
			});

			it('should mention target industry', () => {
				const result = calculateScore({}, { industry: 'Tech' });

				expect(result.reason).toMatch(/bransch|Tech/i);
			});
		});

		describe('warnings', () => {
			it('should warn when no role provided', () => {
				const result = calculateScore({}, {});

				expect(result.warnings).toContain('No role/function provided - using default score');
			});

			it('should warn when no revenue provided', () => {
				const result = calculateScore({}, {});

				expect(result.warnings).toContain('No revenue data - using default score');
			});

			it('should not warn when data is provided', () => {
				const result = calculateScore(
					{ functions: ['CEO'] },
					{ revenue: 10_000_000 }
				);

				expect(result.warnings).toHaveLength(0);
			});
		});

		describe('default values', () => {
			it('should use defaults for missing person data', () => {
				const result = calculateScore({}, {});

				expect(result.breakdown.role_score).toBe(30); // None default
				expect(result.breakdown.engagement_score).toBe(10);
			});

			it('should use defaults for missing company data', () => {
				const result = calculateScore({}, {});

				expect(result.breakdown.revenue_score).toBe(30);
				expect(result.breakdown.growth_score).toBe(40);
				expect(result.breakdown.industry_score).toBe(50);
				expect(result.breakdown.distance_score).toBe(50);
				expect(result.breakdown.existing_score).toBe(50);
			});
		});

		describe('score calculation', () => {
			it('should calculate person score as weighted sum', () => {
				const result = calculateScore(
					{
						functions: ['CEO'],      // 100
						activities_90d: 25       // 100
					},
					{}
				);

				// person_score = 100*0.55 + 100*0.45 = 100
				expect(result.person_score).toBe(100);
			});

			it('should calculate combined score with proper weights', () => {
				const result = calculateScore(
					{
						functions: ['CEO'],
						activities_90d: 25
					},
					{
						revenue: 150_000_000,
						cagr_3y: 0.25,
						industry: 'Tech',
						distance_km: 30,
						score: 100
					}
				);

				// Both person and company should be close to 100
				// combined = person_score * 0.6 + company_score * 0.4
				expect(result.combined_score).toBeGreaterThanOrEqual(90);
			});
		});
	});

	describe('calculateBulkScores', () => {
		it('should score multiple items', () => {
			const items = [
				{ id: 1, person: { functions: ['CEO'] }, company: { revenue: 100_000_000 } },
				{ id: 2, person: { functions: ['Sales'] }, company: { revenue: 10_000_000 } }
			];

			const results = calculateBulkScores(items);

			expect(results).toHaveLength(2);
			expect(results[0].id).toBe(1);
			expect(results[1].id).toBe(2);
		});

		it('should preserve item ids', () => {
			const items = [
				{ id: 'abc-123', person: {}, company: {} },
				{ id: 456, person: {}, company: {} }
			];

			const results = calculateBulkScores(items);

			expect(results[0].id).toBe('abc-123');
			expect(results[1].id).toBe(456);
		});

		it('should handle empty array', () => {
			const results = calculateBulkScores([]);
			expect(results).toHaveLength(0);
		});
	});
});
