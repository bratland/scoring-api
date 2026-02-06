import { describe, it, expect } from 'vitest';
import { calculateCompanyScore, type CompanyScoreResult } from './company-scorer';
import { calculateScore, type CompanyInput } from './scorer';
import { SCORING_CONFIG } from './config';

describe('company-scorer', () => {
	describe('calculateCompanyScore', () => {

		// --- PARITY TESTS (critical) ---
		describe('parity with calculateScore', () => {
			it('should produce identical company_score as calculateScore for high-value company', () => {
				const company: CompanyInput = {
					revenue: 600_000_000,
					cagr_3y: 0.25,
					industry: 'Tech',
					distance_km: 30,
					score: 85
				};
				const companyResult = calculateCompanyScore(company);
				const fullResult = calculateScore({}, company);
				expect(companyResult.company_score).toBe(fullResult.company_score);
			});

			it('should produce identical company_score as calculateScore for low-value company', () => {
				const company: CompanyInput = {
					revenue: 5_000_000,
					cagr_3y: -0.15,
					industry: 'Agriculture',
					distance_km: 800,
					score: 20
				};
				const companyResult = calculateCompanyScore(company);
				const fullResult = calculateScore({}, company);
				expect(companyResult.company_score).toBe(fullResult.company_score);
			});

			it('should produce identical company_score as calculateScore with all defaults', () => {
				const company: CompanyInput = {};
				const companyResult = calculateCompanyScore(company);
				const fullResult = calculateScore({}, company);
				expect(companyResult.company_score).toBe(fullResult.company_score);
			});

			it('should produce identical company_score as calculateScore for mid-range company', () => {
				const company: CompanyInput = {
					revenue: 75_000_000,
					cagr_3y: 0.08,
					industry: 'Manufacturing',
					distance_km: 250,
					score: 55
				};
				const companyResult = calculateCompanyScore(company);
				const fullResult = calculateScore({}, company);
				expect(companyResult.company_score).toBe(fullResult.company_score);
			});

			it('should produce identical breakdown scores as calculateScore', () => {
				const company: CompanyInput = {
					revenue: 150_000_000,
					cagr_3y: 0.12,
					industry: 'Software',
					distance_km: 120,
					score: 70
				};
				const companyResult = calculateCompanyScore(company);
				const fullResult = calculateScore({}, company);
				expect(companyResult.breakdown.revenue_score).toBe(fullResult.breakdown.revenue_score);
				expect(companyResult.breakdown.growth_score).toBe(fullResult.breakdown.growth_score);
				expect(companyResult.breakdown.industry_score).toBe(fullResult.breakdown.industry_score);
				expect(companyResult.breakdown.distance_score).toBe(fullResult.breakdown.distance_score);
				expect(companyResult.breakdown.existing_score).toBe(fullResult.breakdown.existing_score);
			});
		});

		// --- SCORE CALCULATION ---
		describe('weighted score calculation', () => {
			it('should calculate score as weighted sum of factors', () => {
				// All max scores: revenue=100, growth=100, industry=90, distance=100, existing=100
				const company: CompanyInput = {
					revenue: 600_000_000,
					cagr_3y: 0.25,
					industry: 'Tech',
					distance_km: 30,
					score: 100
				};
				const result = calculateCompanyScore(company);
				const expected = Math.round(
					100 * 0.25 + 100 * 0.20 + 90 * 0.20 + 100 * 0.20 + 100 * 0.15
				);
				expect(result.company_score).toBe(expected);
			});

			it('should round to nearest integer', () => {
				// Use values that produce a non-integer weighted sum
				const company: CompanyInput = {
					revenue: 150_000_000, // 70
					cagr_3y: 0.08,        // 55
					industry: 'Agriculture', // 50
					distance_km: 250,     // 55
					score: 33             // 33
				};
				const result = calculateCompanyScore(company);
				const rawScore =
					70 * 0.25 + 55 * 0.20 + 50 * 0.20 + 55 * 0.20 + 33 * 0.15;
				expect(result.company_score).toBe(Math.round(rawScore));
			});
		});

		// --- REVENUE SCORING ---
		describe('revenue scoring', () => {
			it('should score >500M SEK as 100', () => {
				const result = calculateCompanyScore({ revenue: 600_000_000 });
				expect(result.breakdown.revenue_score).toBe(100);
			});

			it('should score 200-500M SEK as 85', () => {
				const result = calculateCompanyScore({ revenue: 300_000_000 });
				expect(result.breakdown.revenue_score).toBe(85);
			});

			it('should score 100-200M SEK as 70', () => {
				const result = calculateCompanyScore({ revenue: 150_000_000 });
				expect(result.breakdown.revenue_score).toBe(70);
			});

			it('should score 50-100M SEK as 55', () => {
				const result = calculateCompanyScore({ revenue: 75_000_000 });
				expect(result.breakdown.revenue_score).toBe(55);
			});

			it('should score 20-50M SEK as 40', () => {
				const result = calculateCompanyScore({ revenue: 30_000_000 });
				expect(result.breakdown.revenue_score).toBe(40);
			});

			it('should score 10-20M SEK as 25', () => {
				const result = calculateCompanyScore({ revenue: 15_000_000 });
				expect(result.breakdown.revenue_score).toBe(25);
			});

			it('should score <10M SEK as 10', () => {
				const result = calculateCompanyScore({ revenue: 5_000_000 });
				expect(result.breakdown.revenue_score).toBe(10);
			});

			it('should default to 30 when undefined', () => {
				const result = calculateCompanyScore({});
				expect(result.breakdown.revenue_score).toBe(30);
			});
		});

		// --- GROWTH SCORING ---
		describe('growth scoring', () => {
			it('should score >20% CAGR as 100', () => {
				const result = calculateCompanyScore({ cagr_3y: 0.25 });
				expect(result.breakdown.growth_score).toBe(100);
			});

			it('should score 15-20% as 85', () => {
				const result = calculateCompanyScore({ cagr_3y: 0.17 });
				expect(result.breakdown.growth_score).toBe(85);
			});

			it('should score 10-15% as 70', () => {
				const result = calculateCompanyScore({ cagr_3y: 0.12 });
				expect(result.breakdown.growth_score).toBe(70);
			});

			it('should score 5-10% as 55', () => {
				const result = calculateCompanyScore({ cagr_3y: 0.07 });
				expect(result.breakdown.growth_score).toBe(55);
			});

			it('should score 0-5% as 40', () => {
				const result = calculateCompanyScore({ cagr_3y: 0.03 });
				expect(result.breakdown.growth_score).toBe(40);
			});

			it('should score -10% to 0% as 25', () => {
				const result = calculateCompanyScore({ cagr_3y: -0.05 });
				expect(result.breakdown.growth_score).toBe(25);
			});

			it('should score < -10% as 10', () => {
				const result = calculateCompanyScore({ cagr_3y: -0.15 });
				expect(result.breakdown.growth_score).toBe(10);
			});

			it('should default to 40 when undefined', () => {
				const result = calculateCompanyScore({});
				expect(result.breakdown.growth_score).toBe(40);
			});
		});

		// --- INDUSTRY SCORING ---
		describe('industry scoring', () => {
			it('should score target industries as 90', () => {
				const result = calculateCompanyScore({ industry: 'Tech' });
				expect(result.breakdown.industry_score).toBe(90);
			});

			it('should score non-target industries as 50', () => {
				const result = calculateCompanyScore({ industry: 'Agriculture' });
				expect(result.breakdown.industry_score).toBe(50);
			});

			it('should be case-insensitive for target match', () => {
				const result = calculateCompanyScore({ industry: 'CONSULTING' });
				expect(result.breakdown.industry_score).toBe(90);
			});

			it('should match partial industry names (e.g. "Information Technology" matches "Tech")', () => {
				const result = calculateCompanyScore({ industry: 'Information Technology' });
				expect(result.breakdown.industry_score).toBe(90);
			});

			it('should default to 50 when undefined', () => {
				const result = calculateCompanyScore({});
				expect(result.breakdown.industry_score).toBe(50);
			});
		});

		// --- DISTANCE SCORING ---
		describe('distance scoring', () => {
			it('should score <=50km as 100', () => {
				const result = calculateCompanyScore({ distance_km: 30 });
				expect(result.breakdown.distance_score).toBe(100);
			});

			it('should score 51-100km as 85', () => {
				const result = calculateCompanyScore({ distance_km: 75 });
				expect(result.breakdown.distance_score).toBe(85);
			});

			it('should score 101-200km as 70', () => {
				const result = calculateCompanyScore({ distance_km: 150 });
				expect(result.breakdown.distance_score).toBe(70);
			});

			it('should score 201-400km as 55', () => {
				const result = calculateCompanyScore({ distance_km: 300 });
				expect(result.breakdown.distance_score).toBe(55);
			});

			it('should score 401-600km as 40', () => {
				const result = calculateCompanyScore({ distance_km: 500 });
				expect(result.breakdown.distance_score).toBe(40);
			});

			it('should score 601-1000km as 25', () => {
				const result = calculateCompanyScore({ distance_km: 800 });
				expect(result.breakdown.distance_score).toBe(25);
			});

			it('should score >1000km as 15', () => {
				const result = calculateCompanyScore({ distance_km: 1500 });
				expect(result.breakdown.distance_score).toBe(15);
			});

			it('should default to 50 when undefined', () => {
				const result = calculateCompanyScore({});
				expect(result.breakdown.distance_score).toBe(50);
			});
		});

		// --- EXISTING SCORE ---
		describe('existing score (credit)', () => {
			it('should use provided score directly', () => {
				const result = calculateCompanyScore({ score: 72 });
				expect(result.breakdown.existing_score).toBe(72);
			});

			it('should default to 50 when undefined', () => {
				const result = calculateCompanyScore({});
				expect(result.breakdown.existing_score).toBe(50);
			});
		});

		// --- FACTORS TRACKING ---
		describe('factors tracking', () => {
			it('should track all provided factors', () => {
				const result = calculateCompanyScore({
					revenue: 100_000_000,
					cagr_3y: 0.10,
					industry: 'Tech',
					distance_km: 50,
					score: 80
				});
				expect(result.factors_used).toContain('revenue');
				expect(result.factors_used).toContain('cagr_3y');
				expect(result.factors_used).toContain('industry');
				expect(result.factors_used).toContain('distance_km');
				expect(result.factors_used).toContain('company_score');
			});

			it('should not include undefined factors', () => {
				const result = calculateCompanyScore({});
				expect(result.factors_used).toHaveLength(0);
			});

			it('should include industry only when non-empty string', () => {
				const result1 = calculateCompanyScore({ industry: '' });
				expect(result1.factors_used).not.toContain('industry');

				const result2 = calculateCompanyScore({ industry: 'Tech' });
				expect(result2.factors_used).toContain('industry');
			});
		});

		// --- WARNINGS ---
		describe('warnings', () => {
			it('should warn when revenue is missing', () => {
				const result = calculateCompanyScore({});
				expect(result.warnings).toContain('No revenue data - using default score');
			});

			it('should not warn when revenue is provided', () => {
				const result = calculateCompanyScore({ revenue: 50_000_000 });
				expect(result.warnings).not.toContain('No revenue data - using default score');
			});
		});

		// --- REASON GENERATION ---
		describe('reason generation', () => {
			it('should label high scores as "Starkt företag"', () => {
				const result = calculateCompanyScore({
					revenue: 600_000_000,
					cagr_3y: 0.25,
					industry: 'Tech',
					distance_km: 30,
					score: 90
				});
				expect(result.reason).toContain('Starkt företag');
			});

			it('should label medium scores as "Medelstarkt företag"', () => {
				const result = calculateCompanyScore({
					revenue: 75_000_000,
					cagr_3y: 0.07,
					industry: 'Manufacturing',
					distance_km: 300,
					score: 50
				});
				expect(result.reason).toContain('Medelstarkt företag');
			});

			it('should label low scores as "Svagare företag"', () => {
				const result = calculateCompanyScore({
					revenue: 5_000_000,
					cagr_3y: -0.15,
					industry: 'Agriculture',
					distance_km: 1500,
					score: 10
				});
				expect(result.reason).toContain('Svagare företag');
			});

			it('should mention high revenue in MSEK', () => {
				const result = calculateCompanyScore({ revenue: 300_000_000 });
				expect(result.reason).toContain('hög omsättning');
				expect(result.reason).toContain('MSEK');
			});

			it('should mention low revenue', () => {
				const result = calculateCompanyScore({ revenue: 5_000_000 });
				expect(result.reason).toContain('låg omsättning');
			});

			it('should mention target industry as "prioriterad bransch"', () => {
				const result = calculateCompanyScore({ industry: 'Software' });
				expect(result.reason).toContain('prioriterad bransch');
				expect(result.reason).toContain('Software');
			});

			it('should mention non-target industry with label', () => {
				const result = calculateCompanyScore({ industry: 'Agriculture' });
				expect(result.reason).toContain('bransch: Agriculture');
			});

			it('should mention strong growth percentage', () => {
				const result = calculateCompanyScore({ cagr_3y: 0.25 });
				expect(result.reason).toContain('stark tillväxt');
				expect(result.reason).toContain('25%');
			});

			it('should mention negative growth', () => {
				const result = calculateCompanyScore({ cagr_3y: -0.15 });
				expect(result.reason).toContain('negativ tillväxt');
				expect(result.reason).toContain('-15%');
			});

			it('should mention close distance in km', () => {
				const result = calculateCompanyScore({ distance_km: 30 });
				expect(result.reason).toContain('nära');
				expect(result.reason).toContain('30 km');
			});

			it('should mention far distance', () => {
				const result = calculateCompanyScore({ distance_km: 800 });
				expect(result.reason).toContain('långt avstånd');
				expect(result.reason).toContain('800 km');
			});

			it('should handle all fields missing gracefully', () => {
				const result = calculateCompanyScore({});
				expect(result.reason).toBeTruthy();
				// Should still have a tier label but no details
				expect(result.reason).toMatch(/företag/i);
			});
		});

		// --- EDGE CASES ---
		describe('edge cases', () => {
			it('should handle empty CompanyInput object', () => {
				const result = calculateCompanyScore({});
				expect(result.company_score).toBeGreaterThanOrEqual(0);
				expect(result.company_score).toBeLessThanOrEqual(100);
				expect(result.breakdown).toBeDefined();
				expect(result.reason).toBeTruthy();
			});

			it('should handle zero revenue', () => {
				const result = calculateCompanyScore({ revenue: 0 });
				expect(result.breakdown.revenue_score).toBe(10);
			});

			it('should handle zero distance', () => {
				const result = calculateCompanyScore({ distance_km: 0 });
				expect(result.breakdown.distance_score).toBe(100);
			});

			it('should handle negative CAGR', () => {
				const result = calculateCompanyScore({ cagr_3y: -0.20 });
				expect(result.breakdown.growth_score).toBe(10);
			});

			it('should handle very large values', () => {
				const result = calculateCompanyScore({
					revenue: 10_000_000_000,
					cagr_3y: 1.0,
					distance_km: 10_000,
					score: 100
				});
				expect(result.company_score).toBeGreaterThanOrEqual(0);
				expect(result.company_score).toBeLessThanOrEqual(100);
			});
		});

	});
});
