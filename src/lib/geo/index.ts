export {
	geocodeCity,
	isCityInCache,
	getCachedCities,
	addToCache
} from './nominatim';

export type { GeocodingResult, GeocodingCache } from './nominatim';

// Re-export distance calculations from TIC module
export { calculateDistance, distanceToGothenburg, GOTHENBURG_COORDS } from '../tic/client';
