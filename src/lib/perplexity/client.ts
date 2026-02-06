/**
 * Perplexity API Client
 *
 * Uses Perplexity's Sonar model for web search to find person information.
 * Includes retry logic for reliability.
 */

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

// Rate limiting for Tier 0: 1 QPS, 50 requests/min
// We use conservative limits to avoid 429 errors
const MIN_REQUEST_INTERVAL_MS = 1200; // Slightly over 1 second to be safe
let lastRequestTime = 0;

export interface PerplexityConfig {
	apiKey: string;
	maxRetries?: number;
}

export interface PersonRoleResult {
	role?: string;
	title?: string;
	confidence: 'high' | 'medium' | 'low' | 'none';
	source?: string;
}

export interface CompanyCityResult {
	city?: string;
	confidence: 'high' | 'medium' | 'low' | 'none';
	source?: string;
}

export interface CompanyInfoResult {
	orgNumber?: string;
	city?: string;
	industry?: string;
	confidence: 'high' | 'medium' | 'low' | 'none';
	source?: string;
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeoutMs: number
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal
		});
		return response;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for rate limit before making a request
 * Ensures minimum interval between requests (Tier 0: 1 QPS)
 */
async function waitForRateLimit(): Promise<void> {
	const now = Date.now();
	const timeSinceLastRequest = now - lastRequestTime;

	if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
		const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
		await sleep(waitTime);
	}

	lastRequestTime = Date.now();
}

export class PerplexityClient {
	private apiKey: string;
	private maxRetries: number;

	constructor(config: PerplexityConfig) {
		this.apiKey = config.apiKey;
		this.maxRetries = config.maxRetries ?? MAX_RETRIES;
	}

	/**
	 * Find a person's role/title at a company using web search
	 * Includes retry logic for reliability
	 */
	async findPersonRole(
		personName: string,
		companyName?: string,
		email?: string
	): Promise<PersonRoleResult> {
		// Build search query with email for better precision
		let query = `"${personName}"`;
		if (email) {
			query += ` "${email}"`;
		} else if (companyName) {
			query += ` "${companyName}"`;
		}
		query += ' titel roll position';

		let lastError: string | null = null;

		for (let attempt = 0; attempt < this.maxRetries; attempt++) {
			try {
				// Wait for rate limit before making request
				await waitForRateLimit();

				const response = await fetchWithTimeout(
					PERPLEXITY_API_URL,
					{
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${this.apiKey}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							model: 'sonar-pro',
							messages: [
								{
									role: 'user',
									content: query
								}
							],
							max_tokens: 150,
							temperature: 0.2
						})
					},
					REQUEST_TIMEOUT_MS
				);

				if (!response.ok) {
					lastError = `API error: ${response.status} ${response.statusText}`;
					// Retry on 5xx errors or rate limiting
					if (response.status >= 500 || response.status === 429) {
						const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
						console.warn(`[Perplexity] ${lastError}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
						await sleep(delay);
						continue;
					}
					// Don't retry on client errors (4xx except 429)
					console.error('[Perplexity] API error:', response.status, response.statusText);
					return { confidence: 'none' };
				}

				const data = await response.json();
				let answer = data.choices?.[0]?.message?.content?.trim();

				// Successfully got a response - process it
				return this.processResponse(answer, personName);

			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') {
					lastError = 'Request timeout';
				} else {
					lastError = error instanceof Error ? error.message : 'Unknown error';
				}

				// Retry on network errors
				if (attempt < this.maxRetries - 1) {
					const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
					console.warn(`[Perplexity] ${lastError}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
					await sleep(delay);
				}
			}
		}

		// All retries failed
		console.error(`[Perplexity] All ${this.maxRetries} attempts failed. Last error: ${lastError}`);
		return { confidence: 'none' };
	}

	/**
	 * Find the city where a company is located using web search.
	 * Used as fallback when no address exists in Pipedrive.
	 */
	async findCompanyCity(companyName: string): Promise<CompanyCityResult> {
		const query = `What city in Sweden is the headquarters or main office of "${companyName}" located in? Reply with only the city name, nothing else.`;

		let lastError: string | null = null;

		for (let attempt = 0; attempt < this.maxRetries; attempt++) {
			try {
				await waitForRateLimit();

				const response = await fetchWithTimeout(
					PERPLEXITY_API_URL,
					{
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${this.apiKey}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							model: 'sonar-pro',
							messages: [
								{
									role: 'user',
									content: query
								}
							],
							max_tokens: 50,
							temperature: 0.1
						})
					},
					REQUEST_TIMEOUT_MS
				);

				if (!response.ok) {
					lastError = `API error: ${response.status} ${response.statusText}`;
					if (response.status >= 500 || response.status === 429) {
						const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
						console.warn(`[Perplexity] City lookup ${lastError}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
						await sleep(delay);
						continue;
					}
					console.error('[Perplexity] City lookup API error:', response.status, response.statusText);
					return { confidence: 'none' };
				}

				const data = await response.json();
				const answer = data.choices?.[0]?.message?.content?.trim();

				return this.processCityResponse(answer);

			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') {
					lastError = 'Request timeout';
				} else {
					lastError = error instanceof Error ? error.message : 'Unknown error';
				}

				if (attempt < this.maxRetries - 1) {
					const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
					console.warn(`[Perplexity] City lookup ${lastError}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
					await sleep(delay);
				}
			}
		}

		console.error(`[Perplexity] All ${this.maxRetries} attempts failed for city lookup. Last error: ${lastError}`);
		return { confidence: 'none' };
	}

	/**
	 * Find company info (org number, city, industry) in a single API call.
	 * Used during pre-scoring to fill in missing data before TIC enrichment.
	 */
	async findCompanyInfo(companyName: string): Promise<CompanyInfoResult> {
		const query = `For the Swedish company "${companyName}":\n1. What is their Swedish organization number (organisationsnummer)?\n2. What city is their headquarters in?\n3. What is their main industry or business area?\nReply briefly in this exact format:\nOrg: [XXXXXX-XXXX]\nCity: [city name]\nIndustry: [description]`;

		let lastError: string | null = null;

		for (let attempt = 0; attempt < this.maxRetries; attempt++) {
			try {
				await waitForRateLimit();

				const response = await fetchWithTimeout(
					PERPLEXITY_API_URL,
					{
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${this.apiKey}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							model: 'sonar-pro',
							messages: [
								{
									role: 'user',
									content: query
								}
							],
							max_tokens: 150,
							temperature: 0.1
						})
					},
					REQUEST_TIMEOUT_MS
				);

				if (!response.ok) {
					lastError = `API error: ${response.status} ${response.statusText}`;
					if (response.status >= 500 || response.status === 429) {
						const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
						console.warn(`[Perplexity] Company info ${lastError}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
						await sleep(delay);
						continue;
					}
					console.error('[Perplexity] Company info API error:', response.status, response.statusText);
					return { confidence: 'none' };
				}

				const data = await response.json();
				const answer = data.choices?.[0]?.message?.content?.trim();

				return this.processCompanyInfoResponse(answer);

			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') {
					lastError = 'Request timeout';
				} else {
					lastError = error instanceof Error ? error.message : 'Unknown error';
				}

				if (attempt < this.maxRetries - 1) {
					const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
					console.warn(`[Perplexity] Company info ${lastError}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
					await sleep(delay);
				}
			}
		}

		console.error(`[Perplexity] All ${this.maxRetries} attempts failed for company info. Last error: ${lastError}`);
		return { confidence: 'none' };
	}

	/**
	 * Validate Swedish org number or personnummer using Luhn algorithm.
	 * Works for both organisationsnummer (digits 3-4 >= 20) and
	 * enskild firma personnummer (digits 3-4 = 01-12).
	 * Input must be exactly 10 digits (no dash).
	 */
	private static validateSwedishOrgNumber(digits: string): boolean {
		if (!/^\d{10}$/.test(digits)) return false;

		// Luhn check digit validation
		let sum = 0;
		for (let i = 0; i < 10; i++) {
			let digit = parseInt(digits[i], 10);
			// Multiply every other digit by 2, starting from position 0
			if (i % 2 === 0) {
				digit *= 2;
				if (digit > 9) digit -= 9;
			}
			sum += digit;
		}

		return sum % 10 === 0;
	}

	/**
	 * Parse structured company info from Perplexity response
	 */
	private processCompanyInfoResponse(answer: string | undefined): CompanyInfoResult {
		if (!answer) {
			return { confidence: 'none' };
		}

		// Clean up markdown
		const cleaned = answer
			.replace(/\*\*/g, '')
			.replace(/\[[\d,]+\]/g, '')
			.trim();

		const result: CompanyInfoResult = {
			confidence: 'none',
			source: 'perplexity'
		};

		let fieldsFound = 0;

		// Extract org number - supports multiple formats:
		// - XXXXXX-XXXX (standard organisationsnummer)
		// - YYMMDD-XXXX (enskild firma / personnummer)
		// - YYYYMMDD-XXXX (personnummer with century, we strip first 2 digits)
		// - 10 or 12 consecutive digits
		const orgMatch = cleaned.match(
			/(?:Org|Organisation|Organisationsnummer|Personnummer)[:\s]*((?:\d{2})?\d{6}[-\s]?\d{4})/i
		);
		if (orgMatch) {
			let raw = orgMatch[1].replace(/[-\s]/g, '');
			// Strip century prefix if 12 digits (e.g. 197812150123 -> 7812150123)
			if (raw.length === 12) {
				raw = raw.slice(2);
			}
			if (raw.length === 10 && PerplexityClient.validateSwedishOrgNumber(raw)) {
				result.orgNumber = raw.slice(0, 6) + '-' + raw.slice(6);
				fieldsFound++;
			}
		}

		// Extract city
		const cityMatch = cleaned.match(/City[:\s]*([^\n,]+)/i);
		if (cityMatch) {
			const city = cityMatch[1].trim().replace(/[.!?]+$/, '');
			if (city.length >= 2 && city.length <= 40) {
				result.city = city;
				fieldsFound++;
			}
		}

		// Extract industry
		const industryMatch = cleaned.match(/Industry[:\s]*([^\n]+)/i);
		if (industryMatch) {
			const industry = industryMatch[1].trim().replace(/[.!?]+$/, '');
			if (industry.length >= 2 && industry.length <= 100) {
				result.industry = industry;
				fieldsFound++;
			}
		}

		if (fieldsFound >= 2) {
			result.confidence = 'medium';
		} else if (fieldsFound === 1) {
			result.confidence = 'low';
		}

		return result;
	}

	/**
	 * Parse city name from Perplexity response
	 */
	private processCityResponse(answer: string | undefined): CompanyCityResult {
		if (!answer) {
			return { confidence: 'none' };
		}

		// Clean up response
		let cleaned = answer
			.replace(/\*\*/g, '')
			.replace(/\[[\d,]+\]/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		const lower = cleaned.toLowerCase();
		if (lower.includes('cannot') || lower.includes('unknown') ||
			lower.includes('not found') || lower.includes('no information') ||
			lower.includes('ingen information') || lower.includes('unclear')) {
			return { confidence: 'none' };
		}

		// Remove trailing punctuation and take first line
		cleaned = cleaned.replace(/[.!?]+$/, '').trim();
		cleaned = cleaned.split('\n')[0].trim();

		if (cleaned.length > 50) {
			return { confidence: 'none' };
		}

		// Remove country suffix: "Stockholm, Sweden" -> "Stockholm"
		const city = cleaned.split(',')[0].split(' - ')[0].trim();

		if (!city || city.length < 2 || city.length > 40) {
			return { confidence: 'none' };
		}

		return {
			city,
			confidence: city.length <= 20 ? 'medium' : 'low',
			source: 'perplexity'
		};
	}

	/**
	 * Process the API response and extract role information
	 */
	private processResponse(answer: string | undefined, personName: string): PersonRoleResult {
		if (!answer || answer.toLowerCase().includes('cannot find') || answer.toLowerCase().includes('unknown') || answer.toLowerCase().includes('ingen information')) {
			return { confidence: 'none' };
		}

		// Clean up markdown formatting and citation references
		answer = answer
			.replace(/\*\*/g, '')           // Remove bold markdown
			.replace(/\[[\d,]+\]/g, '')     // Remove citation references like [1] or [1,2]
			.replace(/\s+/g, ' ')           // Normalize whitespace
			.trim();

		// If the answer is short (< 80 chars), it's likely just the title
		let title: string | null = null;
		if (answer.length < 80 && !answer.includes('.')) {
			title = answer;
		} else {
			// Try to extract job title from longer response
			title = this.extractTitle(answer, personName);
		}

		if (!title) {
			return { confidence: 'none' };
		}

		// Parse the response and determine confidence
		const normalizedRole = this.normalizeRole(title);
		const confidence = this.assessConfidence(title, normalizedRole);

		return {
			role: normalizedRole,
			title: title,
			confidence,
			source: 'perplexity'
		};
	}

	/**
	 * Extract job title from a natural language response
	 */
	private extractTitle(response: string, personName: string): string | null {
		const firstName = personName.split(' ')[0];

		// Pattern: "holds the title of X at Y" or "holds the title of X"
		const holdsTitleMatch = response.match(/holds\s+the\s+title\s+of\s+\*?\*?([^*.\n]+?)(?:\s+at\s+|\*\*|\.|$)/i);
		if (holdsTitleMatch) {
			const title = holdsTitleMatch[1].trim();
			if (title.length < 80) {
				return title;
			}
		}

		// Pattern: "**CEO at X**" or "**VD/CEO**" etc (bold titles with context)
		const boldTitleAtMatch = response.match(/\*\*([A-ZÅÄÖ][^*]+?)(?:\s+at\s+|\*\*)/i);
		if (boldTitleAtMatch) {
			const title = boldTitleAtMatch[1].trim();
			if (title.length < 60) {
				return title;
			}
		}

		// Pattern: "title is **X**" or "titel är **X**"
		const titleIsMatch = response.match(/(?:title|titel)\s+(?:is|är)\s+\*?\*?([^*.\n]+)/i);
		if (titleIsMatch) {
			return titleIsMatch[1].trim();
		}

		// Pattern: "X är [TITLE] på/hos/i Y" - capture everything between "är" and location preposition
		const isPattern1 = response.match(new RegExp(`(?:${personName}|${firstName})(?:'s)?\\s+(?:current\\s+)?(?:LinkedIn\\s+)?(?:title|titel)?\\s*(?:is|är)\\s*\\*?\\*?([^*.]+?)(?:\\*|\\s+(?:at|på|hos|i|vid)\\s+)`, 'i'));
		if (isPattern1) {
			const title = isPattern1[1].trim();
			if (title.length < 60 && !title.includes('affärsman')) {
				return title;
			}
		}

		// Pattern: "listed as **X**" or "as the **X**"
		const listedAsMatch = response.match(/(?:listed\s+(?:on\s+\w+\s+)?as|as\s+the)\s+\*?\*?([^*.\n]+)/i);
		if (listedAsMatch) {
			return listedAsMatch[1].trim();
		}

		// Pattern: "Områdeschef X" or "VD" or "CEO" directly
		const directTitleMatch = response.match(/((?:områdes|avdelnings|ekonomi|teknik|fastighets|it|personal|marknads|försäljnings)?chef\s*[A-ZÅÄÖa-zåäö]*|styrelseordförande|vd|ceo|cfo|cto|coo|cmo)/i);
		if (directTitleMatch) {
			return directTitleMatch[1].trim();
		}

		return null;
	}

	/**
	 * Normalize role to standard categories for scoring
	 */
	private normalizeRole(title: string): string {
		const lower = title.toLowerCase();

		// C-level executives
		if (lower.includes('ceo') || lower.includes('chief executive') || lower.includes('vd') || lower.includes('verkst')) {
			return 'CEO';
		}
		if (lower.includes('cfo') || lower.includes('chief financial') || lower.includes('ekonomichef') || lower.includes('finanschef')) {
			return 'CFO';
		}
		if (lower.includes('coo') || lower.includes('chief operating') || lower.includes('driftchef')) {
			return 'COO';
		}
		if (lower.includes('cto') || lower.includes('chief technology') || lower.includes('teknikchef')) {
			return 'CTO';
		}
		if (lower.includes('cmo') || lower.includes('chief marketing') || lower.includes('marknadschef')) {
			return 'CMO';
		}
		if (lower.includes('cio') || lower.includes('chief information') || lower.includes('it-chef') || lower.includes('it chef')) {
			return 'CTO'; // Map CIO to CTO for scoring purposes
		}

		// Directors, VPs, and Area Managers (Områdeschef)
		if (lower.includes('director') || lower.includes('direktör') || lower.includes('vp') || lower.includes('vice president') || lower.includes('områdeschef') || lower.includes('avdelningschef')) {
			if (lower.includes('sales') || lower.includes('försäljning')) return 'Sales';
			if (lower.includes('marketing') || lower.includes('marknads')) return 'Marketing';
			if (lower.includes('operation') || lower.includes('drift')) return 'Operations';
			if (lower.includes('finance') || lower.includes('ekonomi') || lower.includes('finans')) return 'Finance';
			if (lower.includes('hr') || lower.includes('human') || lower.includes('personal')) return 'HR';
			if (lower.includes('it') || lower.includes('tech') || lower.includes('teknik') || lower.includes('fastighet')) return 'Operations';
			return 'Operations'; // Default for unspecified directors/managers
		}

		// Department heads and managers
		if (lower.includes('sales') || lower.includes('försäljning') || lower.includes('account')) {
			return 'Sales';
		}
		if (lower.includes('marketing') || lower.includes('marknads') || lower.includes('kommunikation')) {
			return 'Marketing';
		}
		if (lower.includes('operation') || lower.includes('drift') || lower.includes('produktion') || lower.includes('fastighet')) {
			return 'Operations';
		}
		if (lower.includes('finance') || lower.includes('ekonomi') || lower.includes('finans') || lower.includes('controller')) {
			return 'Finance';
		}
		if (lower.includes('hr') || lower.includes('human') || lower.includes('personal') || lower.includes('rekrytering')) {
			return 'HR';
		}
		if (lower.includes('it') || lower.includes('tech') || lower.includes('developer') || lower.includes('engineer') || lower.includes('utveckl') || lower.includes('architect') || lower.includes('arkitekt')) {
			return 'IT';
		}
		if (lower.includes('legal') || lower.includes('juridik') || lower.includes('jurist')) {
			return 'Legal';
		}

		// Founders and owners
		if (lower.includes('founder') || lower.includes('grundare') || lower.includes('owner') || lower.includes('ägare')) {
			return 'CEO'; // Treat founders as CEO-equivalent for scoring
		}

		return title; // Return original if no match
	}

	/**
	 * Assess confidence in the result
	 */
	private assessConfidence(originalAnswer: string, normalizedRole: string): 'high' | 'medium' | 'low' {
		// High confidence if we could normalize to a known category
		const knownRoles = ['CEO', 'CFO', 'COO', 'CTO', 'CMO', 'Sales', 'Marketing', 'Operations', 'Finance', 'HR', 'IT', 'Legal'];
		if (knownRoles.includes(normalizedRole)) {
			return 'high';
		}

		// Medium confidence if the answer is short and specific
		if (originalAnswer.length < 50 && !originalAnswer.includes('?')) {
			return 'medium';
		}

		return 'low';
	}
}
