import { vi, beforeEach } from 'vitest';

// Mock global fetch
(globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn();

// Reset mocks before each test
beforeEach(() => {
	vi.clearAllMocks();
});
