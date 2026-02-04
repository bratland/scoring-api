/**
 * TIC.io API Types
 */

export interface TicCompanyData {
	companyId: string;
	orgNumber: string;
	name?: string;
	revenue?: number;          // rs_NetSalesK (in thousands SEK)
	employees?: number;        // fn_NumberOfEmployees
	creditScore?: number;      // 0-100
	sniCode?: string;          // Industry classification
	sniDescription?: string;
	latitude?: number;
	longitude?: number;
	fetchedAt: string;         // ISO timestamp
}

export interface TicCachedData {
	ticCompanyId?: string;
	ticRevenue?: number;
	ticEmployees?: number;
	ticCreditScore?: number;
	ticSni?: string;
	ticLatitude?: number;
	ticLongitude?: number;
	ticUpdated?: string;       // ISO timestamp
}

export interface TicApiResponse<T> {
	success: boolean;
	data: T | null;
	error?: string;
}

// TIC API response structures (based on documentation)
export interface TicCompanySearchResult {
	companyId: string;
	registrationNumber: string;
	name: string;
}

export interface TicFinancialSummary {
	rs_NetSalesK?: number;
	km_EquityAssetsRatio?: number;
	km_NetProfitMargin?: number;
	km_OperatingMargin?: number;
	bs_TotalAssetsK?: number;
}

export interface TicWorkplace {
	latitude?: number;
	longitude?: number;
	address?: string;
	city?: string;
}

export interface TicCreditInfo {
	score?: number;
	rating?: string;
	limit?: number;
}
