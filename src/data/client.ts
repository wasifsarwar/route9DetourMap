import type { AlertFeed } from '../domain/types';
import { isFeedFresh } from '../domain/impact';
import { normalizeSnapshot } from './snapshot';
import { validateLiveFeed } from './validate';

export interface FetchOptions { signal?: AbortSignal }
export interface LiveFeedOptions extends FetchOptions {
  previousFeed?: AlertFeed | null;
  /** Defaults to the build's VITE_LIVE_FEED_URL. An empty value uses Pages alone. */
  liveFeedUrl?: string;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The request was cancelled.', 'AbortError');
}

async function getJson(url: string, options: FetchOptions): Promise<unknown> {
  throwIfCancelled(options.signal);
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('The data request timed out.', 'TimeoutError')), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Route 9 data could not be loaded (HTTP ${response.status}).`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function loadSnapshot(options: FetchOptions = {}) {
  return normalizeSnapshot(await getJson(`${import.meta.env.BASE_URL}data/route9-snapshot.json`, options));
}

/** A newer failed collection must supersede an older successful one. Publication age is not source age. */
export function selectLatestFeed(previous: AlertFeed | null | undefined, candidate: AlertFeed): AlertFeed {
  if (!previous) return candidate;
  const previousTime = Date.parse(previous.collectedAt ?? previous.fetchedAt);
  const candidateTime = Date.parse(candidate.collectedAt ?? candidate.fetchedAt);
  return candidateTime >= previousTime ? candidate : previous;
}

function primaryUrl(value: string): string {
  const url = new URL(value, typeof window === 'undefined' ? 'http://localhost/' : window.location.href);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('The configured feed URL is invalid.');
  // One key per minute is shared by visitors, while avoiding a stale raw-content CDN response.
  if (url.hostname === 'raw.githubusercontent.com') url.searchParams.set('v', String(Math.floor(Date.now() / 60_000)));
  return url.href;
}

/** Try the independent publication, checking the dated Pages copy if it is unavailable or stale. */
export async function fetchLiveFeed(options: LiveFeedOptions = {}): Promise<AlertFeed> {
  const configuredUrl = (options.liveFeedUrl ?? import.meta.env.VITE_LIVE_FEED_URL ?? '').trim();
  let primary: AlertFeed | null = null;
  if (configuredUrl) {
    try {
      primary = validateLiveFeed(await getJson(primaryUrl(configuredUrl), options));
      throwIfCancelled(options.signal);
      if (isFeedFresh(primary, new Date())) return selectLatestFeed(options.previousFeed, primary);
      // A UI deployment can bundle a newer collection while the independent collector is delayed.
      // Compare publication times below; never prefer completeness over a known newer failure.
    } catch {
      throwIfCancelled(options.signal);
    }
  }
  let fallback: AlertFeed;
  try {
    fallback = validateLiveFeed(await getJson(`${import.meta.env.BASE_URL}data/current-alerts.json`, options));
    throwIfCancelled(options.signal);
  } catch (error) {
    throwIfCancelled(options.signal);
    if (primary) return selectLatestFeed(options.previousFeed, primary);
    throw error;
  }
  const retained = primary ? selectLatestFeed(options.previousFeed, primary) : options.previousFeed;
  const selected = selectLatestFeed(retained, fallback);
  if (!configuredUrl || primary) return selected;
  const warning = 'The latest published feed could not be loaded. Showing the most recent available update; its original source times still apply.';
  return { ...selected, warnings: [...new Set([...selected.warnings, warning])] };
}
