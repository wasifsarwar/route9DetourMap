import type { DirectionId, RouteData, RouteDirection, Stop } from '../domain/types';

export const JOURNEY_STORAGE_KEY = 'reroute:last-journey:v1';

export interface JourneyPreference {
  version: 1;
  routeId: string;
  directionId: DirectionId;
  stopId: string;
}

export interface JourneySelection {
  direction: RouteDirection;
  stop: Stop;
}

export type JourneyStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): JourneyStorage | null {
  if (typeof window === 'undefined') return null;
  // Accessing localStorage itself can throw when browser storage is disabled.
  try { return window.localStorage; } catch { return null; }
}

function isPreference(value: unknown): value is JourneyPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.version === 1 && typeof item.routeId === 'string' && item.routeId.trim().length > 0
    && (item.directionId === '0' || item.directionId === '1')
    && typeof item.stopId === 'string' && item.stopId.trim().length > 0;
}

function preferenceFields(preference: JourneyPreference): JourneyPreference {
  // Only these fields belong to the preference, even if an older client saved more.
  return { version: 1, routeId: preference.routeId, directionId: preference.directionId, stopId: preference.stopId };
}

/** Read without writing defaults; route data may still be loading. */
export function readJourneyPreference(storage: JourneyStorage | null = browserStorage()): JourneyPreference | null {
  try {
    const serialized = storage?.getItem(JOURNEY_STORAGE_KEY);
    if (!serialized) return null;
    const value: unknown = JSON.parse(serialized);
    return isPreference(value) ? preferenceFields(value) : null;
  } catch {
    return null;
  }
}

/** Saving a preference must never prevent the rider from changing their selection. */
export function writeJourneyPreference(preference: JourneyPreference, storage: JourneyStorage | null = browserStorage()): boolean {
  if (!storage || !isPreference(preference)) return false;
  try {
    storage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(preferenceFields(preference)));
    return true;
  } catch {
    return false;
  }
}

/** Validate against this feed, so removed stops and opposite-direction IDs cannot be restored. */
export function resolveJourney(route: RouteData, preference: JourneyPreference | null): JourneySelection | null {
  const usableDirections = route.directions.filter(direction => direction.stops.length > 0);
  const matching = preference?.routeId === route.id ? preference : null;
  const direction = usableDirections.find(item => item.id === matching?.directionId)
    ?? usableDirections.find(item => item.id === '1')
    ?? usableDirections[0];
  if (!direction) return null;
  const stop = (matching?.directionId === direction.id ? direction.stops.find(item => item.id === matching.stopId) : undefined)
    ?? direction.stops.find(item => item.id === '30576')
    ?? direction.stops[0];
  return { direction, stop };
}
