/**
 * Perplexity API Client
 *
 * Uses Perplexity's Sonar model for web search to find person information.
 */

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

export interface PerplexityConfig {
	apiKey: string;
}

export interface PersonRoleResult {
	role?: string;
	title?: string;
	confidence: 'high' | 'medium' | 'low' | 'none';
	source?: string;
}

export class PerplexityClient {
	private apiKey: string;

	constructor(config: PerplexityConfig) {
		this.apiKey = config.apiKey;
	}

	/**
	 * Find a person's role/title at a company using web search
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

		try {
			const response = await fetch(PERPLEXITY_API_URL, {
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
					max_tokens: 100,
					temperature: 0.2,
					web_search_options: {
						search_domain_filter: ['linkedin.com', 'theorg.com', 'rocketreach.co']
					}
				})
			});

			if (!response.ok) {
				console.error('Perplexity API error:', response.status, response.statusText);
				return { confidence: 'none' };
			}

			const data = await response.json();
			let answer = data.choices?.[0]?.message?.content?.trim();

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

		} catch (error) {
			console.error('Perplexity API request failed:', error);
			return { confidence: 'none' };
		}
	}

	/**
	 * Extract job title from a natural language response
	 */
	private extractTitle(response: string, personName: string): string | null {
		const firstName = personName.split(' ')[0];

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
		if (lower.includes('it') || lower.includes('tech') || lower.includes('developer') || lower.includes('engineer') || lower.includes('utveckl')) {
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
