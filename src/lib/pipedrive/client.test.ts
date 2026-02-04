import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipedriveClient, extractOrgId, extractUserId } from './client';

// Mock the rateLimiter module
vi.mock('./rateLimiter', () => ({
	waitForRateLimit: vi.fn().mockResolvedValue(undefined),
	updateRateLimitFromHeaders: vi.fn(),
	handleRateLimitError: vi.fn().mockResolvedValue(undefined)
}));

describe('PipedriveClient', () => {
	let client: PipedriveClient;
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetch = vi.fn();
		vi.stubGlobal('fetch', mockFetch);
		client = new PipedriveClient({ apiToken: 'test-token' });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('should use default base URL', () => {
			const c = new PipedriveClient({ apiToken: 'token' });
			expect(c).toBeDefined();
		});

		it('should use custom domain', () => {
			const c = new PipedriveClient({ apiToken: 'token', domain: 'mycompany' });
			expect(c).toBeDefined();
		});
	});

	describe('getPerson', () => {
		it('should fetch person by id', async () => {
			const personData = { id: 123, name: 'Test Person' };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => Promise.resolve({ success: true, data: personData })
			});

			const result = await client.getPerson(123);

			expect(result.success).toBe(true);
			expect(result.data).toEqual(personData);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.pipedrive.com/v1/persons/123',
				expect.objectContaining({
					headers: expect.objectContaining({
						'x-api-token': 'test-token'
					})
				})
			);
		});

		it('should handle API error', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				headers: new Headers(),
				json: () => Promise.resolve({ success: false, error: 'Not found' })
			});

			const result = await client.getPerson(999);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Not found');
		});
	});

	describe('getOrganization', () => {
		it('should fetch organization by id', async () => {
			const orgData = { id: 456, name: 'Test Org' };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => Promise.resolve({ success: true, data: orgData })
			});

			const result = await client.getOrganization(456);

			expect(result.success).toBe(true);
			expect(result.data).toEqual(orgData);
		});
	});

	describe('getPersonActivities', () => {
		it('should fetch activities for person', async () => {
			const activities = [
				{ id: 1, done: true, add_time: '2024-01-01' },
				{ id: 2, done: false, add_time: '2024-01-02' }
			];
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => Promise.resolve({ success: true, data: activities })
			});

			const result = await client.getPersonActivities(123, 90);

			expect(result.success).toBe(true);
			expect(result.data).toHaveLength(2);
		});
	});

	describe('updatePerson', () => {
		it('should update person with given data', async () => {
			const updatedPerson = { id: 123, name: 'Updated Name' };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => Promise.resolve({ success: true, data: updatedPerson })
			});

			const result = await client.updatePerson(123, { name: 'Updated Name' });

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.pipedrive.com/v1/persons/123',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ name: 'Updated Name' })
				})
			);
		});
	});

	describe('getUsers', () => {
		it('should fetch all users', async () => {
			const users = [
				{ id: 1, name: 'User 1', email: 'user1@test.com' },
				{ id: 2, name: 'User 2', email: 'user2@test.com' }
			];
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => Promise.resolve({ success: true, data: users })
			});

			const result = await client.getUsers();

			expect(result.success).toBe(true);
			expect(result.data).toHaveLength(2);
		});
	});

	describe('getAllActivities', () => {
		it('should fetch all activities with pagination', async () => {
			// First page
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => Promise.resolve({
					success: true,
					data: [{ id: 1, type: 'call', done: true, add_time: '2024-01-01' }],
					additional_data: {
						pagination: {
							more_items_in_collection: true,
							next_start: 500
						}
					}
				})
			});

			// Second page
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => Promise.resolve({
					success: true,
					data: [{ id: 2, type: 'meeting', done: false, add_time: '2024-01-02' }],
					additional_data: {
						pagination: {
							more_items_in_collection: false
						}
					}
				})
			});

			const activities = await client.getAllActivities();

			expect(activities).toHaveLength(2);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('should stop on API error', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				headers: new Headers(),
				json: () => Promise.resolve({ success: false, error: 'Server error' })
			});

			const activities = await client.getAllActivities();

			expect(activities).toHaveLength(0);
		});
	});

	describe('getAllPersons', () => {
		it('should fetch all persons with pagination', async () => {
			// First page
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => Promise.resolve({
					success: true,
					data: [{ id: 1, name: 'Person 1' }],
					additional_data: {
						pagination: {
							more_items_in_collection: true,
							next_start: 500
						}
					}
				})
			});

			// Second page
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => Promise.resolve({
					success: true,
					data: [{ id: 2, name: 'Person 2' }],
					additional_data: {
						pagination: {
							more_items_in_collection: false
						}
					}
				})
			});

			const persons = await client.getAllPersons();

			expect(persons).toHaveLength(2);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});
	});

	describe('retry logic', () => {
		it('should retry on 429 status', async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: false,
					status: 429,
					headers: new Headers(),
					json: () => Promise.resolve({ success: false })
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: new Headers(),
					json: () => Promise.resolve({ success: true, data: { id: 1 } })
				});

			const result = await client.getPerson(1);

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('should retry on network error', async () => {
			mockFetch
				.mockRejectedValueOnce(new Error('Network error'))
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					headers: new Headers(),
					json: () => Promise.resolve({ success: true, data: { id: 1 } })
				});

			const result = await client.getPerson(1);

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});
	});
});

describe('extractOrgId', () => {
	it('should return null for null input', () => {
		expect(extractOrgId(null)).toBeNull();
	});

	it('should return null for undefined input', () => {
		expect(extractOrgId(undefined)).toBeNull();
	});

	it('should return number directly', () => {
		expect(extractOrgId(123)).toBe(123);
	});

	it('should extract value from object', () => {
		expect(extractOrgId({ value: 456 })).toBe(456);
	});
});

describe('extractUserId', () => {
	it('should return null for null input', () => {
		expect(extractUserId(null)).toBeNull();
	});

	it('should return null for undefined input', () => {
		expect(extractUserId(undefined)).toBeNull();
	});

	it('should return number directly', () => {
		expect(extractUserId(123)).toBe(123);
	});

	it('should extract id from object', () => {
		expect(extractUserId({ id: 456, name: 'Test' })).toBe(456);
	});
});
