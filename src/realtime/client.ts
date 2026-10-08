import type { RealtimeFeed } from './types';
export const realtimeUrl = import.meta.env.VITE_REALTIME_URL || (import.meta.env.DEV ? '/api/route9-live' : '');
export function validateRealtime(raw: unknown): RealtimeFeed {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid live bus response');
  const f = raw as RealtimeFeed;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  const timestamp = (n: unknown) => n === null || finite(n);
  const direction = (d: unknown) => d === '0' || d === '1';
  if (!finite(f.fetchedAt) || !timestamp(f.vehiclesAt) || !timestamp(f.predictionsAt) || !Array.isArray(f.vehicles) || !Array.isArray(f.predictions) || !Array.isArray(f.warnings)) throw new Error('Invalid live bus response');
  if (f.vehicles.length > 200 || f.predictions.length > 10000 || f.vehicles.some(v => !v || !direction(v.directionId) || typeof v.id !== 'string' || typeof v.tripId !== 'string' || !finite(v.lat) || !finite(v.lon) || !finite(v.reportedAt)) || f.predictions.some(p => !p || !direction(p.directionId) || typeof p.stopId !== 'string' || typeof p.tripId !== 'string' || !finite(p.reportedAt) || !timestamp(p.arrivalAt) || typeof p.skipped !== 'boolean')) throw new Error('Invalid live bus records');
  return f;
}
