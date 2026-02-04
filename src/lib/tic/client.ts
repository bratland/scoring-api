/**
 * TIC.io API Client
 *
 * CRITICAL: We have 1000 API calls/month.
 * ALWAYS check cache before making API calls.
 */

import type {
	TicCompanyData,
	TicCachedData,
	TicApiResponse,
	TicCompanySearchResult,
	TicFinancialPeriod,
	TicWorkplace,
	TicCreditInfo
} from './types';
import { getCachedTicData } from './cache-seed';
import { getTicCache, setTicCache } from '../cache';

export interface TicClientConfig {
	apiKey: string;
	cacheTtlDays?: number;  // Default: 7 days
}

const TIC_API_BASE = 'https://api.tic.io';
const DEFAULT_CACHE_TTL_DAYS = 7;

export class TicClient {
	private apiKey: string;
	private cacheTtlMs: number;

	constructor(config: TicClientConfig) {
		this.apiKey = config.apiKey;
		this.cacheTtlMs = (config.cacheTtlDays ?? DEFAULT_CACHE_TTL_DAYS) * 24 * 60 * 60 * 1000;
	}

	/**
	 * Check if cached data has all expected fields from a complete TIC fetch
	 * Returns false if essential financial data is missing (indicates old/incomplete cache)
	 */
	private isCacheComplete(data: TicCompanyData): boolean {
		// If we have sniDescription, it means we did a proper fetch with financial data
		// Old cached data from before the update won't have this field
		return !!(data.sniDescription || data.revenue !== undefined || data.cagr3y !== undefined);
	}

	/**
	 * Check if cached data is still fresh
	 */
	isCacheFresh(cachedData: TicCachedData | null | undefined): boolean {
		if (!cachedData?.ticUpdated) return false;

		const cachedTime = new Date(cachedData.ticUpdated).getTime();
		const now = Date.now();
		return (now - cachedTime) < this.cacheTtlMs;
	}

	/**
	 * Get company data - checks cache first, only calls TIC API if cache is stale
	 *
	 * @param orgNumber Swedish organization number (XXXXXX-XXXX or XXXXXXXXXX)
	 * @param cachedData Previously cached TIC data from Pipedrive
	 * @returns Company data (from cache or fresh from TIC)
	 */
	async getCompanyData(
		orgNumber: string,
		cachedData?: TicCachedData | null
	): Promise<TicApiResponse<TicCompanyData>> {
		// Normalize org number (remove dashes)
		const normalizedOrgNumber = orgNumber.replace(/-/g, '');

		// Check Pipedrive cache first - CRITICAL for staying within API limits
		if (cachedData && this.isCacheFresh(cachedData)) {
			return {
				success: true,
				data: this.cachedDataToCompanyData(normalizedOrgNumber, cachedData)
			};
		}

		// Check Redis cache (Vercel KV)
		const redisData = await getTicCache(normalizedOrgNumber);
		if (redisData && this.isCacheComplete(redisData)) {
			return {
				success: true,
				data: redisData
			};
		}
		// If Redis data is incomplete (missing revenue/CAGR/industry), treat as cache miss

		// Check development seed cache (data from API exploration)
		const seedData = getCachedTicData(normalizedOrgNumber);
		if (seedData) {
			// Also store in Redis for faster future access
			await setTicCache(normalizedOrgNumber, seedData);
			return {
				success: true,
				data: seedData
			};
		}

		// Cache miss or stale - fetch from TIC API
		try {
			// Step 1: Search for company by org number (includes basic data)
			const searchResult = await this.searchCompany(normalizedOrgNumber);
			if (!searchResult.success || !searchResult.data) {
				return {
					success: false,
					data: null,
					error: searchResult.error || 'Company not found'
				};
			}

			const companyId = searchResult.data.companyId;
			const searchData = searchResult.data;

			// Step 2: Fetch financial history and credit score
			let revenue: number | undefined;
			let cagr3y: number | undefined;
			let employees: number | undefined;
			let creditScore: number | undefined;

			try {
				const [financials, credit] = await Promise.all([
					this.getFinancialHistory(companyId),
					this.getCreditInfo(companyId)
				]);

				if (financials.data && financials.data.length > 0) {
					// Sort by period end date descending to get latest first
					const sorted = [...financials.data].sort((a, b) =>
						new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime()
					);

					// Latest revenue (in thousands SEK)
					revenue = sorted[0].rs_NetSalesK;
					employees = sorted[0].fn_NumberOfEmployees;

					// Calculate 3-year CAGR if we have enough data
					if (sorted.length >= 4) {
						const latestRevenue = sorted[0].rs_NetSalesK;
						const oldestRevenue = sorted[3].rs_NetSalesK; // 3 years ago
						if (latestRevenue && oldestRevenue && oldestRevenue > 0) {
							cagr3y = Math.pow(latestRevenue / oldestRevenue, 1 / 3) - 1;
						}
					}
				}

				creditScore = credit.data?.score;
			} catch {
				// Additional data fetch failed - use what we have from search
				employees = searchData.employees;
			}

			const companyData: TicCompanyData = {
				companyId,
				orgNumber: normalizedOrgNumber,
				name: searchData.name,
				revenue,
				cagr3y,
				employees: employees ?? searchData.employees,
				creditScore,
				sniCode: searchData.sniCode,
				sniDescription: searchData.sniDescription,
				latitude: searchData.latitude,
				longitude: searchData.longitude,
				fetchedAt: new Date().toISOString()
			};

			// Store in Redis cache for future requests
			await setTicCache(normalizedOrgNumber, companyData);

			return {
				success: true,
				data: companyData
			};

		} catch (error) {
			return {
				success: false,
				data: null,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Convert cached Pipedrive data back to TicCompanyData format
	 */
	private cachedDataToCompanyData(orgNumber: string, cached: TicCachedData): TicCompanyData {
		return {
			companyId: cached.ticCompanyId || '',
			orgNumber,
			revenue: cached.ticRevenue,
			employees: cached.ticEmployees,
			creditScore: cached.ticCreditScore,
			sniCode: cached.ticSni,
			latitude: cached.ticLatitude,
			longitude: cached.ticLongitude,
			fetchedAt: cached.ticUpdated || new Date().toISOString()
		};
	}

	/**
	 * Convert TicCompanyData to cache format for storing in Pipedrive
	 */
	static toCacheFormat(data: TicCompanyData): TicCachedData {
		return {
			ticCompanyId: data.companyId,
			ticRevenue: data.revenue,
			ticEmployees: data.employees,
			ticCreditScore: data.creditScore,
			ticSni: data.sniCode,
			ticLatitude: data.latitude,
			ticLongitude: data.longitude,
			ticUpdated: data.fetchedAt
		};
	}

	/**
	 * Search for company by organization number using new TIC API format
	 */
	private async searchCompany(orgNumber: string): Promise<TicApiResponse<TicCompanySearchResult>> {
		const url = `${TIC_API_BASE}/search/companies?q=${orgNumber}&query_by=registrationNumber`;

		try {
			const response = await fetch(url, {
				headers: {
					'x-api-key': this.apiKey,
					'Accept': 'application/json'
				}
			});

			if (!response.ok) {
				return {
					success: false,
					data: null,
					error: `TIC API error: ${response.status}`
				};
			}

			const data = await response.json();

			// New API returns results in hits array
			if (!data.hits || data.hits.length === 0) {
				return {
					success: false,
					data: null,
					error: 'Company not found'
				};
			}

			const doc = data.hits[0].document;
			// Name can be in nameOrIdentifier or text field depending on API version
			const primaryName = doc.names?.find((n: { isPrimary?: boolean }) => n.isPrimary)?.nameOrIdentifier
				|| doc.names?.[0]?.nameOrIdentifier
				|| doc.names?.[0]?.text;

			// Extract coordinates from workplaces if available
			// Location can be [lat, lon] array or separate latitude/longitude fields
			const workplace = doc.currentWorkplaces?.[0];
			let latitude: number | undefined;
			let longitude: number | undefined;

			if (workplace?.location && Array.isArray(workplace.location)) {
				latitude = workplace.location[0];
				longitude = workplace.location[1];
			} else if (workplace) {
				latitude = workplace.latitude;
				longitude = workplace.longitude;
			}

			// Parse employee count from various formats
			const employees = this.parseEmployees(doc.cNbrEmployeesInterval);

			// Get primary SNI code and description (prefer 2007 format, rank 1)
			const primarySni = doc.sniCodes?.find((s: { rank?: number; sni_2007Code?: string }) =>
				s.rank === 1 && s.sni_2007Code
			) || doc.sniCodes?.[0];

			return {
				success: true,
				data: {
					companyId: String(doc.companyId),
					registrationNumber: doc.registrationNumber,
					name: primaryName,
					// Additional data from search response
					latitude,
					longitude,
					sniCode: primarySni?.sni_2007Code || primarySni?.code,
					sniDescription: primarySni?.sni_2007Name || primarySni?.name,
					employees
				}
			};
		} catch (error) {
			return {
				success: false,
				data: null,
				error: error instanceof Error ? error.message : 'Search failed'
			};
		}
	}

	/**
	 * Parse employee count from various TIC formats
	 */
	private parseEmployees(data: unknown): number | undefined {
		if (!data) return undefined;

		// Handle object format: { categoryCodeDescription: "2000-2999 anställda" }
		if (typeof data === 'object' && data !== null) {
			const obj = data as { categoryCodeDescription?: string };
			if (obj.categoryCodeDescription) {
				const match = obj.categoryCodeDescription.match(/(\d+)-(\d+)/);
				if (match) {
					return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);
				}
			}
		}

		// Handle string format: "10-19", "50-99" etc
		if (typeof data === 'string') {
			const match = data.match(/(\d+)-(\d+)/);
			if (match) {
				return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);
			}
			const single = parseInt(data);
			return isNaN(single) ? undefined : single;
		}

		return undefined;
	}

	/**
	 * Get financial history (array of periods) for a company
	 */
	private async getFinancialHistory(companyId: string): Promise<TicApiResponse<TicFinancialPeriod[]>> {
		return this.request<TicFinancialPeriod[]>(
			`/datasets/companies/${companyId}/financial-summary`
		);
	}

	/**
	 * Get workplace location (coordinates)
	 */
	private async getWorkplaceLocation(companyId: string): Promise<TicApiResponse<TicWorkplace>> {
		return this.request<TicWorkplace>(
			`/datasets/companies/${companyId}/workplaces`
		);
	}

	/**
	 * Get credit information
	 */
	private async getCreditInfo(companyId: string): Promise<TicApiResponse<TicCreditInfo>> {
		return this.request<TicCreditInfo>(
			`/datasets/companies/${companyId}/credit-score`
		);
	}

	/**
	 * Make authenticated request to TIC API
	 */
	private async request<T>(endpoint: string): Promise<TicApiResponse<T>> {
		const url = `${TIC_API_BASE}${endpoint}`;

		try {
			const response = await fetch(url, {
				headers: {
					'x-api-key': this.apiKey,
					'Accept': 'application/json'
				}
			});

			if (!response.ok) {
				return {
					success: false,
					data: null,
					error: `TIC API error: ${response.status} ${response.statusText}`
				};
			}

			const data = await response.json();
			return {
				success: true,
				data: data as T
			};

		} catch (error) {
			return {
				success: false,
				data: null,
				error: error instanceof Error ? error.message : 'Request failed'
			};
		}
	}
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in kilometers
 */
export function calculateDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const R = 6371; // Earth's radius in km
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
		Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function toRad(deg: number): number {
	return deg * (Math.PI / 180);
}

// Gothenburg coordinates
export const GOTHENBURG_COORDS = {
	latitude: 57.7089,
	longitude: 11.9746
};

/**
 * Calculate distance from a location to Gothenburg
 */
export function distanceToGothenburg(latitude: number, longitude: number): number {
	return calculateDistance(
		latitude,
		longitude,
		GOTHENBURG_COORDS.latitude,
		GOTHENBURG_COORDS.longitude
	);
}
