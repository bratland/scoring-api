<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	interface Person {
		id: number;
		name: string;
		email?: Array<{ value: string; primary: boolean }>;
		phone?: Array<{ value: string; primary: boolean }>;
		org_id?: { value: number; name: string } | number;
		owner_id?: { id: number; name: string } | number;
		[key: string]: unknown;
	}

	let persons = $state<Person[]>([]);
	let filteredPersons = $state<Person[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let orgFilter = $state<string>('');
	let sortBy = $state<'name' | 'id'>('name');
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let total = $state(0);

	onMount(async () => {
		// Check for org_id in URL params
		const urlOrgId = $page.url.searchParams.get('org_id');
		if (urlOrgId) {
			orgFilter = urlOrgId;
		}
		await loadPersons();
	});

	async function loadPersons() {
		isLoading = true;
		error = null;

		try {
			let url = '/api/persons';
			if (orgFilter) {
				url += `?org_id=${orgFilter}`;
			}

			const response = await fetch(url);
			const result = await response.json();

			if (result.success) {
				persons = result.data;
				total = result.originalTotal;
				applyFilters();
			} else {
				error = result.error || 'Kunde inte hamta personer';
			}
		} catch (e) {
			error = 'Natverksfel vid hamtning av personer';
		} finally {
			isLoading = false;
		}
	}

	function applyFilters() {
		let filtered = [...persons];

		// Search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(person =>
				person.name?.toLowerCase().includes(query) ||
				String(person.id).includes(query) ||
				getPrimaryEmail(person.email)?.toLowerCase().includes(query)
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

		filteredPersons = filtered;
	}

	function toggleSort(field: 'name' | 'id') {
		if (sortBy === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = field;
			sortOrder = 'asc';
		}
		applyFilters();
	}

	function getPrimaryEmail(emails: Array<{ value: string; primary: boolean }> | undefined): string {
		if (!emails || emails.length === 0) return '-';
		const primary = emails.find(e => e.primary) || emails[0];
		return primary?.value || '-';
	}

	function getPrimaryPhone(phones: Array<{ value: string; primary: boolean }> | undefined): string {
		if (!phones || phones.length === 0) return '-';
		const primary = phones.find(p => p.primary) || phones[0];
		return primary?.value || '-';
	}

	function getOrgName(org: { value: number; name: string } | number | undefined): string {
		if (!org) return '-';
		if (typeof org === 'number') return `#${org}`;
		return org.name || '-';
	}

	function getOwnerName(owner: { id: number; name: string } | number | undefined): string {
		if (!owner) return '-';
		if (typeof owner === 'number') return `#${owner}`;
		return owner.name || '-';
	}

	function clearOrgFilter() {
		orgFilter = '';
		loadPersons();
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
				<h1 class="text-3xl font-bold text-gray-900">Personer</h1>
				<p class="text-gray-600 mt-1">
					{#if !isLoading}
						Visar {filteredPersons.length} av {total} personer
						{#if orgFilter}
							<span class="text-blue-600">(filtrerat pa organisation)</span>
						{/if}
					{:else}
						Laddar...
					{/if}
				</p>
			</div>
			<div class="flex gap-2">
				<a href="/" class="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg">
					Tillbaka
				</a>
				<a href="/customers" class="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg">
					Kunder
				</a>
				<button
					onclick={loadPersons}
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
						placeholder="Sok pa namn, ID eller e-post..."
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>
				{#if orgFilter}
					<button
						onclick={clearOrgFilter}
						class="px-4 py-2 text-red-600 hover:text-red-800 border border-red-300 rounded-lg"
					>
						Rensa filter
					</button>
				{/if}
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
								E-post
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Telefon
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Organisation
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Agare
							</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
								Atgarder
							</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each filteredPersons as person (person.id)}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{person.id}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<a href="/persons/{person.id}" class="text-sm font-medium text-blue-600 hover:text-blue-800">
										{person.name}
									</a>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{getPrimaryEmail(person.email)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{getPrimaryPhone(person.phone)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{getOrgName(person.org_id)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{getOwnerName(person.owner_id)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm">
									<a href="/persons/{person.id}" class="text-blue-600 hover:text-blue-800">
										Visa & Testa
									</a>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="7" class="px-6 py-12 text-center text-gray-500">
									{searchQuery ? 'Inga personer matchar sokningen' : 'Inga personer hittades'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
