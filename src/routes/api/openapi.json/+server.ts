import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const openApiSpec = {
	openapi: '3.0.3',
	info: {
		title: 'Scoring API',
		description: 'Lead scoring service for persons and companies with TIC.io enrichment and Pipedrive integration.',
		version: '1.0.0',
		contact: {
			name: 'Daily Wins AB'
		}
	},
	servers: [
		{
			url: 'https://scoring-api.vercel.app',
			description: 'Production'
		},
		{
			url: 'http://localhost:5173',
			description: 'Development'
		}
	],
	tags: [
		{ name: 'Scoring', description: 'Calculate lead scores for persons and companies' },
		{ name: 'Persons', description: 'Person data with enrichment' }
	],
	paths: {
		'/api/score/person': {
			post: {
				tags: ['Scoring'],
				summary: 'Calculate score for a person/company',
				description: 'Calculate a combined lead score based on person attributes and company data.',
				operationId: 'scorePerson',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/ScorePersonRequest' },
							example: {
								person: {
									functions: ['CEO'],
									relationship_strength: 'We know each other',
									activities_90d: 5
								},
								company: {
									revenue: 50000000,
									cagr_3y: 0.15,
									industry: 'Tech',
									distance_km: 25
								}
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Scoring result',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/ScoringResult' }
							}
						}
					},
					'400': {
						description: 'Invalid request',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Error' }
							}
						}
					}
				}
			},
			get: {
				tags: ['Scoring'],
				summary: 'Calculate score via query parameters',
				description: 'Simple GET endpoint for testing scoring calculations.',
				operationId: 'scorePersonGet',
				parameters: [
					{ name: 'functions', in: 'query', schema: { type: 'string' }, description: 'Comma-separated roles (CEO,CFO)' },
					{ name: 'relationship', in: 'query', schema: { type: 'string' }, description: 'Relationship strength' },
					{ name: 'activities', in: 'query', schema: { type: 'integer' }, description: 'Activity count (90 days)' },
					{ name: 'revenue', in: 'query', schema: { type: 'number' }, description: 'Company revenue in SEK' },
					{ name: 'cagr', in: 'query', schema: { type: 'number' }, description: 'CAGR 3-year (0.15 = 15%)' },
					{ name: 'industry', in: 'query', schema: { type: 'string' }, description: 'Industry name' }
				],
				responses: {
					'200': {
						description: 'Scoring result',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/ScoringResult' }
							}
						}
					}
				}
			}
		},
		'/api/score/bulk': {
			post: {
				tags: ['Scoring'],
				summary: 'Bulk score multiple persons',
				description: 'Calculate scores for up to 1000 person/company combinations in a single request.',
				operationId: 'scoreBulk',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/BulkScoreRequest' },
							example: {
								items: [
									{
										id: 'lead-1',
										person: { functions: ['CEO'], activities_90d: 3 },
										company: { revenue: 100000000 }
									},
									{
										id: 'lead-2',
										person: { functions: ['Sales'], activities_90d: 10 },
										company: { revenue: 25000000, cagr_3y: 0.2 }
									}
								]
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Bulk scoring results with summary',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/BulkScoreResponse' }
							}
						}
					},
					'400': {
						description: 'Invalid request or too many items',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Error' }
							}
						}
					}
				}
			}
		},
		'/api/score/pipedrive': {
			post: {
				tags: ['Scoring'],
				summary: 'Score a Pipedrive person',
				description: 'Calculate lead score for a person in Pipedrive. Automatically enriches company data and detects person role. Updates the person record with tier and score.',
				operationId: 'scorePipedrive',
				security: [{ apiKey: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/ScorePipedriveRequest' },
							example: {
								person_id: 6361
							}
						}
					}
				},
				responses: {
					'200': {
						description: 'Scoring result',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/PipedriveScoringResponse' },
								example: {
									success: true,
									person_id: 6361,
									person_name: 'Johan Dahn',
									organization_name: 'Liseberg AB',
									tier: 'SILVER',
									score: 48,
									breakdown: {
										person_score: 47,
										company_score: 71,
										factors: {
											role_score: 75,
											relationship_score: 30,
											engagement_score: 25,
											revenue_score: 100,
											growth_score: 40,
											industry_score: 50,
											distance_score: 100,
											existing_score: 50
										}
									},
									engagement: {
										activities: 0,
										notes: 1,
										emails: 0,
										files: 0,
										total: 1
									},
									pipedrive_updated: true,
									warnings: []
								}
							}
						}
					},
					'401': {
						description: 'Invalid or missing API key',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Error' }
							}
						}
					},
					'404': {
						description: 'Person not found in Pipedrive',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Error' }
							}
						}
					}
				}
			},
			get: {
				tags: ['Scoring'],
				summary: 'Get endpoint documentation',
				description: 'Returns usage information for the scoring endpoint.',
				operationId: 'getScorePipedriveInfo',
				responses: {
					'200': {
						description: 'Endpoint documentation',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										endpoint: { type: 'string' },
										description: { type: 'string' },
										request: { type: 'object' },
										response: { type: 'object' },
										tiers: { type: 'object' }
									}
								}
							}
						}
					}
				}
			}
		},
		'/api/persons/{id}': {
			get: {
				tags: ['Persons'],
				summary: 'Get person with enrichment',
				description: 'Fetch person from Pipedrive with TIC.io company enrichment and Perplexity role lookup.',
				operationId: 'getPerson',
				parameters: [
					{
						name: 'id',
						in: 'path',
						required: true,
						schema: { type: 'integer' },
						description: 'Pipedrive person ID'
					}
				],
				responses: {
					'200': {
						description: 'Person with enriched data',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/PersonResponse' }
							}
						}
					},
					'404': {
						description: 'Person not found',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/Error' }
							}
						}
					}
				}
			}
		}
	},
	components: {
		securitySchemes: {
			apiKey: {
				type: 'apiKey',
				in: 'header',
				name: 'x-api-key',
				description: 'API key for authenticated endpoints'
			}
		},
		schemas: {
			PersonInput: {
				type: 'object',
				properties: {
					functions: {
						type: 'array',
						items: { type: 'string' },
						description: 'Roles/functions (CEO, CFO, COO, CTO, CMO, Sales, Marketing, Operations, Finance, HR, IT, Legal)',
						example: ['CEO']
					},
					relationship_strength: {
						type: 'string',
						enum: ['We know each other', "We've heard of each other", 'Weak', 'None'],
						description: 'Strength of relationship with the person'
					},
					activities_90d: {
						type: 'integer',
						description: 'Number of engagement activities in the last 90 days',
						example: 5
					}
				}
			},
			CompanyInput: {
				type: 'object',
				properties: {
					revenue: {
						type: 'number',
						description: 'Annual revenue in SEK',
						example: 50000000
					},
					cagr_3y: {
						type: 'number',
						description: '3-year compound annual growth rate (0.15 = 15%)',
						example: 0.15
					},
					industry: {
						type: 'string',
						description: 'Industry name',
						example: 'Tech'
					},
					distance_km: {
						type: 'number',
						description: 'Distance to Gothenburg in kilometers',
						example: 25
					},
					score: {
						type: 'number',
						description: 'Existing company score (0-100)',
						example: 75
					},
					employees: {
						type: 'integer',
						description: 'Number of employees',
						example: 150
					}
				}
			},
			ScoreBreakdown: {
				type: 'object',
				properties: {
					role_score: { type: 'number', description: 'Score based on role/function (0-100)' },
					relationship_score: { type: 'number', description: 'Score based on relationship strength (0-100)' },
					engagement_score: { type: 'number', description: 'Score based on recent activities (0-100)' },
					revenue_score: { type: 'number', description: 'Score based on company revenue (0-100)' },
					growth_score: { type: 'number', description: 'Score based on CAGR (0-100)' },
					industry_score: { type: 'number', description: 'Score based on industry fit (0-100)' },
					distance_score: { type: 'number', description: 'Score based on distance to Gothenburg (0-100)' },
					existing_score: { type: 'number', description: 'Existing company score (0-100)' }
				}
			},
			ScoringResult: {
				type: 'object',
				required: ['person_score', 'company_score', 'combined_score', 'tier', 'breakdown'],
				properties: {
					person_score: { type: 'number', description: 'Weighted person score (0-100)', example: 72 },
					company_score: { type: 'number', description: 'Weighted company score (0-100)', example: 68 },
					combined_score: { type: 'number', description: 'Final combined score (0-100)', example: 70 },
					tier: {
						type: 'string',
						enum: ['GOLD', 'SILVER', 'BRONZE'],
						description: 'Score tier (GOLD >= 70, SILVER 40-69, BRONZE < 40)',
						example: 'GOLD'
					},
					breakdown: { $ref: '#/components/schemas/ScoreBreakdown' },
					factors_used: {
						type: 'array',
						items: { type: 'string' },
						description: 'List of factors that had data available',
						example: ['functions', 'revenue', 'activities_90d']
					},
					warnings: {
						type: 'array',
						items: { type: 'string' },
						description: 'Warnings about missing data',
						example: ['No revenue data - using default score']
					}
				}
			},
			ScorePersonRequest: {
				type: 'object',
				required: ['person', 'company'],
				properties: {
					person: { $ref: '#/components/schemas/PersonInput' },
					company: { $ref: '#/components/schemas/CompanyInput' }
				}
			},
			BulkScoreRequest: {
				type: 'object',
				required: ['items'],
				properties: {
					items: {
						type: 'array',
						maxItems: 1000,
						items: {
							type: 'object',
							required: ['person', 'company'],
							properties: {
								id: { type: 'string', description: 'Optional identifier for the item' },
								person: { $ref: '#/components/schemas/PersonInput' },
								company: { $ref: '#/components/schemas/CompanyInput' }
							}
						}
					}
				}
			},
			BulkScoreResponse: {
				type: 'object',
				properties: {
					results: {
						type: 'array',
						items: {
							allOf: [
								{ $ref: '#/components/schemas/ScoringResult' },
								{
									type: 'object',
									properties: {
										id: { type: 'string', description: 'Item identifier if provided' }
									}
								}
							]
						}
					},
					summary: {
						type: 'object',
						properties: {
							total: { type: 'integer', description: 'Total items scored' },
							gold: { type: 'integer', description: 'Count of GOLD tier' },
							silver: { type: 'integer', description: 'Count of SILVER tier' },
							bronze: { type: 'integer', description: 'Count of BRONZE tier' },
							average_score: { type: 'number', description: 'Average combined score' }
						}
					}
				}
			},
			ScorePipedriveRequest: {
				type: 'object',
				required: ['person_id'],
				properties: {
					person_id: {
						type: 'integer',
						description: 'Pipedrive person ID',
						example: 6361
					}
				}
			},
			PipedriveScoringResponse: {
				type: 'object',
				required: ['success', 'person_id', 'tier', 'score'],
				properties: {
					success: { type: 'boolean', description: 'Whether the scoring was successful' },
					person_id: { type: 'integer', description: 'Pipedrive person ID' },
					person_name: { type: 'string', description: 'Person name from Pipedrive' },
					organization_name: { type: 'string', nullable: true, description: 'Organization name if linked' },
					tier: {
						type: 'string',
						enum: ['GOLD', 'SILVER', 'BRONZE'],
						description: 'Score tier (GOLD >= 70, SILVER 40-69, BRONZE < 40)'
					},
					score: { type: 'integer', description: 'Combined score (0-100)', minimum: 0, maximum: 100 },
					breakdown: {
						type: 'object',
						description: 'Score breakdown by component',
						properties: {
							person_score: { type: 'integer', description: 'Weighted person score (0-100)' },
							company_score: { type: 'integer', description: 'Weighted company score (0-100)' },
							factors: { $ref: '#/components/schemas/ScoreBreakdown' }
						}
					},
					engagement: {
						type: 'object',
						description: 'Engagement metrics for the last 90 days',
						properties: {
							activities: { type: 'integer', description: 'Number of activities' },
							notes: { type: 'integer', description: 'Number of notes' },
							emails: { type: 'integer', description: 'Number of email messages' },
							files: { type: 'integer', description: 'Number of files' },
							total: { type: 'integer', description: 'Total engagement count' }
						}
					},
					pipedrive_updated: { type: 'boolean', description: 'Whether Pipedrive was updated with tier/score' },
					warnings: {
						type: 'array',
						items: { type: 'string' },
						description: 'Warnings about missing data that affected scoring'
					}
				}
			},
			PersonResponse: {
				type: 'object',
				properties: {
					success: { type: 'boolean' },
					person: {
						type: 'object',
						description: 'Pipedrive person data'
					},
					organization: {
						type: 'object',
						nullable: true,
						description: 'Pipedrive organization data'
					},
					enrichedCompany: {
						type: 'object',
						nullable: true,
						description: 'TIC.io enriched company data',
						properties: {
							orgNumber: { type: 'string' },
							revenue: { type: 'number' },
							cagr3y: { type: 'number' },
							employees: { type: 'integer' },
							industry: { type: 'string' },
							distanceToGothenburg: { type: 'number' },
							dataSource: { type: 'string', enum: ['cache', 'tic', 'pipedrive'] }
						}
					},
					personRole: {
						type: 'object',
						nullable: true,
						description: 'Role from Perplexity web search',
						properties: {
							role: { type: 'string', description: 'Normalized role for scoring' },
							title: { type: 'string', description: 'Original title found' },
							confidence: { type: 'string', enum: ['high', 'medium', 'low', 'none'] }
						}
					},
					engagement: {
						type: 'object',
						description: 'Engagement metrics (last 90 days)',
						properties: {
							notes: { type: 'integer' },
							emails: { type: 'integer' },
							files: { type: 'integer' },
							total: { type: 'integer' }
						}
					},
					activityCount90d: { type: 'integer' }
				}
			},
			Error: {
				type: 'object',
				properties: {
					error: { type: 'string', description: 'Error message' },
					details: { type: 'string', description: 'Additional error details' }
				}
			}
		}
	}
};

export const GET: RequestHandler = async () => {
	return json(openApiSpec, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
