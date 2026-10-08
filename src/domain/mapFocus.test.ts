import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeFeed, type RawFeed } from '../data/normalize';
import { normalizeSnapshot } from '../data/snapshot';
import { getAutomaticMapFocus, getStopFocusPoints, resolveMapInspection, type MapInspection } from './mapFocus';
import type { Coordinate, DetourAlert, EvaluatedAlert, RouteDirection, Stop } from './types';

const snapshot = normalizeSnapshot(JSON.parse(readFileSync(new URL('../../public/data/route9-snapshot.json', import.meta.url), 'utf8')));
const fixture = (name: string) => readFileSync(new URL(`../data/fixtures/${name}`, import.meta.url), 'utf8');
const fetchedAt = '2026-10-08T02:46:41.000Z';
const sources: RawFeed = {
  detours: { fetchedAt, value: JSON.parse(fixture('detours.json')) },
  legacy: { fetchedAt, value: JSON.parse(fixture('legacy-alerts.json')) },
  northbound: { fetchedAt, value: fixture('northbound.kml') },
  southbound: { fetchedAt, value: fixture('southbound.kml') },
};
const feed = normalizeFeed(sources, snapshot.route);
const northbound = snapshot.route.directions.find(direction => direction.id === '1')!;
const evaluated = feed.alerts.map((alert): EvaluatedAlert => ({ alert, timing: 'active', affectsSelectedStop: false, reason: '' }));

function setup(): { direction: RouteDirection; alert: DetourAlert; stop: Stop; item: EvaluatedAlert } {
  const stop: Stop = { id: 'middle', name: 'Middle', lat: 40, lon: -74.995 };
  const direction: RouteDirection = { id: '1', label: 'Northbound', headsign: 'Example', shape: [[40, -75], [40, -74.99]], stops: [stop] };
  const alert: DetourAlert = {
    id: 'local', title: 'Local detour', directionIds: ['1'], startsAt: null, endsAt: null, schedule: null,
    rawText: 'NB via First, Right on Second, Left on Third, Reg Rt', sourceUrl: 'https://www.septa.org/',
    timingIssues: [], geometryIssues: [], sourceIssues: [], skippedStopIds: [], stopCoverage: 'unknown',
    geometry: [[[40, -74.998], [40.002, -74.998], [40.002, -74.992], [40, -74.992]]], unservedGeometry: [],
  };
  return { direction, alert, stop, item: { alert, timing: 'active', affectsSelectedStop: false, reason: '' } };
}

describe('automatic map context', () => {
  it('focuses the actual Schuylkill/JFK notice despite its missing geometry instead of the first mapped Sink Hole', () => {
    const stop = northbound.stops.find(item => item.id === '30576')!;
    const focus = getAutomaticMapFocus(northbound, stop, evaluated, snapshot.feed.alerts);
    expect(focus).toEqual({ alertId: 'D16046', reason: 'listed-stop' });
    expect(feed.alerts.find(alert => alert.id === focus.alertId)?.geometry).toEqual([]);
    expect(getStopFocusPoints(stop, [])).toEqual([[stop.lat, stop.lon]]);
  });

  it('selects Sink Hole only for a stop on its reviewed illustrated bypass, without changing the assessment', () => {
    const stop = northbound.stops.find(item => item.id === '14881')!;
    const original = structuredClone(evaluated);
    expect(getAutomaticMapFocus(northbound, stop, evaluated, snapshot.feed.alerts))
      .toEqual({ alertId: 'D17345', reason: 'illustrated-bypass' });
    expect(evaluated).toEqual(original);
    expect(feed.alerts.find(alert => alert.id === 'D17345')?.skippedStopIds).toEqual([]);
  });

  it('leaves a distant stop without a focused detour rather than defaulting to the first map', () => {
    const stop = northbound.stops.at(-1)!;
    expect(getAutomaticMapFocus(northbound, stop, evaluated, snapshot.feed.alerts)).toEqual({ alertId: null, reason: 'none' });
  });

  it('prioritizes a named stop closure over nearby geometry even without a drawn path', () => {
    const { direction, stop, alert, item } = setup();
    const closure: EvaluatedAlert = { ...item, alert: { ...alert, id: 'closure', geometry: [], skippedStopIds: [stop.id], stopCoverage: 'partial-list' } };
    expect(getAutomaticMapFocus(direction, stop, [item, closure])).toEqual({ alertId: 'closure', reason: 'listed-stop' });
  });

  it('does not focus expired notices, notices for the opposite direction, or invalid stop selections', () => {
    const { direction, stop, alert, item } = setup();
    const named = { ...alert, skippedStopIds: [stop.id] };
    expect(getAutomaticMapFocus(direction, stop, [{ ...item, alert: named, timing: 'inactive' }]).alertId).toBeNull();
    expect(getAutomaticMapFocus(direction, stop, [{ ...item, alert: { ...named, directionIds: ['0'] } }]).alertId).toBeNull();
    expect(getAutomaticMapFocus(direction, { ...stop, id: 'different-route' }, [item]).alertId).toBeNull();
  });

  it('allows proximity only around a connected valid detour and does not treat questionable nearby lines as relevance', () => {
    const { direction, alert, item } = setup();
    const stop: Stop = { id: 'endpoint', name: 'Detour start', lat: 40, lon: -74.998 };
    direction.stops.push(stop);
    expect(getAutomaticMapFocus(direction, stop, [item])).toEqual({ alertId: 'local', reason: 'nearby-path' });
    expect(getAutomaticMapFocus(direction, stop, [{ ...item, alert: { ...alert, geometryIssues: ['Unreliable path'] } }]).alertId).toBeNull();
    const disconnected: Coordinate[][] = [[[40.0003, -74.998], [40.0003, -74.994]]];
    expect(getAutomaticMapFocus(direction, stop, [{ ...item, alert: { ...alert, geometry: disconnected.map(path => path.map(([lat, lon]): Coordinate => [lat + 0.001, lon])) } }]).alertId).toBeNull();
  });
});

describe('manual inspection scope', () => {
  const previous: MapInspection = { selectionKey: '1:14881', request: 3, alertId: 'D17345' };
  it('keeps explicit inspection while the stop remains selected', () => {
    expect(resolveMapInspection(previous, '1:14881', 3, 'D17345')).toBe(previous);
  });
  it('clears stale manual inspection when the stop or direction changes', () => {
    expect(resolveMapInspection(previous, '1:30576', 3, 'D17345').alertId).toBeNull();
    expect(resolveMapInspection(previous, '0:14881', 3, 'D17345').alertId).toBeNull();
  });
  it('honors a new explicit request, including another click on the same alert', () => {
    expect(resolveMapInspection(previous, '1:30576', 4, 'D17345')).toEqual({ selectionKey: '1:30576', request: 4, alertId: 'D17345' });
    expect(resolveMapInspection(previous, '1:14881', 4, 'D17345').request).toBe(4);
  });
});

describe('bounded automatic viewport', () => {
  const stop: Stop = { id: 'origin', name: 'Origin', lat: 0, lon: 0 };
  it('includes the selected stop and a local detour without pulling in remote vertices', () => {
    const points = getStopFocusPoints(stop, [[[0, 0.002], [0.005, 0.002], [0.005, 0.1]]], 500);
    expect(points[0]).toEqual([0, 0]);
    expect(points.length).toBeGreaterThan(1);
    expect(points.every(([lat, lon]) => Math.hypot(lat, lon) * 111_194.93 <= 500.01)).toBe(true);
    expect(points).not.toContainEqual([0.005, 0.1]);
  });
  it('clips a sparse segment passing through the neighborhood even when both vertices are remote', () => {
    const points = getStopFocusPoints(stop, [[[0, -0.1], [0, 0.1]]], 500);
    expect(points).toHaveLength(3);
    expect(points[1][1]).toBeCloseTo(-0.0044966, 6);
    expect(points[2][1]).toBeCloseTo(0.0044966, 6);
  });
  it('ignores completely remote paths and invalid coordinates', () => {
    expect(getStopFocusPoints(stop, [[[1, 1], [1.1, 1.1]], [[NaN, 0], [0, 0.1]]])).toEqual([[0, 0]]);
    expect(getStopFocusPoints(stop, [], -1)).toEqual([[0, 0]]);
  });
});
