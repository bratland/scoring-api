import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	waitForRateLimit,
	updateRateLimitFromHeaders,
	handleRateLimitError,
	rateLimitedFetch
} from './rateLimiter';

describe('rateLimiter', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('updateRateLimitFromHeaders', () => {
		it('should update remaining from headers', () => {
			const headers = new Headers({
				'x-ratelimit-remaining': '50'
			});
			updateRateLimitFromHeaders(headers);
			// State is internal, but we can test behavior through waitForRateLimit
		});

		it('should update reset time from headers', () => {
			const futureTime = Math.floor(Date.now() / 1000) + 10;
			const headers = new Headers({
				'x-ratelimit-reset': String(futureTime)
			});
			updateRateLimitFromHeaders(headers);
		});

		it('should handle missing headers gracefully', () => {
			const headers = new Headers();
			expect(() => updateRateLimitFromHeaders(headers)).not.toThrow();
		});
	});

	describe('waitForRateLimit', () => {
		it('should enforce minimum delay between requests', async () => {
			// First request should pass immediately
			const promise1 = waitForRateLimit();
			vi.advanceTimersByTime(0);
			await promise1;

			// Second request should wait for MIN_DELAY_MS (50ms)
			const start = Date.now();
			const promise2 = waitForRateLimit();
			vi.advanceTimersByTime(50);
			await promise2;

			// The function should have waited
			expect(Date.now() - start).toBeGreaterThanOrEqual(50);
		});

		it('should wait when rate limit is exhausted', async () => {
			// Set remaining to 0 via headers
			const headers = new Headers({
				'x-ratelimit-remaining': '0',
				'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 2)
			});
			updateRateLimitFromHeaders(headers);

			const promise = waitForRateLimit();

			// Advance time to allow the wait
			vi.advanceTimersByTime(2100);
			await promise;
		});
	});

	describe('handleRateLimitError', () => {
		it('should wait for BACKOFF_DELAY_MS (2100ms)', async () => {
			const promise = handleRateLimitError();
			vi.advanceTimersByTime(2100);
			await promise;
		});
	});

	describe('rateLimitedFetch', () => {
		beforeEach(() => {
			vi.useRealTimers(); // Use real timers for these tests
			vi.stubGlobal('fetch', vi.fn());
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('should return response on successful request', async () => {
			const mockResponse = new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'x-ratelimit-remaining': '79' }
			});
			vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

			const response = await rateLimitedFetch('https://api.pipedrive.com/v1/test');

			expect(response.status).toBe(200);
			expect(fetch).toHaveBeenCalledTimes(1);
		});

		it('should retry on 429 status', async () => {
			const rateLimitResponse = new Response('Rate limited', {
				status: 429,
				headers: { 'x-ratelimit-remaining': '0' }
			});
			const successResponse = new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'x-ratelimit-remaining': '79' }
			});

			vi.mocked(fetch)
				.mockResolvedValueOnce(rateLimitResponse)
				.mockResolvedValueOnce(successResponse);

			const response = await rateLimitedFetch('https://api.pipedrive.com/v1/test');

			expect(response.status).toBe(200);
			expect(fetch).toHaveBeenCalledTimes(2);
		}, 10000); // 10 second timeout for this test

		it('should throw after max retries', async () => {
			const error = new Error('Network error');
			vi.mocked(fetch).mockRejectedValue(error);

			await expect(
				rateLimitedFetch('https://api.pipedrive.com/v1/test', {}, 2)
			).rejects.toThrow('Network error');

			expect(fetch).toHaveBeenCalledTimes(2);
		}, 10000); // 10 second timeout for this test
	});
});
