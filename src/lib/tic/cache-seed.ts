/**
 * Pre-seeded TIC cache data from API exploration
 * This data was fetched during development to avoid repeated API calls
 *
 * IMPORTANT: This is a development cache. Production cache is stored in Pipedrive.
 */

import type { TicCompanyData } from './types';

export const TIC_CACHE_SEED: Record<string, TicCompanyData> = {
	// World of Volvo AB - Göteborg
	'5592339849': {
		companyId: '1907042',
		orgNumber: '5592339849',
		name: 'World of Volvo AB',
		revenue: undefined, // Need to fetch financial-summary separately
		employees: undefined, // 50-99 anställda according to cNbrEmployeesInterval
		creditScore: undefined,
		sniCode: '82300', // Arrangemang av kongresser och mässor
		sniDescription: 'Arrangemang av kongresser och mässor',
		latitude: 57.68951,
		longitude: 11.99679,
		fetchedAt: '2025-02-04T12:00:00Z'
	},

	// Briva Möbel Aktiebolag - Göteborg
	'5560803388': {
		companyId: '3918651',
		orgNumber: '5560803388',
		name: 'Briva Möbel Aktiebolag',
		revenue: undefined,
		employees: undefined,
		creditScore: undefined,
		sniCode: undefined,
		latitude: undefined, // No currentWorkplaces in response
		longitude: undefined,
		fetchedAt: '2025-02-04T12:00:00Z'
	},

	// Hills Djurshop AB - Lund
	'5565349080': {
		companyId: '4000569',
		orgNumber: '5565349080',
		name: 'Hills Djurshop AB',
		revenue: undefined,
		employees: undefined,
		creditScore: undefined,
		sniCode: undefined,
		latitude: undefined,
		longitude: undefined,
		fetchedAt: '2025-02-04T12:00:00Z'
	}
};

// Municipality data extracted from TIC responses
export const TIC_MUNICIPALITY_CACHE: Record<string, string> = {
	'5592339849': 'Göteborg',  // World of Volvo AB
	'5560803388': 'Göteborg',  // Briva Möbel Aktiebolag
	'5565349080': 'Lund',      // Hills Djurshop AB (from city field)
};

/**
 * Get cached TIC data by org number
 */
export function getCachedTicData(orgNumber: string): TicCompanyData | undefined {
	const normalized = orgNumber.replace(/-/g, '');
	return TIC_CACHE_SEED[normalized];
}

/**
 * Get cached municipality by org number
 */
export function getCachedMunicipality(orgNumber: string): string | undefined {
	const normalized = orgNumber.replace(/-/g, '');
	return TIC_MUNICIPALITY_CACHE[normalized];
}

/**
 * Check if org number is in cache
 */
export function isInTicCache(orgNumber: string): boolean {
	const normalized = orgNumber.replace(/-/g, '');
	return normalized in TIC_CACHE_SEED;
}
