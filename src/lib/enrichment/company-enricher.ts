/**
 * Company Data Enricher
 *
 * Enriches Pipedrive organizations with TIC.io company data.
 * TIC client handles Redis caching to stay within 1000 calls/month limit.
 * Results are saved to existing Pipedrive fields.
 */

import { TicClient, distanceToGothenburg, type TicCompanyData } from '../tic';
import { PipedriveClient } from '../pipedrive/client';
import { geocodeCity, isCityInCache } from '../geo';

export interface EnrichedCompanyData {
	// Identifiers
	pipedriveOrgId: number;
	orgNumber?: string;
	ticCompanyId?: string;
	name?: string;

	// TIC data
	revenue?: number;           // In SEK (converted from thousands)
	cagr3y?: number;            // 3-year compound annual growth rate
	employees?: number;
	personnelCosts?: number;    // Total personnel costs in SEK
	hourlyLaborCost?: number;   // Calculated: personnelCosts / employees / workingHours
	creditScore?: number;
	sniCode?: string;
	industry?: string;          // SNI description / industry name
	distanceToGothenburg?: number;  // Calculated from coordinates

	// Metadata
	dataSource: 'cache' | 'tic' | 'pipedrive';
	cacheAge?: number;          // Days since last TIC fetch
	lastUpdated?: string;
}

export interface TicFieldMapping {
	orgNumber: string;          // Field key for organization number
	city: string;               // Field key for city (fallback for geocoding)
	revenue: string;            // Omsättning
	employees: string;          // Antal anställda (system field)
	sniCode: string;            // SNI-Kod
	industry: string;           // Industry (Official)
	cagr3y: string;             // CAGR 3Y
	distanceGbg: string;        // Avstånd GBG
	personnelCostPerEmployee: string;  // Personalkostnader per anställd
	score: string;              // Score
	companyScore: string;       // Company Score (0-100)
	companyScoreReason: string; // Company Score Reason (Swedish text)
	ticUpdated: string;         // TIC Uppdaterad (timestamp)
}

// Default field names - mapped to existing Pipedrive field names
export const DEFAULT_TIC_FIELD_NAMES: Record<keyof TicFieldMapping, string> = {
	orgNumber: 'Organisationsnummer',
	city: 'Ort',
	revenue: 'Omsättning',
	employees: 'Antal anställda',
	sniCode: 'SNI-Kod',
	industry: 'Industry (Official)',
	cagr3y: 'CAGR 3Y',
	distanceGbg: 'Avstånd GBG',
	personnelCostPerEmployee: 'Personalkostnader per anställd (enligt ÅR)',
	score: 'Score',
	companyScore: 'Company Score',
	companyScoreReason: 'Company Score Reason',
	ticUpdated: 'TIC Uppdaterad'
};

// Standard Swedish working hours per year (40h/week * 43 weeks after vacation/holidays)
const WORKING_HOURS_PER_YEAR = 1720;

export class CompanyEnricher {
	private ticClient: TicClient;
	private pipedriveClient: PipedriveClient;
	private fieldMapping: TicFieldMapping | null = null;

	constructor(ticClient: TicClient, pipedriveClient: PipedriveClient) {
		this.ticClient = ticClient;
		this.pipedriveClient = pipedriveClient;
	}

	/**
	 * Set field mapping (must be called before enriching if fields have custom keys)
	 */
	setFieldMapping(mapping: TicFieldMapping): void {
		this.fieldMapping = mapping;
	}

	/**
	 * Get enriched company data for a Pipedrive organization
	 * TIC client handles caching via Redis - we just save results to Pipedrive
	 *
	 * @param orgId Pipedrive organization ID
	 * @param orgData Optional pre-fetched organization data
	 * @returns Enriched company data
	 */
	async enrichCompany(
		orgId: number,
		orgData?: Record<string, unknown>
	): Promise<EnrichedCompanyData> {
		// Fetch org data if not provided
		if (!orgData) {
			const orgResult = await this.pipedriveClient.getOrganization(orgId);
			if (!orgResult.success || !orgResult.data) {
				return {
					pipedriveOrgId: orgId,
					dataSource: 'pipedrive'
				};
			}
			orgData = orgResult.data as Record<string, unknown>;
		}

		const orgName = orgData.name as string | undefined;

		// Extract org number and city (for geocoding fallback)
		const orgNumber = this.findFieldValue(orgData, 'orgNumber') as string | undefined;
		const city = this.extractCity(orgData);

		// Fetch from TIC (client handles Redis caching internally)
		const ticResult = await this.ticClient.getCompanyData(orgNumber, null, orgName);

		if (!ticResult.success || !ticResult.data) {
			// TIC fetch failed - return basic Pipedrive data with distance
			const distance = await this.calculateDistanceWithFallback(undefined, undefined, city);
			return {
				pipedriveOrgId: orgId,
				name: orgName,
				orgNumber,
				distanceToGothenburg: distance,
				dataSource: 'pipedrive'
			};
		}

		// Build enriched data from TIC response (calculates distance)
		const enrichedData = await this.buildEnrichedDataFromTicAsync(
			orgId,
			orgName,
			ticResult.data.orgNumber || orgNumber || '',
			ticResult.data,
			city
		);

		// Update Pipedrive with TIC data including distance
		await this.updateCache(orgId, ticResult.data, enrichedData.distanceToGothenburg);

		return enrichedData;
	}

	/**
	 * Extract city from Pipedrive organization data
	 * Tries multiple common field patterns
	 */
	private extractCity(orgData: Record<string, unknown>): string | undefined {
		// Try the configured city field first
		const configuredCity = this.findFieldValue(orgData, 'city');
		if (configuredCity && typeof configuredCity === 'string') {
			return configuredCity;
		}

		// Try standard Pipedrive address field
		const address = orgData.address as string | undefined;
		if (address) {
			// Try to extract city from address (often format: "Street, City" or "Street, Postal City")
			const parts = address.split(',');
			if (parts.length >= 2) {
				// Last part often contains city
				const lastPart = parts[parts.length - 1].trim();
				// Remove postal code if present (Swedish postal codes are 5 digits)
				const cityMatch = lastPart.replace(/^\d{3}\s?\d{2}\s*/, '').trim();
				if (cityMatch) return cityMatch;
			}
		}

		// Try address_locality (some Pipedrive setups use this)
		const locality = orgData.address_locality as string | undefined;
		if (locality) return locality;

		return undefined;
	}

	/**
	 * Find field value using mapping or field name
	 */
	private findFieldValue(orgData: Record<string, unknown>, fieldKey: keyof TicFieldMapping): unknown {
		// If we have a mapping, use the field key directly
		if (this.fieldMapping) {
			return orgData[this.fieldMapping[fieldKey]];
		}

		// Otherwise, search by field name
		const fieldName = DEFAULT_TIC_FIELD_NAMES[fieldKey];
		for (const [key, value] of Object.entries(orgData)) {
			if (key === fieldName || (typeof value === 'object' && value !== null && 'name' in (value as object))) {
				return orgData[key];
			}
		}

		// Try case-insensitive match
		for (const [key, value] of Object.entries(orgData)) {
			if (key.toLowerCase().includes(fieldName.toLowerCase())) {
				return value;
			}
		}

		return undefined;
	}

	private parseNumber(value: unknown): number | undefined {
		if (value === null || value === undefined) return undefined;
		if (typeof value === 'number') return value;
		if (typeof value === 'string') {
			const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
			return isNaN(parsed) ? undefined : parsed;
		}
		return undefined;
	}

	/**
	 * Calculate hourly labor cost from personnel costs and employee count
	 */
	private calculateHourlyLaborCost(personnelCosts?: number, employees?: number): number | undefined {
		if (!personnelCosts || !employees || employees === 0) return undefined;
		// personnelCosts is in thousands SEK, convert to SEK then divide by employees and hours
		return (personnelCosts * 1000) / employees / WORKING_HOURS_PER_YEAR;
	}

	/**
	 * Update Pipedrive organization with fresh TIC data
	 * Uses existing Pipedrive fields instead of TIC-specific fields
	 */
	private async updateCache(orgId: number, ticData: TicCompanyData, distanceToGothenburg?: number): Promise<void> {
		if (!this.fieldMapping) {
			console.warn('No field mapping set - cannot update Pipedrive cache');
			return;
		}

		// Calculate hourly labor cost
		const hourlyLaborCost = this.calculateHourlyLaborCost(ticData.personnelCosts, ticData.employees);

		const updates: Record<string, unknown> = {};

		// Map TIC data to existing Pipedrive fields
		if (ticData.orgNumber && this.fieldMapping.orgNumber) {
			updates[this.fieldMapping.orgNumber] = ticData.orgNumber;
		}
		if (ticData.revenue !== undefined && ticData.revenue > 0 && this.fieldMapping.revenue) {
			// Revenue field is monetary - needs value and currency
			// TIC gives thousands SEK, convert to SEK
			updates[this.fieldMapping.revenue] = ticData.revenue * 1000;
			updates[this.fieldMapping.revenue + '_currency'] = 'SEK';
		}
		if (ticData.sniCode && this.fieldMapping.sniCode) {
			updates[this.fieldMapping.sniCode] = ticData.sniCode;
		}
		if (ticData.sniDescription && this.fieldMapping.industry) {
			updates[this.fieldMapping.industry] = ticData.sniDescription;
		}
		if (ticData.cagr3y !== undefined && this.fieldMapping.cagr3y) {
			// CAGR as decimal (0.15 = 15%)
			updates[this.fieldMapping.cagr3y] = ticData.cagr3y;
		}
		if (distanceToGothenburg !== undefined && this.fieldMapping.distanceGbg) {
			updates[this.fieldMapping.distanceGbg] = Math.round(distanceToGothenburg);
		}
		if (hourlyLaborCost !== undefined && this.fieldMapping.personnelCostPerEmployee) {
			// Hourly cost field is monetary - needs value and currency
			updates[this.fieldMapping.personnelCostPerEmployee] = Math.round(hourlyLaborCost);
			updates[this.fieldMapping.personnelCostPerEmployee + '_currency'] = 'SEK';
		}
		if (ticData.fetchedAt && this.fieldMapping.ticUpdated) {
			updates[this.fieldMapping.ticUpdated] = ticData.fetchedAt;
		}

		// Remove undefined values and empty updates
		for (const key of Object.keys(updates)) {
			if (updates[key] === undefined || updates[key] === null) {
				delete updates[key];
			}
		}

		if (Object.keys(updates).length === 0) {
			console.log('No updates to apply for organization', orgId);
			return;
		}

		console.log(`Updating org ${orgId} with:`, Object.keys(updates).join(', '));
		await this.pipedriveClient.updateOrganization(orgId, updates);
	}

	/**
	 * Calculate distance to Gothenburg using coordinates or city geocoding
	 * Priority: 1) TIC coordinates, 2) Cached geocoding, 3) Live geocoding
	 */
	private async calculateDistanceWithFallback(
		latitude?: number,
		longitude?: number,
		city?: string
	): Promise<number | undefined> {
		// If we have coordinates, use them directly
		if (latitude && longitude) {
			return distanceToGothenburg(latitude, longitude);
		}

		// No coordinates - try geocoding by city
		if (!city) {
			return undefined;
		}

		// Check if city is in cache (fast path - no API call)
		if (isCityInCache(city)) {
			const result = await geocodeCity(city);
			if (result) {
				return distanceToGothenburg(result.latitude, result.longitude);
			}
		}

		// City not in cache - call Nominatim API (rate-limited)
		// Only do this if we really need the data
		const result = await geocodeCity(city);
		if (result) {
			return distanceToGothenburg(result.latitude, result.longitude);
		}

		return undefined;
	}

	/**
	 * Build enriched data from fresh TIC API response (async - uses geocoding fallback)
	 */
	private async buildEnrichedDataFromTicAsync(
		orgId: number,
		name: string | undefined,
		orgNumber: string,
		ticData: TicCompanyData,
		city: string | undefined
	): Promise<EnrichedCompanyData> {
		// Try to get distance - coordinates first, then geocoding fallback
		const distance = await this.calculateDistanceWithFallback(
			ticData.latitude,
			ticData.longitude,
			city
		);

		// Calculate hourly labor cost if we have the data
		const hourlyLaborCost = this.calculateHourlyLaborCost(ticData.personnelCosts, ticData.employees);

		return {
			pipedriveOrgId: orgId,
			name: ticData.name || name,
			orgNumber,
			ticCompanyId: ticData.companyId,
			revenue: ticData.revenue ? ticData.revenue * 1000 : undefined, // Convert from thousands
			cagr3y: ticData.cagr3y,
			employees: ticData.employees,
			personnelCosts: ticData.personnelCosts ? ticData.personnelCosts * 1000 : undefined, // Convert from thousands
			hourlyLaborCost,
			creditScore: ticData.creditScore,
			sniCode: ticData.sniCode,
			industry: ticData.sniDescription,
			distanceToGothenburg: distance,
			dataSource: 'tic',
			cacheAge: 0,
			lastUpdated: ticData.fetchedAt
		};
	}

	/**
	 * Store company score and reason in Pipedrive organization fields
	 */
	async updateCompanyScore(orgId: number, score: number, reason: string): Promise<void> {
		if (!this.fieldMapping) {
			console.warn('No field mapping set - cannot update company score');
			return;
		}

		const updates: Record<string, unknown> = {};

		if (this.fieldMapping.companyScore) {
			updates[this.fieldMapping.companyScore] = Math.round(score);
		}
		if (this.fieldMapping.companyScoreReason) {
			updates[this.fieldMapping.companyScoreReason] = reason;
		}

		if (Object.keys(updates).length === 0) {
			console.warn('No company score fields mapped - cannot update');
			return;
		}

		console.log(`Updating org ${orgId} company score: ${score}`);
		await this.pipedriveClient.updateOrganization(orgId, updates);
	}
}
