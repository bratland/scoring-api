/**
 * Pipedrive API Client
 * Handles communication with Pipedrive API with rate limiting
 */

import {
	waitForRateLimit,
	updateRateLimitFromHeaders,
	handleRateLimitError
} from './rateLimiter';

const MAX_RETRIES = 3;

export interface PipedriveConfig {
	apiToken: string;
	domain?: string; // Optional custom domain
}

export interface PipedrivePerson {
	id: number;
	name: string;
	org_id?: number | { value: number; name?: string } | null;
	owner_id?: number | { id: number; name?: string } | null;
	// Custom fields will be dynamic
	[key: string]: unknown;
}

export interface PipedriveOrganization {
	id: number;
	name: string;
	// Custom fields will be dynamic
	[key: string]: unknown;
}

export interface PipedriveActivity {
	id: number;
	person_id?: number;
	user_id?: number | { id: number; name?: string } | null;
	type: string;
	done: boolean;
	add_time: string;
}

export interface PipedriveNote {
	id: number;
	content: string;
	add_time: string;
	person_id?: number;
	org_id?: number;
}

export interface PipedriveMailMessage {
	id: number;
	subject: string;
	message_time: string;
	from: Array<{ email_address: string; name?: string }>;
	to: Array<{ email_address: string; name?: string }>;
}

export interface PipedriveFile {
	id: number;
	name: string;
	add_time: string;
	person_id?: number;
}

export interface PipedriveUser {
	id: number;
	name: string;
	email: string;
}

interface PipedriveApiResponse<T> {
	success: boolean;
	data: T | null;
	additional_data?: {
		pagination?: {
			more_items_in_collection?: boolean;
			next_start?: number;
		};
	};
	error?: string;
}

interface PipedriveResponse<T> {
	success: boolean;
	data: T | null;
	error?: string;
}

export function extractOrgId(field: number | { value: number } | null | undefined): number | null {
	if (field === null || field === undefined) return null;
	if (typeof field === 'number') return field;
	if (typeof field === 'object' && 'value' in field) return field.value;
	return null;
}

export class PipedriveClient {
	private apiToken: string;
	private baseUrl: string;

	constructor(config: PipedriveConfig) {
		this.apiToken = config.apiToken;
		this.baseUrl = config.domain
			? `https://${config.domain}.pipedrive.com/v1`
			: 'https://api.pipedrive.com/v1';
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit = {}
	): Promise<PipedriveResponse<T>> {
		const url = `${this.baseUrl}${endpoint}`;
		let lastError: string = 'Unknown error';

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				// Wait for rate limit before making request
				await waitForRateLimit();

				const response = await fetch(url, {
					...options,
					headers: {
						...options.headers,
						'x-api-token': this.apiToken,
						'Content-Type': 'application/json'
					}
				});

				// Update rate limit state from response headers
				updateRateLimitFromHeaders(response.headers);

				// Handle rate limiting (429)
				if (response.status === 429) {
					await handleRateLimitError();
					continue;
				}

				const data = await response.json();

				if (!response.ok || !data.success) {
					return {
						success: false,
						data: null,
						error: data.error || `HTTP ${response.status}`
					};
				}

				return { success: true, data: data.data };
			} catch (error) {
				lastError = error instanceof Error ? error.message : 'Unknown error';
				console.error(`[PipedriveClient] Request failed (attempt ${attempt + 1}):`, error);
				// Exponential backoff on network errors
				await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
			}
		}

		return {
			success: false,
			data: null,
			error: lastError
		};
	}

	/**
	 * Request that preserves pagination info for paginated endpoints
	 */
	private async requestPaginated<T>(
		endpoint: string
	): Promise<PipedriveApiResponse<T[]>> {
		let lastError: string = 'Unknown error';

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				await waitForRateLimit();

				const response = await fetch(`${this.baseUrl}${endpoint}`, {
					headers: {
						'x-api-token': this.apiToken,
						'Content-Type': 'application/json'
					}
				});

				updateRateLimitFromHeaders(response.headers);

				if (response.status === 429) {
					await handleRateLimitError();
					continue;
				}

				const data: PipedriveApiResponse<T[]> = await response.json();
				return data;
			} catch (error) {
				lastError = error instanceof Error ? error.message : 'Unknown error';
				console.error(`[PipedriveClient] Request failed (attempt ${attempt + 1}):`, error);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
			}
		}

		return {
			success: false,
			data: null,
			error: lastError
		};
	}

	async getPerson(personId: number): Promise<PipedriveResponse<PipedrivePerson>> {
		return this.request<PipedrivePerson>(`/persons/${personId}`);
	}

	async getOrganization(orgId: number): Promise<PipedriveResponse<PipedriveOrganization>> {
		return this.request<PipedriveOrganization>(`/organizations/${orgId}`);
	}

	async getPersonActivities(
		personId: number,
		daysBack: number = 90
	): Promise<PipedriveResponse<PipedriveActivity[]>> {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - daysBack);
		const startDateStr = startDate.toISOString().split('T')[0];

		return this.request<PipedriveActivity[]>(
			`/persons/${personId}/activities?start_date=${startDateStr}&limit=500`
		);
	}

	async getPersonNotes(personId: number): Promise<PipedriveResponse<PipedriveNote[]>> {
		return this.request<PipedriveNote[]>(`/persons/${personId}/notes?limit=500`);
	}

	async getPersonMailMessages(personId: number): Promise<PipedriveResponse<PipedriveMailMessage[]>> {
		return this.request<PipedriveMailMessage[]>(`/persons/${personId}/mailMessages?limit=500`);
	}

	async getPersonFiles(personId: number): Promise<PipedriveResponse<PipedriveFile[]>> {
		return this.request<PipedriveFile[]>(`/persons/${personId}/files?limit=500`);
	}

	async updatePerson(
		personId: number,
		updates: Record<string, unknown>
	): Promise<PipedriveResponse<PipedrivePerson>> {
		return this.request<PipedrivePerson>(`/persons/${personId}`, {
			method: 'PUT',
			body: JSON.stringify(updates)
		});
	}

	async getPersonFields(): Promise<PipedriveResponse<Array<{
		id: number;
		key: string;
		name: string;
		field_type: string;
		options?: Array<{ id: number; label: string }>;
	}>>> {
		return this.request(`/personFields`);
	}

	async getOrganizationFields(): Promise<PipedriveResponse<Array<{
		id: number;
		key: string;
		name: string;
		field_type: string;
	}>>> {
		return this.request(`/organizationFields`);
	}

	async updateOrganization(
		orgId: number,
		updates: Record<string, unknown>
	): Promise<PipedriveResponse<PipedriveOrganization>> {
		return this.request<PipedriveOrganization>(`/organizations/${orgId}`, {
			method: 'PUT',
			body: JSON.stringify(updates)
		});
	}

	async createOrganizationField(
		name: string,
		fieldType: string = 'varchar'
	): Promise<PipedriveResponse<{ id: number; key: string; name: string }>> {
		return this.request(`/organizationFields`, {
			method: 'POST',
			body: JSON.stringify({ name, field_type: fieldType })
		});
	}

	async createPersonField(
		name: string,
		fieldType: string = 'double'
	): Promise<PipedriveResponse<{ id: number; key: string; name: string }>> {
		return this.request(`/personFields`, {
			method: 'POST',
			body: JSON.stringify({ name, field_type: fieldType })
		});
	}

	async getUsers(): Promise<PipedriveResponse<PipedriveUser[]>> {
		return this.request<PipedriveUser[]>('/users');
	}

	async getAllActivities(): Promise<PipedriveActivity[]> {
		const items: PipedriveActivity[] = [];
		let start = 0;
		const limit = 500;

		while (true) {
			const result = await this.requestPaginated<PipedriveActivity>(
				`/activities?limit=${limit}&start=${start}&user_id=0`
			);

			if (!result.success || !result.data) {
				break;
			}

			items.push(...result.data);

			if (!result.additional_data?.pagination?.more_items_in_collection) {
				break;
			}

			start = result.additional_data.pagination.next_start ?? start + limit;
		}

		return items;
	}

	async getAllPersons(): Promise<PipedrivePerson[]> {
		const items: PipedrivePerson[] = [];
		let start = 0;
		const limit = 500;

		while (true) {
			const result = await this.requestPaginated<PipedrivePerson>(
				`/persons?limit=${limit}&start=${start}`
			);

			if (!result.success || !result.data) {
				break;
			}

			items.push(...result.data);

			if (!result.additional_data?.pagination?.more_items_in_collection) {
				break;
			}

			start = result.additional_data.pagination.next_start ?? start + limit;
		}

		return items;
	}

	async getAllOrganizations(): Promise<PipedriveOrganization[]> {
		const items: PipedriveOrganization[] = [];
		let start = 0;
		const limit = 500;

		while (true) {
			const result = await this.requestPaginated<PipedriveOrganization>(
				`/organizations?limit=${limit}&start=${start}`
			);

			if (!result.success || !result.data) {
				break;
			}

			items.push(...result.data);

			if (!result.additional_data?.pagination?.more_items_in_collection) {
				break;
			}

			start = result.additional_data.pagination.next_start ?? start + limit;
		}

		return items;
	}
}

export function extractUserId(
	field: number | { id: number; name?: string } | null | undefined
): number | null {
	if (field === null || field === undefined) return null;
	if (typeof field === 'number') return field;
	if (typeof field === 'object' && 'id' in field) return field.id;
	return null;
}
