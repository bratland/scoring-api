<script lang="ts">
	import type { SalesRepPerformance } from '$lib/analytics/types';

	interface Props {
		data: SalesRepPerformance[];
		title?: string;
	}

	let { data, title = 'Leaderboard' }: Props = $props();

	function formatCurrency(value: number): string {
		if (value >= 1000000) {
			return `${(value / 1000000).toFixed(1)}M`;
		}
		if (value >= 1000) {
			return `${(value / 1000).toFixed(0)}k`;
		}
		return value.toFixed(0);
	}

	function getRankBadge(rank: number): string {
		if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
		if (rank === 2) return 'bg-gray-100 text-gray-800 border-gray-300';
		if (rank === 3) return 'bg-orange-100 text-orange-800 border-orange-300';
		return 'bg-white text-gray-600 border-gray-200';
	}

	function getRankIcon(rank: number): string {
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return '';
	}
</script>

<div class="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
	<div class="px-6 py-4 border-b border-gray-200">
		<h3 class="text-lg font-semibold text-gray-900">{title}</h3>
	</div>

	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
						Rank
					</th>
					<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Säljare
					</th>
					<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
						Vunna
					</th>
					<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
						Win Rate
					</th>
					<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
						Värde
					</th>
					<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
						Snitt/Affär
					</th>
				</tr>
			</thead>
			<tbody class="bg-white divide-y divide-gray-200">
				{#each data as rep, index}
					<tr class="hover:bg-gray-50 transition-colors">
						<td class="px-6 py-4 whitespace-nowrap">
							<span class="inline-flex items-center justify-center w-8 h-8 rounded-full border {getRankBadge(index + 1)} font-semibold text-sm">
								{#if getRankIcon(index + 1)}
									{getRankIcon(index + 1)}
								{:else}
									{index + 1}
								{/if}
							</span>
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="text-sm font-medium text-gray-900">{rep.userName}</div>
							<div class="text-xs text-gray-500">{rep.totalDeals} affärer totalt</div>
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-right">
							<span class="text-sm font-semibold text-green-600">{rep.wonDeals}</span>
							<span class="text-xs text-gray-400"> / {rep.lostDeals} förlorade</span>
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-right">
							<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {rep.winRate >= 20 ? 'bg-green-100 text-green-800' : rep.winRate >= 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}">
								{rep.winRate.toFixed(1)}%
							</span>
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-right">
							<span class="text-sm font-semibold text-gray-900">
								{formatCurrency(rep.totalWonValue)}
							</span>
							<span class="text-xs text-gray-500 ml-1">{rep.currency}</span>
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-right">
							<span class="text-sm text-gray-600">
								{formatCurrency(rep.avgDealSize)} {rep.currency}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
