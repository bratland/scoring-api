export { TicClient, calculateDistance, distanceToGothenburg, GOTHENBURG_COORDS } from './client';
export type { TicClientConfig } from './client';
export type {
	TicCompanyData,
	TicCachedData,
	TicApiResponse
} from './types';
export {
	getCachedTicData,
	getCachedMunicipality,
	isInTicCache,
	TIC_CACHE_SEED
} from './cache-seed';
