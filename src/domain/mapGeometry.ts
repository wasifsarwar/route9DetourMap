import type { Coordinate, DetourAlert, RouteDirection } from './types';

export interface DetourTrace {
  path: Coordinate[];
  bypassedPath: Coordinate[];
  beforePath: Coordinate[];
  afterPath: Coordinate[];
  possiblyBypassedStopIds: string[];
  kind: 'interpreted' | 'agency' | 'unavailable';
  issues: string[];
}

const EARTH_RADIUS = 6_371_000;
const radians = (degrees: number) => degrees * Math.PI / 180;

function isCoordinate(point: Coordinate): boolean {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
    && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
}

function distance(a: Coordinate, b: Coordinate): number {
  const dLat = radians(b[0] - a[0]), dLon = radians(b[1] - a[1]);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function interpolate(a: Coordinate, b: Coordinate, fraction: number): Coordinate {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

function cleanPath(path: Coordinate[]): Coordinate[] {
  // Do not join across invalid coordinates: that would invent a line segment.
  if (!path.every(isCoordinate)) return [];
  return path.filter((point, index) => index === 0 || distance(point, path[index - 1]) > 0.01)
    .map(point => [...point]);
}

function normalizedInstructions(text: string): string {
  return text.toLowerCase().replace(/\br\b/g, 'right').replace(/\bl\b/g, 'left')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(left|right) on\b/g, '$1').trim();
}

function matchesReference(direction: RouteDirection, alert: DetourAlert, reference: DetourAlert): boolean {
  const text = normalizedInstructions(alert.rawText);
  return text.length > 0 && text === normalizedInstructions(reference.rawText)
    && reference.directionIds.includes(direction.id)
    && [...new Set(alert.directionIds)].sort().join(',') === [...new Set(reference.directionIds)].sort().join(',');
}

interface Projection {
  point: Coordinate;
  distance: number;
  along: number;
  segment: number;
  ambiguous: boolean;
}

/** Local planar projection with spherical segment lengths, accurate at bus-route scale. */
function project(point: Coordinate, path: Coordinate[]): Projection | null {
  if (path.length < 2 || !isCoordinate(point)) return null;
  let cumulative = 0;
  const projections: Omit<Projection, 'ambiguous'>[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i], b = path[i + 1];
    const length = distance(a, b);
    if (length < 0.01) continue;
    const scaleX = EARTH_RADIUS * Math.cos(radians((a[0] + b[0] + point[0]) / 3));
    const x = radians(b[1] - a[1]) * scaleX, y = radians(b[0] - a[0]) * EARTH_RADIUS;
    const px = radians(point[1] - a[1]) * scaleX, py = radians(point[0] - a[0]) * EARTH_RADIUS;
    const fraction = Math.max(0, Math.min(1, (px * x + py * y) / (x * x + y * y)));
    const projected = interpolate(a, b, fraction);
    projections.push({ point: projected, distance: distance(point, projected), along: cumulative + length * fraction, segment: i });
    cumulative += length;
  }
  projections.sort((a, b) => a.distance - b.distance);
  const best = projections[0];
  if (!best) return null;
  // A road visited twice cannot establish which part of the route to remove.
  const ambiguous = projections.some(candidate => candidate.distance <= best.distance + 1
    && Math.abs(candidate.along - best.along) > 10);
  return { ...best, ambiguous };
}

function emptyTrace(direction: RouteDirection, issues: string[] = []): DetourTrace {
  return { path: [], bypassedPath: [], beforePath: cleanPath(direction.shape), afterPath: [], possiblyBypassedStopIds: [], kind: 'unavailable', issues };
}

/**
 * Creates drawing geometry only. A geometrically bypassed stop is not a confirmed
 * closure, and a point sampled along the detour is never a boarding location.
 */
export function buildDetourTrace(direction: RouteDirection, alert: DetourAlert, reviewedReference?: DetourAlert): DetourTrace {
  if (!alert.directionIds.includes(direction.id)) return emptyTrace(direction, ['This alert does not match the selected direction.']);
  const result = emptyTrace(direction);
  const referenceMatches = !alert.sourceIssues.length && reviewedReference && matchesReference(direction, alert, reviewedReference);
  const candidate = referenceMatches && reviewedReference.candidateGeometry ? cleanPath(reviewedReference.candidateGeometry) : [];
  if (candidate.length > 1) {
    result.path = candidate;
    result.kind = 'interpreted';
    result.issues.push('This interpreted path matches the reviewed written instructions but has not been verified by the agency.');
  } else if (alert.geometry.length === 1 && !alert.geometryIssues.length && !alert.sourceIssues.length) {
    result.path = cleanPath(alert.geometry[0]);
    if (result.path.length > 1) result.kind = 'agency';
  }
  if (result.path.length < 2) {
    result.path = [];
    result.issues.push(...alert.geometryIssues, ...alert.sourceIssues, 'No single trustworthy detour path is available to replace the normal route.');
    return result;
  }
  if (distance(result.path[0], result.path[result.path.length - 1]) <= 10) {
    return emptyTrace(direction, [...result.issues, 'The detour path forms a closed loop; a bypass cannot be established.']);
  }
  const baseline = cleanPath(direction.shape);
  const start = project(result.path[0], baseline), end = project(result.path[result.path.length - 1], baseline);
  if (!start || !end || start.distance > 50 || end.distance > 50) {
    result.issues.push('The detour endpoints do not connect closely enough to the scheduled route to identify a bypass.');
    return result;
  }
  if (start.ambiguous || end.ambiguous || end.along - start.along <= 1) {
    result.issues.push('The detour endpoints do not identify a unique forward segment of this route.');
    return result;
  }
  result.beforePath = cleanPath([...baseline.slice(0, start.segment + 1), start.point]);
  result.bypassedPath = cleanPath([start.point, ...baseline.slice(start.segment + 1, end.segment + 1), end.point]);
  result.afterPath = cleanPath([end.point, ...baseline.slice(end.segment + 1)]);
  result.possiblyBypassedStopIds = direction.stops.filter(stop => {
    const point: Coordinate = [stop.lat, stop.lon];
    const onBaseline = project(point, baseline), onDetour = project(point, result.path);
    return onBaseline !== null && onDetour !== null && !onBaseline.ambiguous
      && onBaseline.distance <= 35 && onDetour.distance > 35
      && onBaseline.along > start.along + 0.1 && onBaseline.along < end.along - 0.1;
  }).map(stop => stop.id);
  return result;
}

/** Evenly spaced visual route dots, including both ends. These are not stops. */
export function samplePathPoints(path: Coordinate[], spacingMeters: number, maxPoints = 200): Coordinate[] {
  if (!Number.isFinite(spacingMeters) || spacingMeters <= 0 || !Number.isFinite(maxPoints) || maxPoints < 1) return [];
  const points = cleanPath(path);
  const cap = Math.floor(maxPoints);
  if (points.length < 2 || cap === 1) return points.slice(0, cap);
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  const total = cumulative[cumulative.length - 1];
  const intervals = Math.min(Math.ceil(total / spacingMeters), cap - 1);
  const sampled: Coordinate[] = [];
  let segment = 0;
  for (let i = 0; i <= intervals; i += 1) {
    const target = i * total / intervals;
    while (segment < points.length - 2 && cumulative[segment + 1] < target) segment += 1;
    const fraction = (target - cumulative[segment]) / (cumulative[segment + 1] - cumulative[segment]);
    sampled.push(interpolate(points[segment], points[segment + 1], fraction));
  }
  sampled[0] = [...points[0]];
  sampled[sampled.length - 1] = [...points[points.length - 1]];
  return sampled;
}
