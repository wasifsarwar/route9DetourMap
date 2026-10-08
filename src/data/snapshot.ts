import type { AlertFeed, Coordinate, DetourAlert, DirectionId, RouteData, ServiceWindow, Stop } from '../domain/types';

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
function points(value: unknown): Coordinate[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Coordinate => Array.isArray(item) && item.length === 2 && item.every(Number.isFinite) && Math.abs(item[0]) <= 90 && Math.abs(item[1]) <= 180);
}
function segments(value: unknown): Coordinate[][] { return Array.isArray(value) ? value.map(points).filter(line => line.length > 1) : []; }
function isoDate(value: unknown): string { const date = text(value); return /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date; }
function stop(value: unknown): Stop | null {
  const item = record(value);
  if (!text(item.id) || !text(item.name) || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return null;
  return { id: text(item.id), name: text(item.name), lat: item.lat as number, lon: item.lon as number, ...(typeof item.sequence === 'number' ? { sequence: item.sequence } : {}) };
}

/** Adapter for the original research fixture. Replay remains explicitly recorded. */
export function normalizeSnapshot(value: unknown): { route: RouteData; feed: AlertFeed } {
  const raw = record(value), metadata = record(raw.metadata), urls = record(metadata.sourceUrls);
  if (!Array.isArray(raw.directions) || !Array.isArray(raw.detours) || !Number.isFinite(Date.parse(text(metadata.capturedAt)))) throw new Error('The recorded Route 9 data is invalid.');
  const route: RouteData = {
    id: '9', name: text(record(metadata.route).route_long_name) || '4th-Walnut to Andorra', feedVersion: text(metadata.feedVersion), validFrom: isoDate(metadata.feedStartDate), validThrough: isoDate(metadata.feedEndDate), sourceUrl: text(urls.gtfs),
    directions: raw.directions.map(value => {
      const item = record(value);
      if ((item.id !== '0' && item.id !== '1') || !Array.isArray(item.stops)) throw new Error('The recorded route direction is invalid.');
      return { id: item.id as DirectionId, label: text(item.label), headsign: text(item.headsign), shape: points(item.shape), stops: item.stops.map(stop).filter((item): item is Stop => item !== null) };
    }),
  };
  if (route.directions.length !== 2 || route.directions.some(direction => !direction.stops.length || !direction.shape.length)) throw new Error('The recorded route is incomplete.');
  const alerts: DetourAlert[] = raw.detours.map(value => {
    const item = record(value), schedule = record(item.schedule);
    const normalizedSchedule: ServiceWindow | null = Array.isArray(schedule.days) && typeof schedule.startTime === 'string' && typeof schedule.endTime === 'string'
      ? { days: schedule.days.filter((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6), startTime: schedule.startTime, endTime: schedule.endTime } : null;
    return {
      id: text(item.id), title: text(item.title), directionIds: item.directionId === '0' || item.directionId === '1' ? [item.directionId] : ['0', '1'],
      startsAt: text(item.start) || null, endsAt: text(item.end) || null, schedule: normalizedSchedule, rawText: text(item.rawText), sourceUrl: text(item.sourceUrl),
      timingIssues: strings(item.timingConflicts), geometryIssues: strings(item.geometryWarnings), sourceIssues: item.uncertaintyKind === 'source' ? strings(item.conflicts) : [],
      geometry: segments(item.geometrySegments), unservedGeometry: segments(item.unservedGeometrySegments),
      ...(points(item.candidateGeometry).length ? { candidateGeometry: points(item.candidateGeometry) } : {}),
      skippedStopIds: strings(item.skippedStopIds), stopCoverage: item.skippedStopsStatus === 'official_list' && strings(item.skippedStopIds).length ? 'explicit-list' : 'unknown',
    };
  });
  const capturedAt = text(metadata.capturedAt);
  return { route, feed: { routeId: '9', alerts, fetchedAt: capturedAt, mode: 'snapshot', complete: true,
    sources: ['detours', 'alerts', 'northboundKml', 'southboundKml'].map(key => ({ name: `Recorded SEPTA ${key}`, url: text(urls[key]), fetchedAt: capturedAt, ok: true })),
    warnings: ['Recorded on October 7, 2026. Replay does not describe current service.'],
  } };
}
