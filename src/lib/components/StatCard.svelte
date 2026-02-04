<script lang="ts">
	interface Props {
		label: string;
		value: string | number;
		change?: number;
		unit?: string;
		description?: string;
		icon?: string;
	}

	let { label, value, change, unit = '', description, icon }: Props = $props();

	function formatChange(val: number): string {
		const prefix = val >= 0 ? '+' : '';
		return `${prefix}${val.toFixed(1)}%`;
	}
</script>

<div class="bg-white shadow-sm rounded-lg p-6 border border-gray-200 hover:shadow-md transition-shadow">
	<div class="flex items-start justify-between">
		<div class="flex-1">
			<h3 class="text-sm font-medium text-gray-500 uppercase tracking-wide">{label}</h3>
			<div class="mt-2 flex items-baseline gap-2">
				<span class="text-3xl font-bold text-gray-900">
					{value}{unit}
				</span>
				{#if change !== undefined}
					<span class="text-sm font-medium {change >= 0 ? 'text-green-600' : 'text-red-600'}">
						{formatChange(change)}
					</span>
				{/if}
			</div>
			{#if description}
				<p class="mt-1 text-sm text-gray-500">{description}</p>
			{/if}
		</div>
		{#if icon}
			<div class="flex-shrink-0 ml-4">
				<span class="text-3xl">{icon}</span>
			</div>
		{/if}
	</div>
</div>
