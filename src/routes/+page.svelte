<script lang="ts">
	let testResult = $state<object | null>(null);
	let isLoading = $state(false);

	async function runTest() {
		isLoading = true;
		try {
			const response = await fetch('/api/score/person', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					person: {
						functions: ['CEO'],
						relationship_strength: 'We know each other',
						activities_90d: 15
					},
					company: {
						revenue: 25000000,
						cagr_3y: 0.12,
						score: 70,
						industry: 'Tech'
					}
				})
			});
			testResult = await response.json();
		} catch (error) {
			testResult = { error: String(error) };
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="min-h-screen bg-white py-16 px-6">
	<div class="max-w-5xl mx-auto">
		<!-- Header -->
		<div class="mb-16">
			<div class="flex items-center justify-center gap-3 mb-4">
				<span class="text-sm font-medium tracking-widest text-navy/60 uppercase">Daily Wins</span>
			</div>
			<h1 class="text-5xl md:text-6xl font-bold text-navy text-center mb-4">
				Scoring Engine
			</h1>
			<p class="text-xl text-navy/70 text-center max-w-2xl mx-auto">
				Lead Scoring Service med TIC.io-enrichment
			</p>
		</div>

		<!-- Navigation Cards -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-16">
			<a href="/customers" class="group bg-white rounded-2xl p-6 border border-navy/10 hover:border-navy/20 hover:shadow-lg transition-all duration-200">
				<div class="w-12 h-12 bg-lime/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-lime/30 transition-colors">
					<svg class="w-6 h-6 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
					</svg>
				</div>
				<h2 class="text-lg font-semibold text-navy mb-1">Kunder</h2>
				<p class="text-navy/60 text-sm">Se alla organisationer</p>
			</a>

			<a href="/persons" class="group bg-white rounded-2xl p-6 border border-navy/10 hover:border-navy/20 hover:shadow-lg transition-all duration-200">
				<div class="w-12 h-12 bg-lime/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-lime/30 transition-colors">
					<svg class="w-6 h-6 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
					</svg>
				</div>
				<h2 class="text-lg font-semibold text-navy mb-1">Personer</h2>
				<p class="text-navy/60 text-sm">Se alla kontaktpersoner</p>
			</a>

			<a href="/analytics" class="group bg-white rounded-2xl p-6 border border-navy/10 hover:border-navy/20 hover:shadow-lg transition-all duration-200">
				<div class="w-12 h-12 bg-lime/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-lime/30 transition-colors">
					<svg class="w-6 h-6 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
					</svg>
				</div>
				<h2 class="text-lg font-semibold text-navy mb-1">Analytics</h2>
				<p class="text-navy/60 text-sm">ICP & Säljarinsikter</p>
			</a>

			<a href="/icp" class="group bg-white rounded-2xl p-6 border border-navy/10 hover:border-navy/20 hover:shadow-lg transition-all duration-200">
				<div class="w-12 h-12 bg-lime/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-lime/30 transition-colors">
					<svg class="w-6 h-6 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
					</svg>
				</div>
				<h2 class="text-lg font-semibold text-navy mb-1">ICP Editor</h2>
				<p class="text-navy/60 text-sm">Konfigurera scoring</p>
			</a>

			<a href="/docs" class="group bg-white rounded-2xl p-6 border border-navy/10 hover:border-navy/20 hover:shadow-lg transition-all duration-200">
				<div class="w-12 h-12 bg-lime/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-lime/30 transition-colors">
					<svg class="w-6 h-6 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
					</svg>
				</div>
				<h2 class="text-lg font-semibold text-navy mb-1">API Docs</h2>
				<p class="text-navy/60 text-sm">API-dokumentation</p>
			</a>
		</div>

		<!-- Scoring Test Section -->
		<div class="bg-navy/[0.02] rounded-2xl p-8 mb-8">
			<h2 class="text-2xl font-semibold text-navy mb-6">Testa Scoring</h2>
			<button
				onclick={runTest}
				disabled={isLoading}
				class="bg-lime text-navy font-semibold px-6 py-3 rounded-lg hover:bg-lime/90 disabled:opacity-50 transition-colors"
			>
				{isLoading ? 'Beraknar...' : 'Kor test'}
			</button>

			{#if testResult}
				<div class="mt-6">
					<h3 class="font-semibold text-navy mb-3">Resultat:</h3>
					<pre class="bg-navy text-lime p-5 rounded-xl overflow-x-auto text-sm font-mono">{JSON.stringify(testResult, null, 2)}</pre>
				</div>
			{/if}
		</div>

		<!-- Tiers Explanation -->
		<div class="bg-navy/[0.02] rounded-2xl p-8 mb-8">
			<h2 class="text-2xl font-semibold text-navy mb-6">Tier-nivaer</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div class="text-center p-6 bg-white rounded-xl border border-navy/10">
					<div class="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
						<svg class="w-7 h-7 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
						</svg>
					</div>
					<div class="font-bold text-amber-600 text-lg mb-1">GOLD</div>
					<div class="text-sm text-navy/60">Score >= 70</div>
				</div>
				<div class="text-center p-6 bg-white rounded-xl border border-navy/10">
					<div class="w-14 h-14 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-3">
						<svg class="w-7 h-7 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
						</svg>
					</div>
					<div class="font-bold text-slate-600 text-lg mb-1">SILVER</div>
					<div class="text-sm text-navy/60">Score 40-69</div>
				</div>
				<div class="text-center p-6 bg-white rounded-xl border border-navy/10">
					<div class="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
						<svg class="w-7 h-7 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
						</svg>
					</div>
					<div class="font-bold text-orange-600 text-lg mb-1">BRONZE</div>
					<div class="text-sm text-navy/60">Score &lt; 40</div>
				</div>
			</div>
		</div>

		<!-- API Documentation -->
		<div class="bg-navy/[0.02] rounded-2xl p-8">
			<h2 class="text-2xl font-semibold text-navy mb-6">API Endpoints</h2>
			<div class="space-y-4">
				<div class="bg-white rounded-xl p-5 border border-navy/10">
					<div class="flex items-center gap-3 mb-2">
						<span class="bg-blue text-white text-xs font-bold px-2.5 py-1 rounded">POST</span>
						<code class="text-sm font-mono text-navy">/api/score/person</code>
					</div>
					<p class="text-navy/60 text-sm">Score en enskild person med foretagskontext</p>
				</div>
				<div class="bg-white rounded-xl p-5 border border-navy/10">
					<div class="flex items-center gap-3 mb-2">
						<span class="bg-blue text-white text-xs font-bold px-2.5 py-1 rounded">POST</span>
						<code class="text-sm font-mono text-navy">/api/score/bulk</code>
					</div>
					<p class="text-navy/60 text-sm">Score flera personer samtidigt (max 1000)</p>
				</div>
				<div class="bg-white rounded-xl p-5 border border-navy/10">
					<div class="flex items-center gap-3 mb-2">
						<span class="bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded">GET</span>
						<code class="text-sm font-mono text-navy">/api/score/config</code>
					</div>
					<p class="text-navy/60 text-sm">Visa aktuell scoring-konfiguration</p>
				</div>
			</div>
		</div>
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

	.text-blue { color: #184ACE; }
	.bg-blue { background-color: #184ACE; }
</style>
