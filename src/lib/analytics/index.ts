/**
 * Analytics Module
 * Public exports for ICP Insights and Sales Performance analytics
 */

// Types
export type {
	DealOverview,
	ValueDistributionBucket,
	WinRateByPeriod,
	SalesCycleStats,
	CustomerRanking,
	PipelineDistribution,
	StageDistribution,
	SalesRepPerformance,
	MonthlyTrend,
	AnalyticsOverview,
	SalesRepAnalytics
} from './types';

// Deal analytics
export {
	calculateDealOverview,
	calculateWinRateByYear,
	calculateWinRateByMonth,
	calculateSalesCycle,
	getTopCustomers,
	getPipelineDistribution
} from './deals';

// Sales rep analytics
export {
	calculateSalesRepPerformance,
	getLeaderboard,
	getSalesRepById
} from './salesRep';
