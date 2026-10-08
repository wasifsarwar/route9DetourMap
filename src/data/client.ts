import type { AlertFeed } from '../domain/types';
import { normalizeSnapshot } from './snapshot';
import { validateLiveFeed } from './validate';

export interface FetchOptions { signal?: AbortSignal }

async function getJson(path: string, options: FetchOptions): Promise<unknown> {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal, cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Route 9 data could not be loaded (HTTP ${response.status}).`);
  return response.json();
}

export async function loadSnapshot(options: FetchOptions = {}) {
  return normalizeSnapshot(await getJson('data/route9-snapshot.json', options));
}

/** Read the scheduled, same-origin feed; a page refresh never refreshes its source age. */
export async function fetchLiveFeed(options: FetchOptions = {}): Promise<AlertFeed> {
  return validateLiveFeed(await getJson('data/current-alerts.json', options));
}
