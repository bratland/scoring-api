<script lang="ts">
	import { onMount } from 'svelte';
	import Chart from '$lib/components/Chart.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import Leaderboard from '$lib/components/Leaderboard.svelte';
	import type { AnalyticsOverview, SalesRepPerformance } from '$lib/analytics/types';
	import type { ChartData } from 'chart.js';

	type TabType = 'icp' | 'sales';

	let activeTab = $state<TabType>('icp');
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// ICP data
	let overview = $state<AnalyticsOverview | null>(null);

	// Sales data
	let salesData = $state<{ performances: SalesRepPerformance[]; leaderboard: SalesRepPerformance[] } | null>(null);

	async function loadOverview() {
		try {
			const response = await fetch('/api/analytics/overview');
			const result = await response.json();
			if (result.success) {
				overview = result.data;
			} else {
				error = result.error || 'Failed to load overview';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load overview';
		}
	}

	async function loadSalesData() {
		try {
			const response = await fetch('/api/analytics/sales-reps?limit=20');
			const result = await response.json();
			if (result.success) {
				salesData = result.data;
			} else {
				error = result.error || 'Failed to load sales data';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load sales data';
		}
	}

	async function loadData() {
		isLoading = true;
		error = null;
		await Promise.all([loadOverview(), loadSalesData()]);
		isLoading = false;
	}

	function formatCurrency(value: number, short: boolean = true): string {
		if (short) {
			if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
			if (value >= 1000) return `${Math.round(value / 1000)}k`;
		}
		return new Intl.NumberFormat('sv-SE').format(Math.round(value));
	}

	function getValueDistributionChart(): ChartData {
		if (!overview) return { labels: [], datasets: [] };

		return {
			labels: overview.dealOverview.valueDistribution.map(b => b.range),
			datasets: [{
				label: 'Antal affärer',
				data: overview.dealOverview.valueDistribution.map(b => b.count),
				backgroundColor: 'rgba(217, 255, 66, 0.8)',
				borderColor: '#0E122F',
				borderWidth: 1
			}]
		};
	}

	function getWinRateChart(): ChartData {
		if (!overview) return { labels: [], datasets: [] };

		return {
			labels: overview.winRateByYear.map(w => w.period),
			datasets: [
				{
					label: 'Win Rate (%)',
					data: overview.winRateByYear.map(w => w.winRate),
					borderColor: '#184ACE',
					backgroundColor: 'rgba(24, 74, 206, 0.1)',
					fill: true,
					tension: 0.3
				}
			]
		};
	}

	function getWonValueByYearChart(): ChartData {
		if (!overview) return { labels: [], datasets: [] };

		return {
			labels: overview.winRateByYear.map(w => w.period),
			datasets: [
				{
					label: 'Vunnet värde',
					data: overview.winRateByYear.map(w => w.totalWonValue / 1000),
					backgroundColor: 'rgba(217, 255, 66, 0.8)',
					borderColor: '#0E122F',
					borderWidth: 1
				}
			]
		};
	}

	function getTopCustomersChart(): ChartData {
		if (!overview) return { labels: [], datasets: [] };

		const top5 = overview.topCustomers.slice(0, 5);
		return {
			labels: top5.map(c => c.orgName.length > 20 ? c.orgName.substring(0, 20) + '...' : c.orgName),
			datasets: [{
				label: 'Vunnet värde (TSEK)',
				data: top5.map(c => c.totalWonValue / 1000),
				backgroundColor: [
					'rgba(217, 255, 66, 0.9)',
					'rgba(217, 255, 66, 0.7)',
					'rgba(217, 255, 66, 0.5)',
					'rgba(217, 255, 66, 0.4)',
					'rgba(217, 255, 66, 0.3)'
				],
				borderColor: '#0E122F',
				borderWidth: 1
			}]
		};
	}

	function getPipelineChart(): ChartData {
		if (!overview) return { labels: [], datasets: [] };

		return {
			labels: overview.pipelineDistribution.map(p => p.pipelineName),
			datasets: [{
				data: overview.pipelineDistribution.map(p => p.dealCount),
				backgroundColor: [
					'#D9FF42',
					'#184ACE',
					'#0E122F',
					'#6B7280',
					'#F59E0B'
				],
				borderWidth: 0
			}]
		};
	}

	function getSalesRepTrendChart(): ChartData {
		if (!salesData) return { labels: [], datasets: [] };

		// Get top 5 performers
		const top5 = salesData.leaderboard.slice(0, 5);
		const colors = ['#D9FF42', '#184ACE', '#F59E0B', '#10B981', '#EF4444'];

		// Get all unique months
		const allMonths = new Set<string>();
		top5.forEach(rep => rep.monthlyTrend.forEach(t => allMonths.add(t.month)));
		const sortedMonths = Array.from(allMonths).sort();

		return {
			labels: sortedMonths.map(m => {
				const [year, month] = m.split('-');
				return `${month}/${year.slice(2)}`;
			}),
			datasets: top5.map((rep, i) => ({
				label: rep.userName,
				data: sortedMonths.map(month => {
					const trend = rep.monthlyTrend.find(t => t.month === month);
					return trend ? trend.wonValue / 1000 : 0;
				}),
				borderColor: colors[i],
				backgroundColor: 'transparent',
				tension: 0.3,
				pointRadius: 3
			}))
		};
	}

	onMount(() => {
		loadData();
	});
</script>

<div class="min-h-screen bg-white py-12 px-6">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="mb-8 flex items-center justify-between">
			<div>
				<a href="/" class="text-sm text-navy/60 hover:text-navy mb-2 inline-flex items-center gap-1">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
					</svg>
					Tillbaka
				</a>
				<h1 class="text-4xl font-bold text-navy">Analytics Dashboard</h1>
				<p class="text-navy/60 mt-1">ICP Insights & Säljarprestation</p>
			</div>
			<button
				onclick={loadData}
				disabled={isLoading}
				class="bg-lime text-navy font-semibold px-5 py-2.5 rounded-lg hover:bg-lime/90 disabled:opacity-50 transition-colors flex items-center gap-2"
			>
				<svg class="w-5 h-5 {isLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
				</svg>
				Uppdatera
			</button>
		</div>

		<!-- Tabs -->
		<div class="mb-8 border-b border-gray-200">
			<nav class="flex gap-8">
				<button
					onclick={() => activeTab = 'icp'}
					class="pb-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'icp' ? 'border-lime text-navy' : 'border-transparent text-navy/60 hover:text-navy hover:border-gray-300'}"
				>
					ICP Insights
				</button>
				<button
					onclick={() => activeTab = 'sales'}
					class="pb-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'sales' ? 'border-lime text-navy' : 'border-transparent text-navy/60 hover:text-navy hover:border-gray-300'}"
				>
					Säljarprestation
				</button>
			</nav>
		</div>

		{#if error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-8">
				{error}
			</div>
		{/if}

		{#if isLoading}
			<div class="flex items-center justify-center py-24">
				<div class="text-center">
					<svg class="animate-spin h-12 w-12 text-navy mx-auto mb-4" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					<p class="text-navy/60">Laddar data från Pipedrive...</p>
				</div>
			</div>
		{:else if activeTab === 'icp' && overview}
			<!-- ICP Insights Tab -->
			<div class="space-y-8">
				<!-- Stats Row -->
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
					<StatCard
						label="Snittaffär"
						value={formatCurrency(overview.dealOverview.averageValue)}
						unit=" {overview.dealOverview.currency}"
						description="Medelvärde vunna affärer"
					/>
					<StatCard
						label="Win Rate"
						value={overview.winRateByYear.length > 0 ? overview.winRateByYear[overview.winRateByYear.length - 1].winRate.toFixed(1) : '0'}
						unit="%"
						description="Senaste året"
					/>
					<StatCard
						label="Säljcykel"
						value={overview.salesCycle.averageDays}
						unit=" dagar"
						description="Snitt {overview.salesCycle.sampleSize} affärer"
					/>
					<StatCard
						label="Totalt Vunnet"
						value={formatCurrency(overview.dealOverview.totalValue)}
						unit=" {overview.dealOverview.currency}"
						description="{overview.dealOverview.dealCount} avslutade affärer"
					/>
				</div>

				<!-- Charts Row 1 -->
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div class="bg-white rounded-xl border border-gray-200 p-6">
						<h3 class="text-lg font-semibold text-navy mb-4">Affärsvärde Distribution</h3>
						<Chart type="bar" data={getValueDistributionChart()} height="280px" />
					</div>
					<div class="bg-white rounded-xl border border-gray-200 p-6">
						<h3 class="text-lg font-semibold text-navy mb-4">Win Rate per År</h3>
						<Chart
							type="line"
							data={getWinRateChart()}
							height="280px"
							options={{ scales: { y: { beginAtZero: true, max: 100 } } }}
						/>
					</div>
				</div>

				<!-- Charts Row 2 -->
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div class="bg-white rounded-xl border border-gray-200 p-6">
						<h3 class="text-lg font-semibold text-navy mb-4">Top 5 Kunder (Vunnet Värde)</h3>
						<Chart
							type="bar"
							data={getTopCustomersChart()}
							height="280px"
							options={{ indexAxis: 'y', plugins: { legend: { display: false } } }}
						/>
					</div>
					<div class="bg-white rounded-xl border border-gray-200 p-6">
						<h3 class="text-lg font-semibold text-navy mb-4">Pipeline Distribution</h3>
						<Chart type="doughnut" data={getPipelineChart()} height="280px" />
					</div>
				</div>

				<!-- Vunnet Värde per År -->
				<div class="bg-white rounded-xl border border-gray-200 p-6">
					<h3 class="text-lg font-semibold text-navy mb-4">Vunnet Värde per År (TSEK)</h3>
					<Chart type="bar" data={getWonValueByYearChart()} height="280px" />
				</div>

				<!-- Top Customers Table -->
				<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
					<div class="px-6 py-4 border-b border-gray-200">
						<h3 class="text-lg font-semibold text-navy">Top 10 Kunder</h3>
					</div>
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organisation</th>
									<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Vunnet Värde</th>
									<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Antal Affärer</th>
									<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Snitt/Affär</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each overview.topCustomers as customer, i}
									<tr class="hover:bg-gray-50">
										<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
											{i + 1}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
											{customer.orgName}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
											{formatCurrency(customer.totalWonValue, false)} {customer.currency}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
											{customer.wonDeals}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
											{formatCurrency(customer.averageDealSize, false)} {customer.currency}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>

		{:else if activeTab === 'sales' && salesData}
			<!-- Sales Performance Tab -->
			<div class="space-y-8">
				<!-- Leaderboard -->
				<Leaderboard data={salesData.leaderboard} title="Leaderboard - Top Säljare" />

				<!-- Monthly Trend Chart -->
				<div class="bg-white rounded-xl border border-gray-200 p-6">
					<h3 class="text-lg font-semibold text-navy mb-4">Månadsvis Trend - Top 5 Säljare (TSEK)</h3>
					<Chart type="line" data={getSalesRepTrendChart()} height="350px" />
				</div>

				<!-- All Sales Reps Table -->
				<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
					<div class="px-6 py-4 border-b border-gray-200">
						<h3 class="text-lg font-semibold text-navy">Alla Säljare</h3>
					</div>
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Säljare</th>
									<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Vunna</th>
									<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Förlorade</th>
									<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Öppna</th>
									<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Win Rate</th>
									<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Vunnet Värde</th>
									<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Snitt Säljcykel</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each salesData.performances as rep}
									<tr class="hover:bg-gray-50">
										<td class="px-6 py-4 whitespace-nowrap">
											<div class="text-sm font-medium text-gray-900">{rep.userName}</div>
											<div class="text-xs text-gray-500">{rep.totalDeals} affärer totalt</div>
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 font-medium">
											{rep.wonDeals}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
											{rep.lostDeals}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-right text-blue-600">
											{rep.openDeals}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-right">
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {rep.winRate >= 20 ? 'bg-green-100 text-green-800' : rep.winRate >= 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}">
												{rep.winRate.toFixed(1)}%
											</span>
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
											{formatCurrency(rep.totalWonValue)} {rep.currency}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
											{rep.avgSalesCycleDays > 0 ? `${rep.avgSalesCycleDays} dagar` : '-'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		{/if}

		<!-- Generated timestamp -->
		{#if overview?.generatedAt && !isLoading}
			<div class="mt-8 text-center text-sm text-navy/40">
				Data hämtad {new Date(overview.generatedAt).toLocaleString('sv-SE')}
			</div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	/* Daily Wins colors */
	.text-navy { color: #0E122F; }
	.bg-navy { background-color: #0E122F; }
	.border-navy { border-color: #0E122F; }

	.text-lime { color: #D9FF42; }
	.bg-lime { background-color: #D9FF42; }
	.border-lime { border-color: #D9FF42; }

	.text-blue { color: #184ACE; }
	.bg-blue { background-color: #184ACE; }
</style>
