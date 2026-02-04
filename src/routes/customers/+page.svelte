<script lang="ts">
	import { onMount } from 'svelte';

	interface Organization {
		id: number;
		name: string;
		address?: string;
		owner_id?: { id: number; name: string } | number;
		people_count?: number;
		[key: string]: unknown;
	}

	let organizations = $state<Organization[]>([]);
	let filteredOrganizations = $state<Organization[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let sortBy = $state<'name' | 'id' | 'people_count'>('name');
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let total = $state(0);

	onMount(async () => {
		await loadOrganizations();
	});

	async function loadOrganizations() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/organizations');
			const result = await response.json();

			if (result.success) {
				organizations = result.data;
				total = result.originalTotal;
				applyFilters();
			} else {
				error = result.error || 'Kunde inte hamta organisationer';
			}
		} catch (e) {
			error = 'Natverksfel vid hamtning av organisationer';
		} finally {
			isLoading = false;
		}
	}

	function applyFilters() {
		let filtered = [...organizations];

		// Search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(org =>
				org.name?.toLowerCase().includes(query) ||
				String(org.id).includes(query) ||
				org.address?.toLowerCase().includes(query)
			);
		}

		// Sort
		filtered.sort((a, b) => {
			let aVal = a[sortBy];
			let bVal = b[sortBy];

			if (typeof aVal === 'string') aVal = aVal.toLowerCase();
			if (typeof bVal === 'string') bVal = bVal.toLowerCase();

			if (aVal === undefined || aVal === null) return 1;
			if (bVal === undefined || bVal === null) return -1;

			if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
			return 0;
		});

		filteredOrganizations = filtered;
	}

	function toggleSort(field: 'name' | 'id' | 'people_count') {
		if (sortBy === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = field;
			sortOrder = 'asc';
		}
		applyFilters();
	}

	function getOwnerName(owner: { id: number; name: string } | number | undefined): string {
		if (!owner) return '-';
		if (typeof owner === 'number') return `#${owner}`;
		return owner.name || '-';
	}

	$effect(() => {
		if (!isLoading) {
			applyFilters();
		}
	});
</script>

<div class="min-h-screen bg-gray-50 py-8 px-4">
	<div class="max-w-7xl mx-auto">
		<div class="flex justify-between items-center mb-6">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Kunder</h1>
				<p class="text-gray-600 mt-1">
					{#if !isLoading}
						Visar {filteredOrganizations.length} av {total} organisationer
					{:else}
						Laddar...
					{/if}
				</p>
			</div>
			<div class="flex gap-2">
				<a href="/" class="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg">
					Tillbaka
				</a>
				<button
					onclick={loadOrganizations}
					disabled={isLoading}
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
				>
					{isLoading ? 'Laddar...' : 'Uppdatera'}
				</button>
			</div>
		</div>

		<!-- Search and filters -->
		<div class="bg-white shadow rounded-lg p-4 mb-6">
			<div class="flex gap-4 items-center">
				<div class="flex-1">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Sok pa namn, ID eller adress..."
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>
			</div>
		</div>

		{#if error}
			<div class="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
				{error}
			</div>
		{/if}

		{#if isLoading}
			<div class="flex justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		{:else}
			<div class="bg-white shadow rounded-lg overflow-hidden">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
								onclick={() => toggleSort('id')}
							>
								<div class="flex items-center gap-1">
									ID
									{#if sortBy === 'id'}
										<span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</div>
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
								onclick={() => toggleSort('name')}
							>
								<div class="flex items-center gap-1">
									Namn
									{#if sortBy === 'name'}
										<span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</div>
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Adress
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Agare
							</th>
							<th
								class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
								onclick={() => toggleSort('people_count')}
							>
								<div class="flex items-center gap-1">
									Personer
									{#if sortBy === 'people_count'}
										<span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</div>
							</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
								Atgarder
							</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each filteredOrganizations as org (org.id)}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{org.id}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium text-gray-900">{org.name}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{org.address || '-'}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{getOwnerName(org.owner_id)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{org.people_count ?? 0}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm">
									<a
										href="/persons?org_id={org.id}"
										class="text-blue-600 hover:text-blue-800"
									>
										Visa personer
									</a>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="6" class="px-6 py-12 text-center text-gray-500">
									{searchQuery ? 'Inga organisationer matchar sokningen' : 'Inga organisationer hittades'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
