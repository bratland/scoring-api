/**
 * TIC.io API Types
 */

export interface TicCompanyData {
	companyId: string;
	orgNumber: string;
	name?: string;
	revenue?: number;          // rs_NetSalesK (in thousands SEK)
	cagr3y?: number;           // 3-year compound annual growth rate
	employees?: number;        // fn_NumberOfEmployees
	personnelCosts?: number;   // rs_PersonnelCostsK (in thousands SEK)
	creditScore?: number;      // 0-100
	sniCode?: string;          // Industry classification
	sniDescription?: string;   // Industry name
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
	name?: string;
	// Additional data from search response
	latitude?: number;
	longitude?: number;
	sniCode?: string;
	sniDescription?: string;
	employees?: number;
}

export interface TicFinancialPeriod {
	periodStart: string;
	periodEnd: string;
	rs_NetSalesK?: number;
	rs_PersonnelCostsK?: number;     // Personnel/salary costs in thousands SEK
	fn_NumberOfEmployees?: number;
	km_EquityAssetsRatio?: number;
	km_NetProfitMargin?: number;
	km_OperatingMargin?: number;
	bs_TotalAssetsK?: number;
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
