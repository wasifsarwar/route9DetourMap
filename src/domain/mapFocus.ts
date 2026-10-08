import { buildDetourTrace } from './mapGeometry';
import type { Coordinate, DetourAlert, EvaluatedAlert, RouteDirection, Stop } from './types';

export interface AutomaticMapFocus {
  alertId: string | null;
  reason: 'listed-stop' | 'illustrated-bypass' | 'nearby-path' | 'none';
}

const EARTH_RADIUS = 6_371_000;
const radians = (value: number) => value * Math.PI / 180;
function valid(point: Coordinate): boolean {
  return point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
}

function localPoint(origin: Coordinate, point: Coordinate): Coordinate {
  return [radians(point[1] - origin[1]) * EARTH_RADIUS * Math.cos(radians(origin[0])), radians(point[0] - origin[0]) * EARTH_RADIUS];
}

function distanceToPath(origin: Coordinate, path: Coordinate[]): number {
  let closest = Infinity;
  for (let i = 1; i < path.length; i += 1) {
    if (!valid(path[i - 1]) || !valid(path[i])) continue;
    const a = localPoint(origin, path[i - 1]), b = localPoint(origin, path[i]);
    const dx = b[0] - a[0], dy = b[1] - a[1], lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSquared)) : 0;
    closest = Math.min(closest, Math.hypot(a[0] + fraction * dx, a[1] + fraction * dy));
  }
  return closest;
}

/** Choose visual context only; this never establishes a stop closure or boarding point. */
export function getAutomaticMapFocus(
  direction: RouteDirection,
  stop: Stop,
  alerts: EvaluatedAlert[],
  reviewedAlerts: DetourAlert[] = [],
): AutomaticMapFocus {
  const none: AutomaticMapFocus = { alertId: null, reason: 'none' };
  if (!direction.stops.some(item => item.id === stop.id)) return none;
  const applicable = alerts.filter(item => item.timing === 'active' && item.alert.directionIds.includes(direction.id))
    .sort((a, b) => Number(a.timing !== 'active') - Number(b.timing !== 'active')
      || Number(a.alert.sourceIssues.length > 0) - Number(b.alert.sourceIssues.length > 0)
      || a.alert.id.localeCompare(b.alert.id));
  // A named closure remains relevant even when the agency provides no map path.
  const listed = applicable.find(item => item.alert.skippedStopIds.includes(stop.id));
  if (listed) return { alertId: listed.alert.id, reason: 'listed-stop' };

  const origin: Coordinate = [stop.lat, stop.lon];
  const traces = applicable.map(item => ({ item, trace: buildDetourTrace(direction, item.alert,
    reviewedAlerts.find(reference => reference.id === item.alert.id)) }));
  const bypass = traces.find(({ trace }) => trace.possiblyBypassedStopIds.includes(stop.id));
  if (bypass) return { alertId: bypass.item.alert.id, reason: 'illustrated-bypass' };

  // Require a connected trace close to both the selected baseline section and
  // the illustrated path. A nearby street alone does not make an alert relevant.
  const nearby = traces.map(({ item, trace }) => ({ item,
    baselineDistance: distanceToPath(origin, trace.bypassedPath),
    pathDistance: distanceToPath(origin, trace.path),
  })).filter(item => item.baselineDistance <= 50 && item.pathDistance <= 80)
    .sort((a, b) => a.pathDistance - b.pathDistance || a.item.alert.id.localeCompare(b.item.alert.id))[0];
  return nearby ? { alertId: nearby.item.alert.id, reason: 'nearby-path' } : none;
}

export interface MapInspection {
  selectionKey: string;
  request: number;
  alertId: string | null;
}

/** A new explicit request wins; old requests do not follow a rider to another stop. */
export function resolveMapInspection(previous: MapInspection, selectionKey: string, request: number, alertId: string): MapInspection {
  if (previous.request !== request) return { selectionKey, request, alertId: alertId || null };
  if (previous.selectionKey !== selectionKey) return { selectionKey, request, alertId: null };
  return previous;
}

/**
 * Camera points within a local radius, including the selected stop. Clipped
 * segment endpoints affect the viewport only; they are never rendered as stops.
 */
export function getStopFocusPoints(stop: Stop, paths: Coordinate[][], radiusMeters = 1_200): Coordinate[] {
  const origin: Coordinate = [stop.lat, stop.lon];
  if (!valid(origin)) return [];
  const result: Coordinate[] = [origin];
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return result;
  const add = (a: Coordinate, b: Coordinate, fraction: number) => {
    const point: Coordinate = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    if (!result.some(existing => Math.abs(existing[0] - point[0]) + Math.abs(existing[1] - point[1]) < 1e-10)) result.push(point);
  };
  for (const path of paths) {
    for (let i = 1; i < path.length; i += 1) {
      const start = path[i - 1], end = path[i];
      if (!valid(start) || !valid(end)) continue;
      const a = localPoint(origin, start), b = localPoint(origin, end);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const quadraticA = dx * dx + dy * dy;
      if (!quadraticA) {
        if (Math.hypot(...a) <= radiusMeters) add(start, end, 0);
        continue;
      }
      const quadraticB = 2 * (a[0] * dx + a[1] * dy);
      const quadraticC = a[0] * a[0] + a[1] * a[1] - radiusMeters * radiusMeters;
      const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;
      if (discriminant < 0) continue;
      const lower = Math.max(0, (-quadraticB - Math.sqrt(discriminant)) / (2 * quadraticA));
      const upper = Math.min(1, (-quadraticB + Math.sqrt(discriminant)) / (2 * quadraticA));
      if (lower <= upper) { add(start, end, lower); add(start, end, upper); }
    }
  }
  return result;
}
