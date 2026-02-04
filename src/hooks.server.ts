import type { Handle } from '@sveltejs/kit';

const ALLOWED_ORIGINS = [
	'https://scoring-api-seven.vercel.app',
	'https://scoring-api.vercel.app',
	'http://localhost:5176',
	'http://localhost:5173',
	'http://localhost:3000'
];

export const handle: Handle = async ({ event, resolve }) => {
	const origin = event.request.headers.get('origin');

	// Handle preflight OPTIONS requests
	if (event.request.method === 'OPTIONS') {
		const headers: Record<string, string> = {
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
			'Access-Control-Max-Age': '86400'
		};

		if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app'))) {
			headers['Access-Control-Allow-Origin'] = origin;
		}

		return new Response(null, { status: 204, headers });
	}

	const response = await resolve(event);

	// Add CORS headers to actual responses
	if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app'))) {
		response.headers.set('Access-Control-Allow-Origin', origin);
	}
	response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
	response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

	return response;
};
