/**
 * Rate limiter for Pipedrive API
 * Pipedrive limits: ~80 requests per 2 seconds
 * Uses adaptive backoff based on response headers
 */

interface RateLimitState {
	remaining: number;
	resetTime: number;
	lastRequest: number;
}

const state: RateLimitState = {
	remaining: 80,
	resetTime: Date.now() + 2000,
	lastRequest: 0
};

const MIN_DELAY_MS = 50; // Minimum 50ms between requests
const BACKOFF_DELAY_MS = 2100; // Wait time when rate limited

export function updateRateLimitFromHeaders(headers: Headers): void {
	const remaining = headers.get('x-ratelimit-remaining');
	const reset = headers.get('x-ratelimit-reset');

	if (remaining !== null) {
		state.remaining = parseInt(remaining, 10);
	}

	if (reset !== null) {
		state.resetTime = parseInt(reset, 10) * 1000; // Convert to ms
	}
}

export async function waitForRateLimit(): Promise<void> {
	const now = Date.now();

	// Ensure minimum delay between requests
	const timeSinceLastRequest = now - state.lastRequest;
	if (timeSinceLastRequest < MIN_DELAY_MS) {
		await sleep(MIN_DELAY_MS - timeSinceLastRequest);
	}

	// If we're out of requests, wait for reset
	if (state.remaining <= 1) {
		const waitTime = Math.max(0, state.resetTime - Date.now() + 100);
		if (waitTime > 0) {
			console.log(`[RateLimiter] Waiting ${waitTime}ms for rate limit reset...`);
			await sleep(waitTime);
		}
		state.remaining = 80; // Assume reset
	}

	state.lastRequest = Date.now();
}

export async function handleRateLimitError(): Promise<void> {
	console.log(`[RateLimiter] Rate limited! Backing off for ${BACKOFF_DELAY_MS}ms...`);
	await sleep(BACKOFF_DELAY_MS);
	state.remaining = 80;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a fetch call with rate limiting
 */
export async function rateLimitedFetch(
	url: string,
	options: RequestInit = {},
	maxRetries = 3
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		await waitForRateLimit();

		try {
			const response = await fetch(url, options);
			updateRateLimitFromHeaders(response.headers);

			if (response.status === 429) {
				// Rate limited
				await handleRateLimitError();
				continue;
			}

			return response;
		} catch (error) {
			lastError = error as Error;
			console.error(`[RateLimiter] Request failed (attempt ${attempt + 1}):`, error);
			await sleep(1000 * (attempt + 1)); // Exponential backoff
		}
	}

	throw lastError || new Error('Max retries exceeded');
}
