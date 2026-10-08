import type { Coordinate } from '../domain/types';
import type { LiveBus } from './types';
import { currentReport } from './types';
export const observationKey = (bus: LiveBus) => `${bus.directionId}:${bus.id}:${bus.tripId}`;
export function retainObservations(previous: LiveBus[], incoming: LiveBus[], now: number): LiveBus[] {
  const kept = previous.filter(p => p.reportedAt >= now - 3600_000);
  const seen = new Set(kept.map(p => `${observationKey(p)}:${p.reportedAt}`));
  for (const p of incoming) {
    const key = `${observationKey(p)}:${p.reportedAt}`;
    if (currentReport(p.reportedAt, now) && !seen.has(key)) { kept.push({ ...p }); seen.add(key); }
  }
  return kept.sort((a,b) => a.reportedAt - b.reportedAt).slice(-5000);
}
/** Local planar distance to published segments, not a route-match verdict. */
export function distanceToPaths(point: Coordinate, paths: Coordinate[][]): number | null {
  let best = Infinity;
  const scale = 111195, longitudeScale = scale * Math.cos(point[0] * Math.PI / 180);
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i-1], b = path[i];
    const x = (a[1]-point[1])*longitudeScale, y = (a[0]-point[0])*scale;
    const dx = (b[1]-a[1])*longitudeScale, dy = (b[0]-a[0])*scale;
    const t = Math.max(0, Math.min(1, -(x*dx+y*dy)/(dx*dx+dy*dy || 1)));
    best = Math.min(best, Math.hypot(x+t*dx,y+t*dy));
  }
  return Number.isFinite(best) ? Math.round(best) : null;
}
