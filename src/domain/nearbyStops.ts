import type { Stop } from './types';

export interface LocationFix { lat: number; lon: number; accuracy: number; timestamp: number }
export function validFix(fix: LocationFix, now: number): boolean {
  return [fix.lat, fix.lon, fix.accuracy, fix.timestamp].every(Number.isFinite)
    && Math.abs(fix.lat) <= 90 && Math.abs(fix.lon) <= 180 && fix.accuracy >= 0 && fix.accuracy <= 1000
    && now - fix.timestamp >= -10_000 && now - fix.timestamp <= 5 * 60_000;
}
export function nearbyStops(stops: Stop[], fix: LocationFix, now: number) {
  if (!validFix(fix, now)) return [];
  const radians = (n: number) => n * Math.PI / 180;
  return stops.map(stop => {
    const a = Math.sin(radians(stop.lat - fix.lat) / 2) ** 2
      + Math.cos(radians(fix.lat)) * Math.cos(radians(stop.lat)) * Math.sin(radians(stop.lon - fix.lon) / 2) ** 2;
    return { stop, meters: 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) };
  }).filter(item => Number.isFinite(item.meters) && item.meters <= 1609.344)
    .sort((a, b) => a.meters - b.meters).slice(0, 3);
}
export function distanceLabel(meters: number): string {
  return meters < 160 ? `${Math.max(50, Math.round(meters * 3.28084 / 50) * 50)} ft` : `${(meters / 1609.344).toFixed(1)} mi`;
}

/** Rough estimate at an assumed 1.2 m/s; distance is not a pedestrian route. */
export function walkingTimeLabel(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return 'Walk time unavailable';
  return `~${Math.max(1, Math.ceil(meters / 72))} min walk`;
}
