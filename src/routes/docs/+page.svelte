<script lang="ts">
	import { onMount } from 'svelte';

	let container: HTMLDivElement;

	onMount(async () => {
		// Load Swagger UI from CDN
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css';
		document.head.appendChild(link);

		const script = document.createElement('script');
		script.src = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js';
		script.onload = () => {
			// @ts-ignore
			window.SwaggerUIBundle({
				url: '/api/openapi.json',
				dom_id: '#swagger-ui',
				presets: [
					// @ts-ignore
					window.SwaggerUIBundle.presets.apis,
					// @ts-ignore
					window.SwaggerUIBundle.SwaggerUIStandalonePreset
				],
				layout: 'BaseLayout',
				deepLinking: true,
				showExtensions: true,
				showCommonExtensions: true
			});
		};
		document.body.appendChild(script);
	});
</script>

<svelte:head>
	<title>API Documentation - Scoring API</title>
</svelte:head>

<div class="swagger-container">
	<div id="swagger-ui"></div>
</div>

<style>
	.swagger-container {
		min-height: 100vh;
	}

	:global(.swagger-ui .topbar) {
		display: none;
	}

	:global(.swagger-ui .info) {
		margin: 20px 0;
	}

	:global(.swagger-ui .scheme-container) {
		padding: 15px 0;
	}
</style>
