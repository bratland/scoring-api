/**
 * Analytics Types
 * Type definitions for ICP Insights and Sales Performance dashboards
 */

export interface DealOverview {
	totalValue: number;
	averageValue: number;
	medianValue: number;
	dealCount: number;
	currency: string;
	valueDistribution: ValueDistributionBucket[];
}

export interface ValueDistributionBucket {
	range: string;
	minValue: number;
	maxValue: number;
	count: number;
	totalValue: number;
}

export interface WinRateByPeriod {
	period: string;
	year: number;
	month?: number;
	won: number;
	lost: number;
	open: number;
	winRate: number;
	totalWonValue: number;
	totalLostValue: number;
}

export interface SalesCycleStats {
	averageDays: number;
	medianDays: number;
	minDays: number;
	maxDays: number;
	sampleSize: number;
}

export interface CustomerRanking {
	orgId: number;
	orgName: string;
	totalWonValue: number;
	wonDeals: number;
	averageDealSize: number;
	currency: string;
}

export interface PipelineDistribution {
	pipelineId: number;
	pipelineName: string;
	dealCount: number;
	totalValue: number;
	wonCount: number;
	lostCount: number;
	openCount: number;
	winRate: number;
}

export interface StageDistribution {
	stageId: number;
	stageName: string;
	pipelineId: number;
	dealCount: number;
	totalValue: number;
	orderNr: number;
}

export interface SalesRepPerformance {
	userId: number;
	userName: string;
	wonDeals: number;
	lostDeals: number;
	openDeals: number;
	totalDeals: number;
	winRate: number;
	totalWonValue: number;
	totalLostValue: number;
	totalOpenValue: number;
	avgDealSize: number;
	avgSalesCycleDays: number;
	currency: string;
	monthlyTrend: MonthlyTrend[];
}

export interface MonthlyTrend {
	month: string;
	year: number;
	monthNum: number;
	wonValue: number;
	wonDeals: number;
	lostDeals: number;
	newDeals: number;
}

export interface AnalyticsOverview {
	dealOverview: DealOverview;
	winRateByYear: WinRateByPeriod[];
	salesCycle: SalesCycleStats;
	topCustomers: CustomerRanking[];
	pipelineDistribution: PipelineDistribution[];
	generatedAt: string;
}

export interface SalesRepAnalytics {
	performances: SalesRepPerformance[];
	leaderboard: SalesRepPerformance[];
	generatedAt: string;
}
