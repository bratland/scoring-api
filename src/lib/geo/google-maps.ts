/**
 * Google Maps Geocoding Client
 *
 * Fast geocoding with no strict rate limit (unlike Nominatim's 1 req/sec).
 * Used as fallback when city-based cache misses - geocodes full addresses.
 *
 * API docs: https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 */

import type { GeocodingResult } from './nominatim';

const GEOCODING_API_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

export interface GoogleMapsGeocodingOptions {
	apiKey: string;
}

/**
 * Geocode a full address string via Google Maps Geocoding API.
 * Returns coordinates or null if not found.
 */
export async function geocodeAddress(
	address: string,
	options: GoogleMapsGeocodingOptions
): Promise<GeocodingResult | null> {
	if (!address || address.trim().length < 3) return null;

	try {
		const params = new URLSearchParams({
			address,
			key: options.apiKey
		});

		const response = await fetch(`${GEOCODING_API_BASE}?${params}`);

		if (!response.ok) {
			console.error(`Google Maps Geocoding API error: ${response.status}`);
			return null;
		}

		const data = await response.json();

		if (data.status !== 'OK' || !data.results?.length) {
			return null;
		}

		const result = data.results[0];
		const location = result.geometry?.location;

		if (!location?.lat || !location?.lng) {
			return null;
		}

		// Extract city from address components
		const cityComponent = result.address_components?.find(
			(c: { types: string[] }) =>
				c.types.includes('locality') || c.types.includes('postal_town')
		);
		const countryComponent = result.address_components?.find(
			(c: { types: string[] }) => c.types.includes('country')
		);

		return {
			latitude: location.lat,
			longitude: location.lng,
			displayName: result.formatted_address || address,
			city: cityComponent?.long_name,
			country: countryComponent?.long_name,
			fetchedAt: new Date().toISOString()
		};
	} catch (error) {
		console.error('Google Maps geocoding error:', error);
		return null;
	}
}
