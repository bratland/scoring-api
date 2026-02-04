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
	TicFinancialSummary,
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
		if (redisData) {
			return {
				success: true,
				data: redisData
			};
		}

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
			// Step 1: Search for company by org number to get companyId
			const searchResult = await this.searchCompany(normalizedOrgNumber);
			if (!searchResult.success || !searchResult.data) {
				return {
					success: false,
					data: null,
					error: searchResult.error || 'Company not found'
				};
			}

			const companyId = searchResult.data.companyId;

			// Step 2: Fetch detailed data in parallel
			const [financials, workplace, credit] = await Promise.all([
				this.getFinancialSummary(companyId),
				this.getWorkplaceLocation(companyId),
				this.getCreditInfo(companyId)
			]);

			const companyData: TicCompanyData = {
				companyId,
				orgNumber: normalizedOrgNumber,
				name: searchResult.data.name,
				revenue: financials.data?.rs_NetSalesK,
				employees: undefined, // Will be fetched if available
				creditScore: credit.data?.score,
				sniCode: undefined, // Will be fetched separately if needed
				latitude: workplace.data?.latitude,
				longitude: workplace.data?.longitude,
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
	 * Search for company by organization number
	 */
	private async searchCompany(orgNumber: string): Promise<TicApiResponse<TicCompanySearchResult>> {
		return this.request<TicCompanySearchResult>(
			`/v1/companies/search?registrationNumber=${orgNumber}`
		);
	}

	/**
	 * Get financial summary for a company
	 */
	private async getFinancialSummary(companyId: string): Promise<TicApiResponse<TicFinancialSummary>> {
		return this.request<TicFinancialSummary>(
			`/v1/companies/${companyId}/financial-summary`
		);
	}

	/**
	 * Get workplace location (coordinates)
	 */
	private async getWorkplaceLocation(companyId: string): Promise<TicApiResponse<TicWorkplace>> {
		return this.request<TicWorkplace>(
			`/v1/companies/${companyId}/workplaces`
		);
	}

	/**
	 * Get credit information
	 */
	private async getCreditInfo(companyId: string): Promise<TicApiResponse<TicCreditInfo>> {
		return this.request<TicCreditInfo>(
			`/v1/companies/${companyId}/credit-score`
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
