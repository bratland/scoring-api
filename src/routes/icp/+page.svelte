<script lang="ts">
	import { onMount } from 'svelte';

	interface IndustryTier {
		name: string;
		score: number;
		industries: string[];
	}

	interface ICPConfig {
		weights: { person: number; company: number };
		tiers: { gold: number; silver: number };
		personFactors: { role: number; relationship: number; engagement: number };
		companyFactors: { revenue: number; growth: number; industryFit: number; distance: number; existingScore: number };
		roleScores: Record<string, number>;
		relationshipScores: Record<string, number>;
		industryTiers: IndustryTier[];
		defaultIndustryScore: number;
		revenueTiers: Array<{ min: number; score: number }>;
		growthTiers: Array<{ min: number; score: number }>;
		engagementTiers: Array<{ min: number; score: number }>;
		distanceTiers: Array<{ max: number; score: number }>;
	}

	let config = $state<ICPConfig | null>(null);
	let source = $state<string>('');
	let lastModified = $state<string | null>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let activeTab = $state<'weights' | 'roles' | 'industries' | 'tiers'>('weights');
	let newIndustries = $state<Record<number, string>>({});
	let newRole = $state('');
	let newRoleScore = $state(50);

	onMount(async () => {
		await loadConfig();
	});

	async function loadConfig() {
		isLoading = true;
		try {
			const response = await fetch('/api/icp');
			const data = await response.json();
			config = data.config;
			source = data.source;
			lastModified = data.lastModified;
		} catch (error) {
			message = { type: 'error', text: 'Kunde inte ladda konfiguration' };
		} finally {
			isLoading = false;
		}
	}

	async function saveConfig() {
		if (!config) return;
		isSaving = true;
		message = null;

		try {
			const response = await fetch('/api/icp', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(config)
			});
			const data = await response.json();

			if (response.ok) {
				message = { type: 'success', text: 'Konfiguration sparad!' };
				source = 'saved';
				lastModified = data.lastModified;
			} else {
				message = { type: 'error', text: data.error || 'Kunde inte spara' };
			}
		} catch (error) {
			message = { type: 'error', text: 'Natverk fel' };
		} finally {
			isSaving = false;
		}
	}

	async function resetConfig() {
		if (!confirm('Aterstall till standardvarden?')) return;

		try {
			const response = await fetch('/api/icp', { method: 'DELETE' });
			if (response.ok) {
				await loadConfig();
				message = { type: 'success', text: 'Aterstalldes till standard' };
			}
		} catch (error) {
			message = { type: 'error', text: 'Kunde inte aterstalla' };
		}
	}

	function addIndustryToTier(tierIndex: number) {
		if (!config) return;
		const value = newIndustries[tierIndex]?.trim();
		if (!value) return;
		if (!config.industryTiers[tierIndex].industries.includes(value)) {
			config.industryTiers[tierIndex].industries = [...config.industryTiers[tierIndex].industries, value];
		}
		newIndustries = { ...newIndustries, [tierIndex]: '' };
	}

	function removeIndustryFromTier(tierIndex: number, industry: string) {
		if (!config) return;
		config.industryTiers[tierIndex].industries = config.industryTiers[tierIndex].industries.filter(i => i !== industry);
	}

	function addIndustryTier() {
		if (!config) return;
		config.industryTiers = [...config.industryTiers, { name: `Prioritet ${String.fromCharCode(65 + config.industryTiers.length)}`, score: 40, industries: [] }];
	}

	function removeIndustryTier(tierIndex: number) {
		if (!config || config.industryTiers.length <= 1) return;
		config.industryTiers = config.industryTiers.filter((_, i) => i !== tierIndex);
	}

	function addRole() {
		if (!config || !newRole.trim()) return;
		config.roleScores[newRole.trim()] = newRoleScore;
		config.roleScores = { ...config.roleScores };
		newRole = '';
		newRoleScore = 50;
	}

	function removeRole(role: string) {
		if (!config) return;
		const { [role]: _, ...rest } = config.roleScores;
		config.roleScores = rest;
	}

	function formatNumber(n: number): string {
		if (n >= 1_000_000) return `${n / 1_000_000}M`;
		if (n >= 1_000) return `${n / 1_000}K`;
		return String(n);
	}
</script>

<div class="min-h-screen bg-dw-bg py-8 px-4">
	<div class="max-w-5xl mx-auto">
		<div class="flex justify-between items-start mb-6">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">ICP Editor</h1>
				<p class="text-gray-600 mt-1">Konfigurera Ideal Customer Profile</p>
				{#if lastModified}
					<p class="text-sm text-gray-500 mt-1">Senast sparad: {new Date(lastModified).toLocaleString('sv-SE')}</p>
				{:else if source === 'default'}
					<p class="text-sm text-amber-600 mt-1">Anvander standardvarden</p>
				{/if}
			</div>
			<div class="flex gap-2">
				<a href="/" class="btn-secondary">Tillbaka</a>
				<button onclick={resetConfig} class="px-4 py-2 text-red-600 hover:text-red-800 border border-red-300 rounded-dw">
					Aterstall
				</button>
				<button
					onclick={saveConfig}
					disabled={isSaving || isLoading}
					class="btn-primary disabled:opacity-50"
				>
					{isSaving ? 'Sparar...' : 'Spara'}
				</button>
			</div>
		</div>

		{#if message}
			<div class="mb-6 p-4 rounded-lg {message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}">
				{message.text}
			</div>
		{/if}

		{#if isLoading}
			<div class="flex justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		{:else if config}
			<!-- Tab Navigation -->
			<div class="tab-nav mb-6">
				<button
					onclick={() => activeTab = 'weights'}
					class={activeTab === 'weights' ? 'active' : ''}
				>
					Vikter & Trösklar
				</button>
				<button
					onclick={() => activeTab = 'roles'}
					class={activeTab === 'roles' ? 'active' : ''}
				>
					Roller & Relationer
				</button>
				<button
					onclick={() => activeTab = 'industries'}
					class={activeTab === 'industries' ? 'active' : ''}
				>
					Målbranscher
				</button>
				<button
					onclick={() => activeTab = 'tiers'}
					class={activeTab === 'tiers' ? 'active' : ''}
				>
					Scoring Tiers
				</button>
			</div>

			<!-- WEIGHTS TAB -->
			{#if activeTab === 'weights'}
				<div class="space-y-6">
					<!-- Main Weights -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Huvudvikter</h2>
						<p class="text-sm text-gray-500 mb-4">Hur mycket varje del vager i total-poangen. Maste summera till 100%.</p>
						<div class="grid grid-cols-2 gap-6">
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Person-poang</label>
								<div class="flex items-center gap-3">
									<input
										type="range"
										min="0"
										max="100"
										step="5"
										value={Math.round(config.weights.person * 100)}
										oninput={(e) => {
											const val = Number(e.currentTarget.value) / 100;
											config!.weights.person = val;
											config!.weights.company = 1 - val;
										}}
										class="flex-1"
									/>
									<span class="w-16 text-right font-mono">{Math.round(config.weights.person * 100)}%</span>
								</div>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Foretags-poang</label>
								<div class="flex items-center gap-3">
									<input
										type="range"
										min="0"
										max="100"
										step="5"
										value={Math.round(config.weights.company * 100)}
										oninput={(e) => {
											const val = Number(e.currentTarget.value) / 100;
											config!.weights.company = val;
											config!.weights.person = 1 - val;
										}}
										class="flex-1"
									/>
									<span class="w-16 text-right font-mono">{Math.round(config.weights.company * 100)}%</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Tier Thresholds -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Tier-trangsklar</h2>
						<div class="grid grid-cols-3 gap-6">
							<div class="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
								<label class="block text-sm font-medium text-yellow-800 mb-2">GOLD (minst)</label>
								<input
									type="number"
									min="0"
									max="100"
									bind:value={config.tiers.gold}
									class="w-full px-3 py-2 border rounded-lg"
								/>
							</div>
							<div class="p-4 bg-gray-100 rounded-lg border border-gray-300">
								<label class="block text-sm font-medium text-gray-700 mb-2">SILVER (minst)</label>
								<input
									type="number"
									min="0"
									max="100"
									bind:value={config.tiers.silver}
									class="w-full px-3 py-2 border rounded-lg"
								/>
							</div>
							<div class="p-4 bg-orange-50 rounded-lg border border-orange-200">
								<label class="block text-sm font-medium text-orange-800 mb-2">BRONZE</label>
								<p class="text-sm text-orange-600">Under {config.tiers.silver}</p>
							</div>
						</div>
					</div>

					<!-- Person Factors -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Person-faktorer</h2>
						<p class="text-sm text-gray-500 mb-4">Vikter inom person-poangen. Maste summera till 100%.</p>
						<div class="space-y-4">
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Roll/Funktion ({Math.round(config.personFactors.role * 100)}%)</label>
								<input type="range" min="0" max="100" step="5" value={config.personFactors.role * 100}
									oninput={(e) => config!.personFactors.role = Number(e.currentTarget.value) / 100}
									class="w-full" />
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Relationsstyrka ({Math.round(config.personFactors.relationship * 100)}%)</label>
								<input type="range" min="0" max="100" step="5" value={config.personFactors.relationship * 100}
									oninput={(e) => config!.personFactors.relationship = Number(e.currentTarget.value) / 100}
									class="w-full" />
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Engagement ({Math.round(config.personFactors.engagement * 100)}%)</label>
								<input type="range" min="0" max="100" step="5" value={config.personFactors.engagement * 100}
									oninput={(e) => config!.personFactors.engagement = Number(e.currentTarget.value) / 100}
									class="w-full" />
							</div>
							<p class="text-sm {Math.abs(config.personFactors.role + config.personFactors.relationship + config.personFactors.engagement - 1) < 0.01 ? 'text-green-600' : 'text-red-600'}">
								Summa: {Math.round((config.personFactors.role + config.personFactors.relationship + config.personFactors.engagement) * 100)}%
							</p>
						</div>
					</div>

					<!-- Company Factors -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Foretags-faktorer</h2>
						<p class="text-sm text-gray-500 mb-4">Vikter inom foretags-poangen. Maste summera till 100%.</p>
						<div class="space-y-4">
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Omsattning ({Math.round(config.companyFactors.revenue * 100)}%)</label>
								<input type="range" min="0" max="100" step="5" value={config.companyFactors.revenue * 100}
									oninput={(e) => config!.companyFactors.revenue = Number(e.currentTarget.value) / 100}
									class="w-full" />
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Tillvaxt ({Math.round(config.companyFactors.growth * 100)}%)</label>
								<input type="range" min="0" max="100" step="5" value={config.companyFactors.growth * 100}
									oninput={(e) => config!.companyFactors.growth = Number(e.currentTarget.value) / 100}
									class="w-full" />
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Bransch-fit ({Math.round(config.companyFactors.industryFit * 100)}%)</label>
								<input type="range" min="0" max="100" step="5" value={config.companyFactors.industryFit * 100}
									oninput={(e) => config!.companyFactors.industryFit = Number(e.currentTarget.value) / 100}
									class="w-full" />
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Avstand ({Math.round(config.companyFactors.distance * 100)}%)</label>
								<input type="range" min="0" max="100" step="5" value={config.companyFactors.distance * 100}
									oninput={(e) => config!.companyFactors.distance = Number(e.currentTarget.value) / 100}
									class="w-full" />
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Befintlig score ({Math.round(config.companyFactors.existingScore * 100)}%)</label>
								<input type="range" min="0" max="100" step="5" value={config.companyFactors.existingScore * 100}
									oninput={(e) => config!.companyFactors.existingScore = Number(e.currentTarget.value) / 100}
									class="w-full" />
							</div>
							{#if true}
								{@const companySum = config.companyFactors.revenue + config.companyFactors.growth + config.companyFactors.industryFit + config.companyFactors.distance + config.companyFactors.existingScore}
								<p class="text-sm {Math.abs(companySum - 1) < 0.01 ? 'text-green-600' : 'text-red-600'}">
									Summa: {Math.round(companySum * 100)}%
								</p>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- ROLES TAB -->
			{#if activeTab === 'roles'}
				<div class="space-y-6">
					<!-- Role Scores -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Roll-poang</h2>
						<p class="text-sm text-gray-500 mb-4">Hogre poang = mer vardefull roll for ICP.</p>

						<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
							{#each Object.entries(config.roleScores).sort((a, b) => b[1] - a[1]) as [role, score]}
								<div class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
									<input
										type="number"
										min="0"
										max="100"
										bind:value={config.roleScores[role]}
										class="w-16 px-2 py-1 border rounded text-center"
									/>
									<span class="flex-1 text-sm">{role}</span>
									<button onclick={() => removeRole(role)} class="text-red-500 hover:text-red-700">
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							{/each}
						</div>

						<div class="flex gap-2">
							<input
								type="text"
								bind:value={newRole}
								placeholder="Ny roll..."
								class="flex-1 px-3 py-2 border rounded-lg"
							/>
							<input
								type="number"
								min="0"
								max="100"
								bind:value={newRoleScore}
								class="w-20 px-3 py-2 border rounded-lg"
							/>
							<button onclick={addRole} class="btn-primary">
								Lagg till
							</button>
						</div>
					</div>

					<!-- Relationship Scores -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Relations-styrka</h2>
						<div class="space-y-4">
							{#each Object.entries(config.relationshipScores) as [relation, score]}
								<div class="flex items-center gap-4">
									<span class="w-48 text-sm">{relation}</span>
									<input
										type="range"
										min="0"
										max="100"
										bind:value={config.relationshipScores[relation]}
										class="flex-1"
									/>
									<span class="w-12 text-right font-mono">{score}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- INDUSTRIES TAB -->
			{#if activeTab === 'industries'}
				<div class="space-y-6">
					<div class="card p-6">
						<div class="flex justify-between items-center mb-4">
							<div>
								<h2 class="text-lg font-semibold">Bransch-nivaer</h2>
								<p class="text-sm text-gray-500 mt-1">Foretag matchas mot den forsta nivan dar branschen passar. Hogre niva = hogre poang.</p>
							</div>
							<button onclick={addIndustryTier} class="btn-secondary text-sm">
								+ Lagg till niva
							</button>
						</div>

						<div class="space-y-6">
							{#each config.industryTiers as tier, tierIndex}
								<div class="p-4 rounded-lg border {tierIndex === 0 ? 'bg-green-50 border-green-200' : tierIndex === 1 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}">
									<div class="flex items-center gap-4 mb-3">
										<input
											type="text"
											bind:value={config.industryTiers[tierIndex].name}
											class="font-semibold text-sm bg-transparent border-b border-dashed border-gray-400 px-1 py-0.5 w-32"
										/>
										<div class="flex items-center gap-2">
											<label class="text-sm text-gray-600">Poang:</label>
											<input
												type="number"
												min="0"
												max="100"
												bind:value={config.industryTiers[tierIndex].score}
												class="w-16 px-2 py-1 border rounded text-center text-sm"
											/>
										</div>
										{#if config.industryTiers.length > 1}
											<button onclick={() => removeIndustryTier(tierIndex)} class="ml-auto text-red-500 hover:text-red-700 text-sm">
												Ta bort niva
											</button>
										{/if}
									</div>

									<div class="flex flex-wrap gap-2 mb-3">
										{#each tier.industries as industry}
											<span class="inline-flex items-center gap-1 px-3 py-1 {tierIndex === 0 ? 'bg-green-100 text-green-800' : tierIndex === 1 ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-700'} rounded-full text-sm">
												{industry}
												<button onclick={() => removeIndustryFromTier(tierIndex, industry)} class="hover:opacity-70">
													<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
													</svg>
												</button>
											</span>
										{/each}
										{#if tier.industries.length === 0}
											<span class="text-sm text-gray-400 italic">Inga branscher tillagda</span>
										{/if}
									</div>

									<div class="flex gap-2">
										<input
											type="text"
											bind:value={newIndustries[tierIndex]}
											placeholder="Lagg till bransch..."
											class="flex-1 px-3 py-1.5 border rounded-lg text-sm"
											onkeydown={(e) => e.key === 'Enter' && addIndustryToTier(tierIndex)}
										/>
										<button onclick={() => addIndustryToTier(tierIndex)} class="px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800">
											Lagg till
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>

					<!-- Default score for unmatched industries -->
					<div class="card p-6">
						<h3 class="text-md font-semibold mb-2">Ovriga branscher</h3>
						<p class="text-sm text-gray-500 mb-3">Poang for foretag som inte matchar nagon niva ovan.</p>
						<div class="flex items-center gap-3">
							<input
								type="range"
								min="0"
								max="100"
								step="5"
								bind:value={config.defaultIndustryScore}
								class="flex-1"
							/>
							<span class="w-12 text-right font-mono">{config.defaultIndustryScore}</span>
						</div>
					</div>
				</div>
			{/if}

			<!-- TIERS TAB -->
			{#if activeTab === 'tiers'}
				<div class="space-y-6">
					<!-- Revenue Tiers -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Omsattnings-nivaer (SEK)</h2>
						<div class="space-y-3">
							{#each config.revenueTiers as tier, i}
								<div class="flex items-center gap-4">
									<span class="w-32 text-sm text-gray-600">Minst {formatNumber(tier.min)} SEK</span>
									<input
										type="range"
										min="0"
										max="100"
										bind:value={config.revenueTiers[i].score}
										class="flex-1"
									/>
									<span class="w-12 text-right font-mono">{tier.score}</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- Growth Tiers -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Tillvaxt-nivaer (CAGR)</h2>
						<div class="space-y-3">
							{#each config.growthTiers as tier, i}
								<div class="flex items-center gap-4">
									<span class="w-32 text-sm text-gray-600">
										{tier.min === -Infinity ? '< -10%' : `>= ${Math.round(tier.min * 100)}%`}
									</span>
									<input
										type="range"
										min="0"
										max="100"
										bind:value={config.growthTiers[i].score}
										class="flex-1"
									/>
									<span class="w-12 text-right font-mono">{tier.score}</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- Engagement Tiers -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Engagement-nivaer (aktiviteter/90 dagar)</h2>
						<div class="space-y-3">
							{#each config.engagementTiers as tier, i}
								<div class="flex items-center gap-4">
									<span class="w-32 text-sm text-gray-600">>= {tier.min} aktiviteter</span>
									<input
										type="range"
										min="0"
										max="100"
										bind:value={config.engagementTiers[i].score}
										class="flex-1"
									/>
									<span class="w-12 text-right font-mono">{tier.score}</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- Distance Tiers -->
					<div class="card p-6">
						<h2 class="text-lg font-semibold mb-4">Avstands-nivaer (km fran Goteborg)</h2>
						<div class="space-y-3">
							{#each config.distanceTiers as tier, i}
								<div class="flex items-center gap-4">
									<span class="w-32 text-sm text-gray-600">
										{tier.max === Infinity ? '> 1000 km' : `<= ${tier.max} km`}
									</span>
									<input
										type="range"
										min="0"
										max="100"
										bind:value={config.distanceTiers[i].score}
										class="flex-1"
									/>
									<span class="w-12 text-right font-mono">{tier.score}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
