/**
 * Pipedrive API Client
 * Handles communication with Pipedrive API
 */

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
	done: boolean;
	add_time: string;
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

		try {
			const response = await fetch(url, {
				...options,
				headers: {
					...options.headers,
					'x-api-token': this.apiToken,
					'Content-Type': 'application/json'
				}
			});

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
			return {
				success: false,
				data: null,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
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
}
