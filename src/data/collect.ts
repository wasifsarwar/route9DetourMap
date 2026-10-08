import type { AlertFeed, FeedSource, RouteData } from '../domain/types';
import { parseInstant } from '../domain/time';
import { normalizeFeed, SOURCES, type RawFeed, type SourceKey } from './normalize';
import { validateLiveFeed } from './validate';

function sourceProvenance(raw: RawFeed, normalized?: AlertFeed): FeedSource[] {
  return (Object.keys(SOURCES) as SourceKey[]).map(key => {
    const result = raw[key];
    const existing = normalized?.sources.find(source => source.url === SOURCES[key]);
    const fetchedAt = result.fetchedAt && Number.isFinite(parseInstant(result.fetchedAt)) ? result.fetchedAt : null;
    const error = result.error || existing?.error || (!fetchedAt ? 'The source retrieval time is unavailable or invalid.' : undefined);
    const ok = !error && fetchedAt !== null && (existing?.ok ?? true);
    return {
      name: existing?.name ?? (key === 'legacy' ? 'SEPTA service notices' : key === 'detours' ? 'SEPTA detours' : `SEPTA ${key} maps`),
      url: SOURCES[key], fetchedAt, ok,
      ...(!ok ? { error: error ?? 'This source could not be interpreted.' } : {}),
    };
  });
}

/**
 * Every completed retrieval attempt produces a publishable health state. An
 * invalid response must not leave the previous successful publication looking
 * like the latest attempt. Route loading and caller errors stay outside this
 * normalization/validation boundary.
 */
export function collectFeed(raw: RawFeed, route: RouteData, collectedAt = new Date().toISOString()): AlertFeed {
  if (!Number.isFinite(parseInstant(collectedAt))) throw new Error('The collection time must be a valid ISO timestamp.');
  // The collector constructs one result for every configured source. Missing
  // results are a caller error, not an upstream outage to silently publish.
  if ((Object.keys(SOURCES) as SourceKey[]).some(key => !raw[key])) {
    throw new Error('The collection is missing a configured source result.');
  }
  let normalized: AlertFeed | undefined;
  try {
    normalized = normalizeFeed(raw, route);
    return validateLiveFeed({ ...normalized, collectedAt });
  } catch (error) {
    const sources = sourceProvenance(raw, normalized);
    const successfulTimes = sources.filter(source => source.ok && source.fetchedAt)
      .map(source => parseInstant(source.fetchedAt!));
    const reason = error instanceof Error ? error.message : 'Unknown normalization or validation error.';
    const failure: AlertFeed = {
      routeId: route.id,
      mode: 'live',
      fetchedAt: successfulTimes.length ? new Date(Math.min(...successfulTimes)).toISOString() : new Date(0).toISOString(),
      collectedAt,
      complete: false,
      alerts: [],
      sources,
      warnings: [...new Set([
        ...(normalized?.warnings ?? []),
        'The latest agency collection could not be interpreted safely. Stop status is unconfirmed; an empty alert list here does not mean there are no disruptions.',
        `Collection validation failed: ${reason}`,
      ])],
    };
    // If our failure-envelope construction is broken, fail loudly instead of
    // publishing invalid data or swallowing the programming error again.
    return validateLiveFeed(failure);
  }
}
