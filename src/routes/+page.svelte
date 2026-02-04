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

<div class="min-h-screen bg-gray-50 py-12 px-4">
	<div class="max-w-6xl mx-auto">
		<div class="text-center mb-12">
			<h1 class="text-4xl font-bold text-gray-900 mb-2">Scoring Engine</h1>
			<p class="text-lg text-gray-600">Lead Scoring Service med TIC.io-enrichment</p>
		</div>

		<!-- Navigation Cards -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
			<a href="/customers" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border-l-4 border-blue-500">
				<div class="flex items-center gap-4">
					<div class="text-4xl">🏢</div>
					<div>
						<h2 class="text-xl font-semibold text-gray-900">Kunder</h2>
						<p class="text-gray-600">Se alla organisationer</p>
					</div>
				</div>
			</a>

			<a href="/persons" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border-l-4 border-green-500">
				<div class="flex items-center gap-4">
					<div class="text-4xl">👥</div>
					<div>
						<h2 class="text-xl font-semibold text-gray-900">Personer</h2>
						<p class="text-gray-600">Se alla kontaktpersoner</p>
					</div>
				</div>
			</a>

			<a href="/icp" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border-l-4 border-purple-500">
				<div class="flex items-center gap-4">
					<div class="text-4xl">⚙️</div>
					<div>
						<h2 class="text-xl font-semibold text-gray-900">ICP Editor</h2>
						<p class="text-gray-600">Konfigurera scoring</p>
					</div>
				</div>
			</a>

			<a href="/docs" class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border-l-4 border-orange-500">
				<div class="flex items-center gap-4">
					<div class="text-4xl">📚</div>
					<div>
						<h2 class="text-xl font-semibold text-gray-900">API Docs</h2>
						<p class="text-gray-600">API-dokumentation</p>
					</div>
				</div>
			</a>
		</div>

		<!-- Scoring Test Section -->
		<div class="bg-white rounded-lg shadow-md p-6 mb-8">
			<h2 class="text-2xl font-semibold mb-4">Testa Scoring</h2>
			<button
				onclick={runTest}
				disabled={isLoading}
				class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
			>
				{isLoading ? 'Beraknar...' : 'Kor test'}
			</button>

			{#if testResult}
				<div class="mt-4">
					<h3 class="font-semibold mb-2">Resultat:</h3>
					<pre class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">{JSON.stringify(testResult, null, 2)}</pre>
				</div>
			{/if}
		</div>

		<!-- Tiers Explanation -->
		<div class="bg-white rounded-lg shadow-md p-6 mb-8">
			<h2 class="text-2xl font-semibold mb-4">Tier-nivaer</h2>
			<div class="grid grid-cols-3 gap-4">
				<div class="text-center p-4 bg-yellow-100 rounded-lg">
					<div class="text-3xl mb-2">🥇</div>
					<div class="font-bold text-yellow-800">GOLD</div>
					<div class="text-sm text-gray-600">Score >= 70</div>
				</div>
				<div class="text-center p-4 bg-gray-200 rounded-lg">
					<div class="text-3xl mb-2">🥈</div>
					<div class="font-bold text-gray-700">SILVER</div>
					<div class="text-sm text-gray-600">Score 40-69</div>
				</div>
				<div class="text-center p-4 bg-orange-100 rounded-lg">
					<div class="text-3xl mb-2">🥉</div>
					<div class="font-bold text-orange-800">BRONZE</div>
					<div class="text-sm text-gray-600">Score &lt; 40</div>
				</div>
			</div>
		</div>

		<!-- API Documentation -->
		<div class="bg-white rounded-lg shadow-md p-6">
			<h2 class="text-2xl font-semibold mb-4">API Endpoints</h2>
			<div class="space-y-4">
				<div class="border-l-4 border-blue-500 pl-4">
					<code class="text-sm bg-gray-100 px-2 py-1 rounded">POST /api/score/person</code>
					<p class="text-gray-600 mt-1">Score en enskild person med foretagskontext</p>
				</div>
				<div class="border-l-4 border-green-500 pl-4">
					<code class="text-sm bg-gray-100 px-2 py-1 rounded">POST /api/score/bulk</code>
					<p class="text-gray-600 mt-1">Score flera personer samtidigt (max 1000)</p>
				</div>
				<div class="border-l-4 border-purple-500 pl-4">
					<code class="text-sm bg-gray-100 px-2 py-1 rounded">GET /api/score/config</code>
					<p class="text-gray-600 mt-1">Visa aktuell scoring-konfiguration</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	:global(body) {
		font-family: system-ui, -apple-system, sans-serif;
	}
</style>
