/**
 * Company Data Enricher
 *
 * Combines TIC.io data with Pipedrive caching.
 * CRITICAL: Always checks cache before calling TIC API (1000 calls/month limit)
 */

import { TicClient, distanceToGothenburg, type TicCompanyData, type TicCachedData } from '../tic';
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
	employees?: number;
	creditScore?: number;
	sniCode?: string;
	distanceToGothenburg?: number;  // Calculated from coordinates

	// Metadata
	dataSource: 'cache' | 'tic' | 'pipedrive';
	cacheAge?: number;          // Days since last TIC fetch
	lastUpdated?: string;
}

export interface TicFieldMapping {
	orgNumber: string;          // Field key for organization number
	city: string;               // Field key for city (fallback for geocoding)
	ticCompanyId: string;
	ticRevenue: string;
	ticEmployees: string;
	ticCreditScore: string;
	ticSni: string;
	ticLatitude: string;
	ticLongitude: string;
	ticUpdated: string;
}

// Default field names - will need to be mapped to actual Pipedrive field keys
export const DEFAULT_TIC_FIELD_NAMES: Record<keyof TicFieldMapping, string> = {
	orgNumber: 'Organisationsnummer',
	city: 'Ort',  // Standard Pipedrive address field or custom field
	ticCompanyId: 'TIC Company ID',
	ticRevenue: 'TIC Omsättning',
	ticEmployees: 'TIC Anställda',
	ticCreditScore: 'TIC Kreditbetyg',
	ticSni: 'TIC SNI',
	ticLatitude: 'TIC Latitude',
	ticLongitude: 'TIC Longitude',
	ticUpdated: 'TIC Uppdaterad'
};

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

		// Extract cached TIC data from Pipedrive
		const cachedData = this.extractCachedData(orgData);

		// Extract org number and city (for geocoding fallback)
		const orgNumber = this.findFieldValue(orgData, 'orgNumber') as string | undefined;
		const city = this.extractCity(orgData);

		// If no org number, try to at least get distance from city
		if (!orgNumber) {
			const distance = await this.calculateDistanceWithFallback(undefined, undefined, city);
			return {
				pipedriveOrgId: orgId,
				name: orgName,
				distanceToGothenburg: distance,
				dataSource: 'pipedrive'
			};
		}

		// Check if cache is fresh
		if (cachedData && this.ticClient.isCacheFresh(cachedData)) {
			return this.buildEnrichedDataAsync(orgId, orgName, orgNumber, cachedData, city, 'cache');
		}

		// Cache miss - fetch from TIC API
		const ticResult = await this.ticClient.getCompanyData(orgNumber, cachedData);

		if (!ticResult.success || !ticResult.data) {
			// TIC fetch failed - use stale cache if available, otherwise Pipedrive data
			if (cachedData?.ticUpdated) {
				return this.buildEnrichedDataAsync(orgId, orgName, orgNumber, cachedData, city, 'cache');
			}
			const distance = await this.calculateDistanceWithFallback(undefined, undefined, city);
			return {
				pipedriveOrgId: orgId,
				name: orgName,
				orgNumber,
				distanceToGothenburg: distance,
				dataSource: 'pipedrive'
			};
		}

		// Update Pipedrive cache with fresh TIC data
		await this.updateCache(orgId, ticResult.data);

		// Build enriched data from fresh TIC response
		return this.buildEnrichedDataFromTicAsync(orgId, orgName, orgNumber, ticResult.data, city);
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
	 * Extract cached TIC data from Pipedrive organization record
	 */
	private extractCachedData(orgData: Record<string, unknown>): TicCachedData | null {
		const ticUpdated = this.findFieldValue(orgData, 'ticUpdated');
		if (!ticUpdated) return null;

		return {
			ticCompanyId: this.findFieldValue(orgData, 'ticCompanyId') as string | undefined,
			ticRevenue: this.parseNumber(this.findFieldValue(orgData, 'ticRevenue')),
			ticEmployees: this.parseNumber(this.findFieldValue(orgData, 'ticEmployees')),
			ticCreditScore: this.parseNumber(this.findFieldValue(orgData, 'ticCreditScore')),
			ticSni: this.findFieldValue(orgData, 'ticSni') as string | undefined,
			ticLatitude: this.parseNumber(this.findFieldValue(orgData, 'ticLatitude')),
			ticLongitude: this.parseNumber(this.findFieldValue(orgData, 'ticLongitude')),
			ticUpdated: ticUpdated as string
		};
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
	 * Update Pipedrive organization with fresh TIC data
	 */
	private async updateCache(orgId: number, ticData: TicCompanyData): Promise<void> {
		if (!this.fieldMapping) {
			console.warn('No field mapping set - cannot update Pipedrive cache');
			return;
		}

		const updates: Record<string, unknown> = {
			[this.fieldMapping.ticCompanyId]: ticData.companyId,
			[this.fieldMapping.ticRevenue]: ticData.revenue,
			[this.fieldMapping.ticEmployees]: ticData.employees,
			[this.fieldMapping.ticCreditScore]: ticData.creditScore,
			[this.fieldMapping.ticSni]: ticData.sniCode,
			[this.fieldMapping.ticLatitude]: ticData.latitude,
			[this.fieldMapping.ticLongitude]: ticData.longitude,
			[this.fieldMapping.ticUpdated]: ticData.fetchedAt
		};

		// Remove undefined values
		for (const key of Object.keys(updates)) {
			if (updates[key] === undefined) {
				delete updates[key];
			}
		}

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
	 * Build enriched data from cached TIC data (async - uses geocoding fallback)
	 */
	private async buildEnrichedDataAsync(
		orgId: number,
		name: string | undefined,
		orgNumber: string,
		cached: TicCachedData,
		city: string | undefined,
		source: 'cache' | 'tic'
	): Promise<EnrichedCompanyData> {
		// Try to get distance - coordinates first, then geocoding fallback
		const distance = await this.calculateDistanceWithFallback(
			cached.ticLatitude,
			cached.ticLongitude,
			city
		);

		let cacheAge: number | undefined;
		if (cached.ticUpdated) {
			const cachedTime = new Date(cached.ticUpdated).getTime();
			cacheAge = Math.floor((Date.now() - cachedTime) / (24 * 60 * 60 * 1000));
		}

		return {
			pipedriveOrgId: orgId,
			name,
			orgNumber,
			ticCompanyId: cached.ticCompanyId,
			revenue: cached.ticRevenue ? cached.ticRevenue * 1000 : undefined, // Convert from thousands
			employees: cached.ticEmployees,
			creditScore: cached.ticCreditScore,
			sniCode: cached.ticSni,
			distanceToGothenburg: distance,
			dataSource: source,
			cacheAge,
			lastUpdated: cached.ticUpdated
		};
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

		return {
			pipedriveOrgId: orgId,
			name: ticData.name || name,
			orgNumber,
			ticCompanyId: ticData.companyId,
			revenue: ticData.revenue ? ticData.revenue * 1000 : undefined, // Convert from thousands
			employees: ticData.employees,
			creditScore: ticData.creditScore,
			sniCode: ticData.sniCode,
			distanceToGothenburg: distance,
			dataSource: 'tic',
			cacheAge: 0,
			lastUpdated: ticData.fetchedAt
		};
	}
}
