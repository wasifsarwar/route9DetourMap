import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeFeed, type RawFeed } from '../data/normalize';
import { normalizeSnapshot } from '../data/snapshot';
import { buildDetourTrace, samplePathPoints } from './mapGeometry';
import type { Coordinate, DetourAlert, RouteDirection } from './types';

const fixture = (name: string) => readFileSync(new URL(`../data/fixtures/${name}`, import.meta.url), 'utf8');
const recorded = normalizeSnapshot(JSON.parse(readFileSync(new URL('../../public/data/route9-snapshot.json', import.meta.url), 'utf8')));
const capturedAt = '2026-10-08T02:46:41.000Z';
const sources: RawFeed = {
  detours: { fetchedAt: capturedAt, value: JSON.parse(fixture('detours.json')) },
  legacy: { fetchedAt: capturedAt, value: JSON.parse(fixture('legacy-alerts.json')) },
  northbound: { fetchedAt: capturedAt, value: fixture('northbound.kml') },
  southbound: { fetchedAt: capturedAt, value: fixture('southbound.kml') },
};
const currentFeed = normalizeFeed(sources, recorded.route);
const northbound = recorded.route.directions.find(direction => direction.id === '1')!;
const sinkhole = currentFeed.alerts.find(alert => alert.id === 'D17345')!;
const reviewedSinkhole = recorded.feed.alerts.find(alert => alert.id === 'D17345')!;

function simpleDirection(): RouteDirection {
  return {
    id: '1', label: 'Northbound', headsign: 'Example', shape: [[40, -75], [40, -74.99]],
    stops: [
      { id: 'middle', name: 'Middle', lat: 40, lon: -74.995 },
      { id: 'start', name: 'At the start', lat: 40, lon: -74.998 },
      { id: 'end', name: 'At the end', lat: 40, lon: -74.992 },
      { id: 'outside', name: 'Before the detour', lat: 40, lon: -74.999 },
      { id: 'near-detour', name: 'Near the detour', lat: 40, lon: -74.9978 },
      { id: 'off-baseline', name: 'Away from the scheduled route', lat: 40.002, lon: -74.995 },
    ],
  };
}

function simpleAlert(): DetourAlert {
  return {
    id: 'example', title: 'Detour', directionIds: ['1'], startsAt: null, endsAt: null, schedule: null,
    rawText: 'NB via First, Right on Second, Left on Third, Reg Rt', sourceUrl: 'https://www.septa.org/',
    timingIssues: [], geometryIssues: [], sourceIssues: [], skippedStopIds: [], stopCoverage: 'unknown',
    geometry: [[[40, -74.998], [40.002, -74.998], [40.002, -74.992], [40, -74.992]]], unservedGeometry: [],
  };
}

describe('detour drawing geometry', () => {
  it('uses the matching reviewed Sink Hole path and marks only real baseline stops as possibly bypassed', () => {
    const untouched = structuredClone({ northbound, sinkhole, reviewedSinkhole });
    const trace = buildDetourTrace(northbound, sinkhole, reviewedSinkhole);
    expect(trace.kind).toBe('interpreted');
    expect(trace.path).toEqual(reviewedSinkhole.candidateGeometry);
    expect(trace.bypassedPath.length).toBeGreaterThan(2);
    expect(trace.possiblyBypassedStopIds).toEqual(['14880', '14881', '14882']);
    expect(trace.possiblyBypassedStopIds.every(id => northbound.stops.some(stop => stop.id === id))).toBe(true);
    expect(trace.issues.join(' ')).toContain('not been verified');
    expect(sinkhole.skippedStopIds).toEqual([]);
    expect({ northbound, sinkhole, reviewedSinkhole }).toEqual(untouched);
  });

  it('normalizes punctuation and written turn abbreviation expansion for reviewed paths', () => {
    const expanded = { ...sinkhole, rawText: sinkhole.rawText.replace(/\bR\s*-/g, 'Right on').replace(/\bL\s*-/g, 'Left on') };
    expect(buildDetourTrace(northbound, expanded, reviewedSinkhole).kind).toBe('interpreted');
  });

  it('does not reuse reviewed geometry when the street instructions or direction change', () => {
    expect(buildDetourTrace(northbound, { ...sinkhole, rawText: sinkhole.rawText.replace('9th', '10th') }, reviewedSinkhole).kind).toBe('unavailable');
    expect(buildDetourTrace({ ...northbound, id: '0' }, sinkhole, reviewedSinkhole).path).toEqual([]);
    expect(buildDetourTrace(northbound, sinkhole, { ...reviewedSinkhole, directionIds: ['0'] }).kind).toBe('unavailable');
    expect(buildDetourTrace(northbound, sinkhole).kind).toBe('unavailable');
  });

  it('projects endpoints onto sparse baseline segments rather than picking distant vertices', () => {
    const direction = simpleDirection();
    const trace = buildDetourTrace(direction, simpleAlert());
    expect(trace.kind).toBe('agency');
    expect(trace.bypassedPath).toHaveLength(2);
    expect(trace.bypassedPath[0][1]).toBeCloseTo(-74.998, 6);
    expect(trace.bypassedPath[1][1]).toBeCloseTo(-74.992, 6);
    expect(trace.beforePath[0]).toEqual(direction.shape[0]);
    expect(trace.afterPath.at(-1)).toEqual(direction.shape.at(-1));
    expect(trace.beforePath.at(-1)).toEqual(trace.bypassedPath[0]);
    expect(trace.afterPath[0]).toEqual(trace.bypassedPath.at(-1));
    expect(trace.possiblyBypassedStopIds).toEqual(['middle']);
  });

  it('withholds a reviewed interpretation when current sources disagree about the instructions', () => {
    const disputed = { ...sinkhole, sourceIssues: ['The service-notice feed gives different turns.'] };
    const trace = buildDetourTrace(northbound, disputed, reviewedSinkhole);
    expect(trace.kind).toBe('unavailable');
    expect(trace.path).toEqual([]);
    expect(trace.bypassedPath).toEqual([]);
    expect(trace.possiblyBypassedStopIds).toEqual([]);
  });

  it('never infers bypassed stops from a closed loop, conflicting source, or disputed geometry', () => {
    const direction = simpleDirection(), alert = simpleAlert();
    const loop = [...alert.geometry[0], alert.geometry[0][0]];
    for (const changed of [
      { ...alert, geometry: [loop] },
      { ...alert, geometryIssues: ['The published path is inconsistent.'] },
      { ...alert, sourceIssues: ['Sources disagree.'] },
      { ...alert, geometry: [alert.geometry[0], alert.geometry[0]] },
    ]) {
      const trace = buildDetourTrace(direction, changed);
      expect(trace.kind).toBe('unavailable');
      expect(trace.path).toEqual([]);
      expect(trace.bypassedPath).toEqual([]);
      expect(trace.possiblyBypassedStopIds).toEqual([]);
      expect(trace.beforePath).toEqual(direction.shape);
    }
  });

  it('keeps geometry without a baseline replacement when anchors are distant, reversed, or ambiguous', () => {
    const direction = simpleDirection(), alert = simpleAlert();
    const distant = { ...alert, geometry: [alert.geometry[0].map(([lat, lon]): Coordinate => [lat + 0.01, lon])] };
    const reversed = { ...alert, geometry: [[...alert.geometry[0]].reverse()] };
    const repeatedBaseline = { ...direction, shape: [...direction.shape, ...direction.shape] };
    for (const [route, notice] of [[direction, distant], [direction, reversed], [repeatedBaseline, alert]] as const) {
      const trace = buildDetourTrace(route, notice);
      expect(trace.kind).toBe('agency');
      expect(trace.path.length).toBeGreaterThan(1);
      expect(trace.bypassedPath).toEqual([]);
      expect(trace.possiblyBypassedStopIds).toEqual([]);
      expect(trace.issues).not.toEqual([]);
    }
  });

  it('rejects invalid points without creating a shortcut across them', () => {
    const alert = simpleAlert();
    alert.geometry[0].splice(1, 0, [NaN, -75]);
    expect(buildDetourTrace(simpleDirection(), alert).path).toEqual([]);
  });
});

describe('decorative route point sampling', () => {
  it('samples by arc length through corners with no gaps, duplicate endpoints, or fabricated stop data', () => {
    const path: Coordinate[] = [[0, 0], [0, 0], [0, 0.001], [0.001, 0.001]];
    const points = samplePathPoints(path, 20);
    expect(points).toHaveLength(13);
    expect(points[0]).toEqual(path[0]);
    expect(points.at(-1)).toEqual(path.at(-1));
    expect(new Set(points.map(point => point.join(','))).size).toBe(points.length);
    for (let i = 0; i < points.length; i += 1) {
      const [lat, lon] = points[i];
      expect(lat === 0 || Math.abs(lon - 0.001) < 1e-10).toBe(true);
      if (i > 0) {
        const [beforeLat, beforeLon] = points[i - 1];
        expect(Math.hypot(lat - beforeLat, lon - beforeLon) * 111_320).toBeLessThanOrEqual(20);
      }
      expect(points[i]).toHaveLength(2);
    }
  });

  it('caps point counts while preserving the endpoints and handles degenerate input', () => {
    const path: Coordinate[] = [[40, -75], [40.01, -75]];
    const sampled = samplePathPoints(path, 1, 8);
    expect(sampled).toHaveLength(8);
    expect(sampled[0]).toEqual(path[0]);
    expect(sampled.at(-1)).toEqual(path.at(-1));
    expect(samplePathPoints([[40, -75], [40, -75]], 25)).toEqual([[40, -75]]);
    expect(samplePathPoints(path, 25, 1)).toEqual([path[0]]);
    expect(samplePathPoints([], 25)).toEqual([]);
    expect(samplePathPoints(path, 0)).toEqual([]);
    expect(samplePathPoints([[40, -75], [NaN, -75], [40.01, -75]], 25)).toEqual([]);
  });
});
