/**
 * OpenStreetMap Nominatim Geocoding Client
 *
 * Free geocoding service - but heavily rate-limited (1 req/sec)
 * ALWAYS cache results to avoid hitting rate limits
 *
 * Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
 */

export interface GeocodingResult {
	latitude: number;
	longitude: number;
	displayName: string;
	city?: string;
	country?: string;
	fetchedAt: string;
}

export interface GeocodingCache {
	[cityKey: string]: GeocodingResult;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'ScoringAPI/1.0 (contact@example.com)'; // Required by Nominatim policy

// In-memory cache for geocoding results (persists during runtime)
const geocodingCache: GeocodingCache = {};

// Pre-populated cache for common Swedish cities
const SWEDISH_CITIES_CACHE: GeocodingCache = {
	'göteborg': { latitude: 57.7089, longitude: 11.9746, displayName: 'Göteborg', city: 'Göteborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'gothenburg': { latitude: 57.7089, longitude: 11.9746, displayName: 'Göteborg', city: 'Göteborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'stockholm': { latitude: 59.3293, longitude: 18.0686, displayName: 'Stockholm', city: 'Stockholm', country: 'Sweden', fetchedAt: '2024-01-01' },
	'malmö': { latitude: 55.6050, longitude: 13.0038, displayName: 'Malmö', city: 'Malmö', country: 'Sweden', fetchedAt: '2024-01-01' },
	'malmo': { latitude: 55.6050, longitude: 13.0038, displayName: 'Malmö', city: 'Malmö', country: 'Sweden', fetchedAt: '2024-01-01' },
	'uppsala': { latitude: 59.8586, longitude: 17.6389, displayName: 'Uppsala', city: 'Uppsala', country: 'Sweden', fetchedAt: '2024-01-01' },
	'linköping': { latitude: 58.4108, longitude: 15.6214, displayName: 'Linköping', city: 'Linköping', country: 'Sweden', fetchedAt: '2024-01-01' },
	'linkoping': { latitude: 58.4108, longitude: 15.6214, displayName: 'Linköping', city: 'Linköping', country: 'Sweden', fetchedAt: '2024-01-01' },
	'västerås': { latitude: 59.6099, longitude: 16.5448, displayName: 'Västerås', city: 'Västerås', country: 'Sweden', fetchedAt: '2024-01-01' },
	'vasteras': { latitude: 59.6099, longitude: 16.5448, displayName: 'Västerås', city: 'Västerås', country: 'Sweden', fetchedAt: '2024-01-01' },
	'örebro': { latitude: 59.2753, longitude: 15.2134, displayName: 'Örebro', city: 'Örebro', country: 'Sweden', fetchedAt: '2024-01-01' },
	'orebro': { latitude: 59.2753, longitude: 15.2134, displayName: 'Örebro', city: 'Örebro', country: 'Sweden', fetchedAt: '2024-01-01' },
	'norrköping': { latitude: 58.5942, longitude: 16.1826, displayName: 'Norrköping', city: 'Norrköping', country: 'Sweden', fetchedAt: '2024-01-01' },
	'norrkoping': { latitude: 58.5942, longitude: 16.1826, displayName: 'Norrköping', city: 'Norrköping', country: 'Sweden', fetchedAt: '2024-01-01' },
	'helsingborg': { latitude: 56.0465, longitude: 12.6945, displayName: 'Helsingborg', city: 'Helsingborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'jönköping': { latitude: 57.7826, longitude: 14.1618, displayName: 'Jönköping', city: 'Jönköping', country: 'Sweden', fetchedAt: '2024-01-01' },
	'jonkoping': { latitude: 57.7826, longitude: 14.1618, displayName: 'Jönköping', city: 'Jönköping', country: 'Sweden', fetchedAt: '2024-01-01' },
	'umeå': { latitude: 63.8258, longitude: 20.2630, displayName: 'Umeå', city: 'Umeå', country: 'Sweden', fetchedAt: '2024-01-01' },
	'umea': { latitude: 63.8258, longitude: 20.2630, displayName: 'Umeå', city: 'Umeå', country: 'Sweden', fetchedAt: '2024-01-01' },
	'lund': { latitude: 55.7047, longitude: 13.1910, displayName: 'Lund', city: 'Lund', country: 'Sweden', fetchedAt: '2024-01-01' },
	'borås': { latitude: 57.7210, longitude: 12.9401, displayName: 'Borås', city: 'Borås', country: 'Sweden', fetchedAt: '2024-01-01' },
	'boras': { latitude: 57.7210, longitude: 12.9401, displayName: 'Borås', city: 'Borås', country: 'Sweden', fetchedAt: '2024-01-01' },
	'sundsvall': { latitude: 62.3908, longitude: 17.3069, displayName: 'Sundsvall', city: 'Sundsvall', country: 'Sweden', fetchedAt: '2024-01-01' },
	'gävle': { latitude: 60.6749, longitude: 17.1413, displayName: 'Gävle', city: 'Gävle', country: 'Sweden', fetchedAt: '2024-01-01' },
	'gavle': { latitude: 60.6749, longitude: 17.1413, displayName: 'Gävle', city: 'Gävle', country: 'Sweden', fetchedAt: '2024-01-01' },
	'trollhättan': { latitude: 58.2837, longitude: 12.2886, displayName: 'Trollhättan', city: 'Trollhättan', country: 'Sweden', fetchedAt: '2024-01-01' },
	'trollhattan': { latitude: 58.2837, longitude: 12.2886, displayName: 'Trollhättan', city: 'Trollhättan', country: 'Sweden', fetchedAt: '2024-01-01' },
	'eskilstuna': { latitude: 59.3666, longitude: 16.5077, displayName: 'Eskilstuna', city: 'Eskilstuna', country: 'Sweden', fetchedAt: '2024-01-01' },
	'karlstad': { latitude: 59.3793, longitude: 13.5036, displayName: 'Karlstad', city: 'Karlstad', country: 'Sweden', fetchedAt: '2024-01-01' },
	'växjö': { latitude: 56.8777, longitude: 14.8091, displayName: 'Växjö', city: 'Växjö', country: 'Sweden', fetchedAt: '2024-01-01' },
	'vaxjo': { latitude: 56.8777, longitude: 14.8091, displayName: 'Växjö', city: 'Växjö', country: 'Sweden', fetchedAt: '2024-01-01' },
	'halmstad': { latitude: 56.6745, longitude: 12.8578, displayName: 'Halmstad', city: 'Halmstad', country: 'Sweden', fetchedAt: '2024-01-01' },
	'luleå': { latitude: 65.5848, longitude: 22.1547, displayName: 'Luleå', city: 'Luleå', country: 'Sweden', fetchedAt: '2024-01-01' },
	'lulea': { latitude: 65.5848, longitude: 22.1547, displayName: 'Luleå', city: 'Luleå', country: 'Sweden', fetchedAt: '2024-01-01' },
	'mölndal': { latitude: 57.6557, longitude: 12.0134, displayName: 'Mölndal', city: 'Mölndal', country: 'Sweden', fetchedAt: '2024-01-01' },
	'molndal': { latitude: 57.6557, longitude: 12.0134, displayName: 'Mölndal', city: 'Mölndal', country: 'Sweden', fetchedAt: '2024-01-01' },
	'kungsbacka': { latitude: 57.4869, longitude: 12.0761, displayName: 'Kungsbacka', city: 'Kungsbacka', country: 'Sweden', fetchedAt: '2024-01-01' },
	'varberg': { latitude: 57.1057, longitude: 12.2502, displayName: 'Varberg', city: 'Varberg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'skövde': { latitude: 58.3911, longitude: 13.8458, displayName: 'Skövde', city: 'Skövde', country: 'Sweden', fetchedAt: '2024-01-01' },
	'skovde': { latitude: 58.3911, longitude: 13.8458, displayName: 'Skövde', city: 'Skövde', country: 'Sweden', fetchedAt: '2024-01-01' },
	'kalmar': { latitude: 56.6634, longitude: 16.3566, displayName: 'Kalmar', city: 'Kalmar', country: 'Sweden', fetchedAt: '2024-01-01' },
	'kristianstad': { latitude: 56.0294, longitude: 14.1567, displayName: 'Kristianstad', city: 'Kristianstad', country: 'Sweden', fetchedAt: '2024-01-01' },
	'karlskrona': { latitude: 56.1612, longitude: 15.5869, displayName: 'Karlskrona', city: 'Karlskrona', country: 'Sweden', fetchedAt: '2024-01-01' },
	'falun': { latitude: 60.6065, longitude: 15.6355, displayName: 'Falun', city: 'Falun', country: 'Sweden', fetchedAt: '2024-01-01' },
	'nyköping': { latitude: 58.7530, longitude: 17.0086, displayName: 'Nyköping', city: 'Nyköping', country: 'Sweden', fetchedAt: '2024-01-01' },
	'nykoping': { latitude: 58.7530, longitude: 17.0086, displayName: 'Nyköping', city: 'Nyköping', country: 'Sweden', fetchedAt: '2024-01-01' },
	'visby': { latitude: 57.6348, longitude: 18.2948, displayName: 'Visby', city: 'Visby', country: 'Sweden', fetchedAt: '2024-01-01' },
	'östersund': { latitude: 63.1792, longitude: 14.6357, displayName: 'Östersund', city: 'Östersund', country: 'Sweden', fetchedAt: '2024-01-01' },
	'ostersund': { latitude: 63.1792, longitude: 14.6357, displayName: 'Östersund', city: 'Östersund', country: 'Sweden', fetchedAt: '2024-01-01' },
	'uddevalla': { latitude: 58.3489, longitude: 11.9420, displayName: 'Uddevalla', city: 'Uddevalla', country: 'Sweden', fetchedAt: '2024-01-01' },
	'landskrona': { latitude: 55.8708, longitude: 12.8302, displayName: 'Landskrona', city: 'Landskrona', country: 'Sweden', fetchedAt: '2024-01-01' },
	'motala': { latitude: 58.5372, longitude: 15.0365, displayName: 'Motala', city: 'Motala', country: 'Sweden', fetchedAt: '2024-01-01' },
	'skellefteå': { latitude: 64.7507, longitude: 20.9528, displayName: 'Skellefteå', city: 'Skellefteå', country: 'Sweden', fetchedAt: '2024-01-01' },
	'skelleftea': { latitude: 64.7507, longitude: 20.9528, displayName: 'Skellefteå', city: 'Skellefteå', country: 'Sweden', fetchedAt: '2024-01-01' },
	'ängelholm': { latitude: 56.2428, longitude: 12.8622, displayName: 'Ängelholm', city: 'Ängelholm', country: 'Sweden', fetchedAt: '2024-01-01' },
	'angelholm': { latitude: 56.2428, longitude: 12.8622, displayName: 'Ängelholm', city: 'Ängelholm', country: 'Sweden', fetchedAt: '2024-01-01' },
	'partille': { latitude: 57.7394, longitude: 12.1064, displayName: 'Partille', city: 'Partille', country: 'Sweden', fetchedAt: '2024-01-01' },
	'kungälv': { latitude: 57.8710, longitude: 11.9807, displayName: 'Kungälv', city: 'Kungälv', country: 'Sweden', fetchedAt: '2024-01-01' },
	'kungalv': { latitude: 57.8710, longitude: 11.9807, displayName: 'Kungälv', city: 'Kungälv', country: 'Sweden', fetchedAt: '2024-01-01' },
	'alingsås': { latitude: 57.9305, longitude: 12.5336, displayName: 'Alingsås', city: 'Alingsås', country: 'Sweden', fetchedAt: '2024-01-01' },
	'alingsas': { latitude: 57.9305, longitude: 12.5336, displayName: 'Alingsås', city: 'Alingsås', country: 'Sweden', fetchedAt: '2024-01-01' },
	'lerum': { latitude: 57.7706, longitude: 12.2692, displayName: 'Lerum', city: 'Lerum', country: 'Sweden', fetchedAt: '2024-01-01' },
	// Göteborg suburbs and nearby areas
	'västra frölunda': { latitude: 57.6460, longitude: 11.9095, displayName: 'Västra Frölunda', city: 'Göteborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'askim': { latitude: 57.6340, longitude: 11.9527, displayName: 'Askim', city: 'Göteborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'hovås': { latitude: 57.6124, longitude: 11.9352, displayName: 'Hovås', city: 'Göteborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'hovas': { latitude: 57.6124, longitude: 11.9352, displayName: 'Hovås', city: 'Göteborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'torslanda': { latitude: 57.7224, longitude: 11.7757, displayName: 'Torslanda', city: 'Göteborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'jonsered': { latitude: 57.7543, longitude: 12.1705, displayName: 'Jonsered', city: 'Göteborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'hällingsjö': { latitude: 57.6603, longitude: 12.4016, displayName: 'Hällingsjö', city: 'Hällingsjö', country: 'Sweden', fetchedAt: '2024-01-01' },
	'hallingsjo': { latitude: 57.6603, longitude: 12.4016, displayName: 'Hällingsjö', city: 'Hällingsjö', country: 'Sweden', fetchedAt: '2024-01-01' },
	'landvetter': { latitude: 57.6676, longitude: 12.1448, displayName: 'Landvetter', city: 'Landvetter', country: 'Sweden', fetchedAt: '2024-01-01' },
	'lindome': { latitude: 57.5748, longitude: 12.0871, displayName: 'Lindome', city: 'Lindome', country: 'Sweden', fetchedAt: '2024-01-01' },
	'stenungsund': { latitude: 58.0711, longitude: 11.8186, displayName: 'Stenungsund', city: 'Stenungsund', country: 'Sweden', fetchedAt: '2024-01-01' },
	'lycke': { latitude: 57.8800, longitude: 11.8100, displayName: 'Lycke', city: 'Lycke', country: 'Sweden', fetchedAt: '2024-01-01' },
	'herrljunga': { latitude: 58.0807, longitude: 13.0279, displayName: 'Herrljunga', city: 'Herrljunga', country: 'Sweden', fetchedAt: '2024-01-01' },
	'solna': { latitude: 59.3600, longitude: 18.0000, displayName: 'Solna', city: 'Solna', country: 'Sweden', fetchedAt: '2024-01-01' },
	'saltsjö-boo': { latitude: 59.3333, longitude: 18.2667, displayName: 'Saltsjö-Boo', city: 'Saltsjö-Boo', country: 'Sweden', fetchedAt: '2024-01-01' },
	'sollebrunn': { latitude: 58.1091, longitude: 12.5631, displayName: 'Sollebrunn', city: 'Sollebrunn', country: 'Sweden', fetchedAt: '2024-01-01' },
	'sävedalen': { latitude: 57.7345, longitude: 12.0711, displayName: 'Sävedalen', city: 'Sävedalen', country: 'Sweden', fetchedAt: '2024-01-01' },
	'savedalen': { latitude: 57.7345, longitude: 12.0711, displayName: 'Sävedalen', city: 'Sävedalen', country: 'Sweden', fetchedAt: '2024-01-01' },
	'hindås': { latitude: 57.7033, longitude: 12.4458, displayName: 'Hindås', city: 'Hindås', country: 'Sweden', fetchedAt: '2024-01-01' },
	'hindas': { latitude: 57.7033, longitude: 12.4458, displayName: 'Hindås', city: 'Hindås', country: 'Sweden', fetchedAt: '2024-01-01' },
	'floda': { latitude: 57.7892, longitude: 12.3581, displayName: 'Floda', city: 'Floda', country: 'Sweden', fetchedAt: '2024-01-01' },
	'härryda': { latitude: 57.6833, longitude: 12.1333, displayName: 'Härryda', city: 'Härryda', country: 'Sweden', fetchedAt: '2024-01-01' },
	'harryda': { latitude: 57.6833, longitude: 12.1333, displayName: 'Härryda', city: 'Härryda', country: 'Sweden', fetchedAt: '2024-01-01' },
	'nödinge': { latitude: 57.8603, longitude: 12.0610, displayName: 'Nödinge', city: 'Nödinge', country: 'Sweden', fetchedAt: '2024-01-01' },
	'nodinge': { latitude: 57.8603, longitude: 12.0610, displayName: 'Nödinge', city: 'Nödinge', country: 'Sweden', fetchedAt: '2024-01-01' },
	'surte': { latitude: 57.8192, longitude: 12.0134, displayName: 'Surte', city: 'Surte', country: 'Sweden', fetchedAt: '2024-01-01' },
	'angered': { latitude: 57.7940, longitude: 12.0490, displayName: 'Angered', city: 'Göteborg', country: 'Sweden', fetchedAt: '2024-01-01' },
	// Additional Swedish cities
	'huddinge': { latitude: 59.2373, longitude: 17.9817, displayName: 'Huddinge', city: 'Huddinge', country: 'Sweden', fetchedAt: '2024-01-01' },
	'nacka': { latitude: 59.3108, longitude: 18.1636, displayName: 'Nacka', city: 'Nacka', country: 'Sweden', fetchedAt: '2024-01-01' },
	'täby': { latitude: 59.4439, longitude: 18.0687, displayName: 'Täby', city: 'Täby', country: 'Sweden', fetchedAt: '2024-01-01' },
	'taby': { latitude: 59.4439, longitude: 18.0687, displayName: 'Täby', city: 'Täby', country: 'Sweden', fetchedAt: '2024-01-01' },
	'sundbyberg': { latitude: 59.3612, longitude: 17.9717, displayName: 'Sundbyberg', city: 'Sundbyberg', country: 'Sweden', fetchedAt: '2024-01-01' },
	'lidingö': { latitude: 59.3667, longitude: 18.1500, displayName: 'Lidingö', city: 'Lidingö', country: 'Sweden', fetchedAt: '2024-01-01' },
	'lidingo': { latitude: 59.3667, longitude: 18.1500, displayName: 'Lidingö', city: 'Lidingö', country: 'Sweden', fetchedAt: '2024-01-01' },
	'norrtälje': { latitude: 59.7577, longitude: 18.7021, displayName: 'Norrtälje', city: 'Norrtälje', country: 'Sweden', fetchedAt: '2024-01-01' },
	'norrtalje': { latitude: 59.7577, longitude: 18.7021, displayName: 'Norrtälje', city: 'Norrtälje', country: 'Sweden', fetchedAt: '2024-01-01' },
	'västervik': { latitude: 57.7587, longitude: 16.6366, displayName: 'Västervik', city: 'Västervik', country: 'Sweden', fetchedAt: '2024-01-01' },
	'vastervik': { latitude: 57.7587, longitude: 16.6366, displayName: 'Västervik', city: 'Västervik', country: 'Sweden', fetchedAt: '2024-01-01' },
};

// Initialize cache with Swedish cities
Object.assign(geocodingCache, SWEDISH_CITIES_CACHE);

/**
 * Normalize city name for cache lookup
 */
function normalizeCityName(city: string): string {
	return city
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ')
		.replace(/[,.].*$/, ''); // Remove everything after comma/period (e.g., "Stockholm, Sweden" -> "stockholm")
}

/**
 * Get coordinates for a city (checks cache first)
 *
 * @param city City name to geocode
 * @param country Optional country to narrow search (default: Sweden)
 * @returns Geocoding result or null if not found
 */
export async function geocodeCity(
	city: string,
	country: string = 'Sweden'
): Promise<GeocodingResult | null> {
	const cacheKey = normalizeCityName(city);

	// Check cache first
	if (geocodingCache[cacheKey]) {
		return geocodingCache[cacheKey];
	}

	// Not in cache - call Nominatim API
	try {
		const query = encodeURIComponent(`${city}, ${country}`);
		const url = `${NOMINATIM_BASE}/search?q=${query}&format=json&limit=1&addressdetails=1`;

		const response = await fetch(url, {
			headers: {
				'User-Agent': USER_AGENT,
				'Accept': 'application/json'
			}
		});

		if (!response.ok) {
			console.error(`Nominatim API error: ${response.status}`);
			return null;
		}

		const data = await response.json();

		if (!data || data.length === 0) {
			return null;
		}

		const result = data[0];
		const geocodingResult: GeocodingResult = {
			latitude: parseFloat(result.lat),
			longitude: parseFloat(result.lon),
			displayName: result.display_name,
			city: result.address?.city || result.address?.town || result.address?.municipality,
			country: result.address?.country,
			fetchedAt: new Date().toISOString()
		};

		// Cache the result
		geocodingCache[cacheKey] = geocodingResult;

		return geocodingResult;

	} catch (error) {
		console.error('Nominatim geocoding error:', error);
		return null;
	}
}

/**
 * Check if a city is in the pre-populated cache (no API call needed)
 */
export function isCityInCache(city: string): boolean {
	return normalizeCityName(city) in geocodingCache;
}

/**
 * Get all cached cities (for debugging/monitoring)
 */
export function getCachedCities(): string[] {
	return Object.keys(geocodingCache);
}

/**
 * Add a city to the cache manually (useful for Pipedrive-stored coordinates)
 */
export function addToCache(city: string, result: GeocodingResult): void {
	geocodingCache[normalizeCityName(city)] = result;
}
