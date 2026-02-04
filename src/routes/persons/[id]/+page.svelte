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

	interface Organization {
		id: number;
		name: string;
		address?: string;
		[key: string]: unknown;
	}

	interface EnrichedCompany {
		pipedriveOrgId: number;
		orgNumber?: string;
		ticCompanyId?: string;
		name?: string;
		revenue?: number;
		cagr3y?: number;
		employees?: number;
		creditScore?: number;
		sniCode?: string;
		industry?: string;
		distanceToGothenburg?: number;
		dataSource: 'cache' | 'tic' | 'pipedrive';
		cacheAge?: number;
		lastUpdated?: string;
	}

	interface ScoringResult {
		person_score: number;
		company_score: number;
		combined_score: number;
		tier: 'GOLD' | 'SILVER' | 'BRONZE';
		breakdown: {
			role_score: number;
			relationship_score: number;
			engagement_score: number;
			revenue_score: number;
			growth_score: number;
			industry_score: number;
			distance_score: number;
			existing_score: number;
		};
		factors_used: string[];
		warnings: string[];
	}

	interface PersonRoleResult {
		role?: string;
		title?: string;
		confidence: 'high' | 'medium' | 'low' | 'none';
		source?: string;
	}

	interface Engagement {
		notes: number;
		emails: number;
		files: number;
		total: number;
	}

	let person = $state<Person | null>(null);
	let organization = $state<Organization | null>(null);
	let enrichedCompany = $state<EnrichedCompany | null>(null);
	let personRole = $state<PersonRoleResult | null>(null);
	let activityCount = $state(0);
	let engagement = $state<Engagement | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Scoring inputs (editable)
	let functions = $state<string>('');
	let relationshipStrength = $state<string>('');
	let revenue = $state<string>('');
	let cagr = $state<string>('');
	let industry = $state<string>('');
	let distance = $state<string>('');

	// Scoring result
	let scoringResult = $state<ScoringResult | null>(null);
	let isScoring = $state(false);

	const relationshipOptions = [
		'We know each other',
		"We've heard of each other",
		'Weak',
		'None'
	];

	const functionOptions = [
		'CEO', 'CFO', 'COO', 'CTO', 'CMO',
		'Sales', 'Marketing', 'Operations', 'Finance',
		'HR', 'IT', 'Legal', 'None'
	];

	onMount(async () => {
		await loadPerson();
	});

	async function loadPerson() {
		isLoading = true;
		error = null;

		try {
			const id = $page.params.id;
			const response = await fetch(`/api/persons/${id}`);
			const result = await response.json();

			if (result.success) {
				person = result.person;
				organization = result.organization;
				enrichedCompany = result.enrichedCompany;
				personRole = result.personRole;
				activityCount = result.activityCount90d || 0;
				engagement = result.engagement || null;

				// Pre-fill scoring inputs from data
				if (person) {
					// Try to extract function from person data or Perplexity lookup
					if (personRole?.role && personRole.confidence !== 'none') {
						functions = personRole.role;
					} else {
						const personFunctions = person['function'] || person['job_title'] || '';
						functions = typeof personFunctions === 'string' ? personFunctions : '';
					}
				}

				// Pre-fill company data from TIC enrichment
				if (enrichedCompany) {
					if (enrichedCompany.revenue) {
						revenue = String(enrichedCompany.revenue);
					}
					if (enrichedCompany.cagr3y !== undefined) {
						cagr = String(enrichedCompany.cagr3y.toFixed(4));
					}
					if (enrichedCompany.distanceToGothenburg !== undefined) {
						distance = String(Math.round(enrichedCompany.distanceToGothenburg));
					}
					if (enrichedCompany.industry) {
						industry = enrichedCompany.industry;
					}
				}
			} else {
				error = result.error || 'Kunde inte hamta person';
			}
		} catch (e) {
			error = 'Natverksfel vid hamtning av person';
		} finally {
			isLoading = false;
		}
	}

	async function runScoring() {
		isScoring = true;
		scoringResult = null;

		try {
			const response = await fetch('/api/score/person', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					person: {
						functions: functions ? functions.split(',').map(f => f.trim()) : [],
						relationship_strength: relationshipStrength || undefined,
						activities_90d: engagement?.total ?? activityCount
					},
					company: {
						revenue: revenue ? parseFloat(revenue) : undefined,
						cagr_3y: cagr ? parseFloat(cagr) : undefined,
						industry: industry || undefined,
						distance_km: distance ? parseFloat(distance) : undefined
					}
				})
			});

			scoringResult = await response.json();
		} catch (e) {
			error = 'Kunde inte kora scoring';
		} finally {
			isScoring = false;
		}
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

	function getTierColor(tier: string): string {
		switch (tier) {
			case 'GOLD': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
			case 'SILVER': return 'bg-gray-200 text-gray-800 border-gray-400';
			case 'BRONZE': return 'bg-orange-100 text-orange-800 border-orange-300';
			default: return 'bg-gray-100 text-gray-600';
		}
	}

	function getTierEmoji(tier: string): string {
		switch (tier) {
			case 'GOLD': return '🥇';
			case 'SILVER': return '🥈';
			case 'BRONZE': return '🥉';
			default: return '';
		}
	}

	function formatSEK(amount: number): string {
		if (amount >= 1_000_000_000) {
			return `${(amount / 1_000_000_000).toFixed(1)} mdr SEK`;
		}
		if (amount >= 1_000_000) {
			return `${(amount / 1_000_000).toFixed(1)} MSEK`;
		}
		if (amount >= 1_000) {
			return `${(amount / 1_000).toFixed(0)} KSEK`;
		}
		return `${amount} SEK`;
	}
</script>

<div class="min-h-screen bg-gray-50 py-8 px-4">
	<div class="max-w-4xl mx-auto">
		<div class="flex justify-between items-center mb-6">
			<div>
				<a href="/persons" class="text-blue-600 hover:text-blue-800 text-sm">&larr; Tillbaka till personer</a>
				<h1 class="text-3xl font-bold text-gray-900 mt-2">
					{#if person}
						{person.name}
					{:else}
						Laddar...
					{/if}
				</h1>
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
		{:else if person}
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- Person Info -->
				<div class="bg-white shadow rounded-lg p-6">
					<h2 class="text-lg font-semibold mb-4">Personuppgifter</h2>
					<dl class="space-y-3">
						<div>
							<dt class="text-sm text-gray-500">ID</dt>
							<dd class="font-medium">{person.id}</dd>
						</div>
						<div>
							<dt class="text-sm text-gray-500">E-post</dt>
							<dd class="font-medium">{getPrimaryEmail(person.email)}</dd>
						</div>
						<div>
							<dt class="text-sm text-gray-500">Telefon</dt>
							<dd class="font-medium">{getPrimaryPhone(person.phone)}</dd>
						</div>
						<div>
							<dt class="text-sm text-gray-500">Engagemang (90 dagar)</dt>
							<dd class="font-medium">
								{#if engagement}
									<span class="text-lg">{engagement.total}</span>
									<span class="text-xs text-gray-500 ml-2">
										({activityCount} aktiviteter, {engagement.notes} anteckningar, {engagement.emails} e-post, {engagement.files} filer)
									</span>
								{:else}
									{activityCount}
								{/if}
							</dd>
						</div>
						{#if personRole && personRole.confidence !== 'none'}
							<div>
								<dt class="text-sm text-gray-500">Roll (via websokning)</dt>
								<dd class="font-medium">
									{personRole.title || personRole.role}
									<span class="ml-2 text-xs px-2 py-0.5 rounded-full {
										personRole.confidence === 'high' ? 'bg-green-100 text-green-700' :
										personRole.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
										'bg-gray-100 text-gray-600'
									}">
										{personRole.confidence === 'high' ? 'Hog' : personRole.confidence === 'medium' ? 'Medel' : 'Lag'} konfidens
									</span>
								</dd>
							</div>
						{/if}
					</dl>
				</div>

				<!-- Organization Info -->
				<div class="bg-white shadow rounded-lg p-6">
					<h2 class="text-lg font-semibold mb-4">Organisation</h2>
					{#if organization}
						<dl class="space-y-3">
							<div>
								<dt class="text-sm text-gray-500">Namn</dt>
								<dd class="font-medium">{organization.name}</dd>
							</div>
							<div>
								<dt class="text-sm text-gray-500">ID</dt>
								<dd class="font-medium">{organization.id}</dd>
							</div>
							<div>
								<dt class="text-sm text-gray-500">Adress</dt>
								<dd class="font-medium">{organization.address || '-'}</dd>
							</div>
						</dl>

						{#if enrichedCompany}
							<hr class="my-4" />
							<h3 class="text-sm font-semibold text-gray-700 mb-3">TIC-data</h3>
							<dl class="space-y-2">
								{#if enrichedCompany.orgNumber}
									<div class="flex justify-between">
										<dt class="text-sm text-gray-500">Org.nummer</dt>
										<dd class="text-sm font-medium">{enrichedCompany.orgNumber}</dd>
									</div>
								{/if}
								{#if enrichedCompany.revenue}
									<div class="flex justify-between">
										<dt class="text-sm text-gray-500">Omsattning</dt>
										<dd class="text-sm font-medium">{formatSEK(enrichedCompany.revenue)}</dd>
									</div>
								{/if}
								{#if enrichedCompany.cagr3y !== undefined}
									<div class="flex justify-between">
										<dt class="text-sm text-gray-500">Tillvaxt (CAGR 3ar)</dt>
										<dd class="text-sm font-medium {enrichedCompany.cagr3y >= 0 ? 'text-green-600' : 'text-red-600'}">{(enrichedCompany.cagr3y * 100).toFixed(1)}%</dd>
									</div>
								{/if}
								{#if enrichedCompany.industry}
									<div class="flex justify-between">
										<dt class="text-sm text-gray-500">Bransch</dt>
										<dd class="text-sm font-medium">{enrichedCompany.industry}</dd>
									</div>
								{/if}
								{#if enrichedCompany.employees}
									<div class="flex justify-between">
										<dt class="text-sm text-gray-500">Anstallda</dt>
										<dd class="text-sm font-medium">{enrichedCompany.employees}</dd>
									</div>
								{/if}
								{#if enrichedCompany.creditScore !== undefined}
									<div class="flex justify-between">
										<dt class="text-sm text-gray-500">Kreditbetyg</dt>
										<dd class="text-sm font-medium">{enrichedCompany.creditScore}</dd>
									</div>
								{/if}
								{#if enrichedCompany.distanceToGothenburg !== undefined}
									<div class="flex justify-between">
										<dt class="text-sm text-gray-500">Avstand till GBG</dt>
										<dd class="text-sm font-medium">{Math.round(enrichedCompany.distanceToGothenburg)} km</dd>
									</div>
								{/if}
								<div class="flex justify-between text-xs text-gray-400 mt-2 pt-2 border-t">
									<span>Kalla: {enrichedCompany.dataSource}</span>
									{#if enrichedCompany.lastUpdated}
										<span>Uppdaterad: {new Date(enrichedCompany.lastUpdated).toLocaleDateString('sv-SE')}</span>
									{/if}
								</div>
							</dl>
						{:else}
							<p class="text-sm text-amber-600 mt-4">TIC-data saknas (ingen TIC API-nyckel eller organisationsnummer)</p>
						{/if}
					{:else}
						<p class="text-gray-500">Ingen organisation kopplad</p>
					{/if}
				</div>
			</div>

			<!-- Scoring Section -->
			<div class="mt-6 bg-white shadow rounded-lg p-6">
				<h2 class="text-lg font-semibold mb-4">Testa Scoring</h2>
				<p class="text-sm text-gray-500 mb-4">Fyll i eller justera vardena nedan och klicka "Kor scoring"</p>

				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
					<!-- Person inputs -->
					<div>
						<label for="functions" class="block text-sm font-medium text-gray-700 mb-1">Roll/Funktion</label>
						<select
							id="functions"
							bind:value={functions}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
						>
							<option value="">Valj roll...</option>
							{#each functionOptions as opt}
								<option value={opt}>{opt}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="relationship" class="block text-sm font-medium text-gray-700 mb-1">Relationsstyrka</label>
						<select
							id="relationship"
							bind:value={relationshipStrength}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
						>
							<option value="">Valj...</option>
							{#each relationshipOptions as opt}
								<option value={opt}>{opt}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="engagement" class="block text-sm font-medium text-gray-700 mb-1">Engagemang (90d)</label>
						<input
							id="engagement"
							type="number"
							value={engagement?.total ?? activityCount}
							disabled
							class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
						/>
					</div>

					<!-- Company inputs -->
					<div>
						<label for="revenue" class="block text-sm font-medium text-gray-700 mb-1">Omsattning (SEK)</label>
						<input
							id="revenue"
							type="number"
							bind:value={revenue}
							placeholder="t.ex. 50000000"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="cagr" class="block text-sm font-medium text-gray-700 mb-1">Tillvaxt (CAGR)</label>
						<input
							id="cagr"
							type="number"
							step="0.01"
							bind:value={cagr}
							placeholder="t.ex. 0.15 for 15%"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="industry" class="block text-sm font-medium text-gray-700 mb-1">Bransch</label>
						<input
							id="industry"
							type="text"
							bind:value={industry}
							placeholder="t.ex. Tech"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="distance" class="block text-sm font-medium text-gray-700 mb-1">Avstand (km)</label>
						<input
							id="distance"
							type="number"
							bind:value={distance}
							placeholder="km fran Goteborg"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
						/>
					</div>

				</div>

				<button
					onclick={runScoring}
					disabled={isScoring}
					class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
				>
					{isScoring ? 'Beraknar...' : 'Kor scoring'}
				</button>

				<!-- Scoring Result -->
				{#if scoringResult}
					<div class="mt-6 border-t pt-6">
						<div class="flex items-center gap-4 mb-6">
							<div class="text-4xl">{getTierEmoji(scoringResult.tier)}</div>
							<div>
								<div class="text-3xl font-bold">{Math.round(scoringResult.combined_score)}</div>
								<div class="px-3 py-1 rounded-full text-sm font-medium inline-block {getTierColor(scoringResult.tier)}">
									{scoringResult.tier}
								</div>
							</div>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<!-- Person Score -->
							<div>
								<h3 class="font-semibold mb-2">Person-poang: {Math.round(scoringResult.person_score)}</h3>
								<div class="space-y-2">
									<div class="flex justify-between text-sm">
										<span>Roll</span>
										<span class="font-medium">{scoringResult.breakdown.role_score}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span>Relation</span>
										<span class="font-medium">{scoringResult.breakdown.relationship_score}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span>Engagement</span>
										<span class="font-medium">{scoringResult.breakdown.engagement_score}</span>
									</div>
								</div>
							</div>

							<!-- Company Score -->
							<div>
								<h3 class="font-semibold mb-2">Foretags-poang: {Math.round(scoringResult.company_score)}</h3>
								<div class="space-y-2">
									<div class="flex justify-between text-sm">
										<span>Omsattning</span>
										<span class="font-medium">{scoringResult.breakdown.revenue_score}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span>Tillvaxt</span>
										<span class="font-medium">{scoringResult.breakdown.growth_score}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span>Bransch</span>
										<span class="font-medium">{scoringResult.breakdown.industry_score}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span>Avstand</span>
										<span class="font-medium">{scoringResult.breakdown.distance_score}</span>
									</div>
								</div>
							</div>
						</div>

						{#if scoringResult.warnings.length > 0}
							<div class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
								<h4 class="font-medium text-amber-800 mb-1">Varningar:</h4>
								<ul class="text-sm text-amber-700 list-disc list-inside">
									{#each scoringResult.warnings as warning}
										<li>{warning}</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
