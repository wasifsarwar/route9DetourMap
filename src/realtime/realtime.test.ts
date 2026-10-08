import { describe, expect, it } from 'vitest';
import { normalizeRealtime } from './normalize';
import { arrivalsForStop, busesForDirection } from './select';
import { validateRealtime } from './client';
const now = Date.parse('2026-10-08T15:00:00Z'), seconds = now / 1000;
const trip = { routeId: '9', tripId: 'trip9', directionId: 0 };
const vehicle = { trip, vehicle: { id: '1234' }, position: { latitude: 40, longitude: -75.2 }, timestamp: seconds - 10 };
const update = { trip, vehicle: { id: '1234' }, stopTimeUpdate: [{ stopId: 'first', arrival: { time: seconds + 90 } }, { stopId: 'second', arrival: { time: seconds + 180 } }] };
const raw = (entity: unknown[], timestamp = seconds) => ({ header: { timestamp, incrementality: 'FULL_DATASET' }, entity });
const feeds = () => normalizeRealtime(raw([{ vehicle }]), raw([{ tripUpdate: update }]), now);
describe('SEPTA live bus and arrival normalization', () => {
  it('keeps explicit southbound identity and predicted stop times', () => {
    const feed = feeds(); expect(feed.vehicles).toHaveLength(1); expect(feed.predictions).toHaveLength(2);
    expect(busesForDirection(feed, '0', now)).toHaveLength(1); expect(busesForDirection(feed, '1', now)).toEqual([]);
    expect(arrivalsForStop(feed, '0', 'second', now)[0].arrivalAt).toBe(now + 180000);
    expect(arrivalsForStop(feed, '1', 'second', now)).toEqual([]);
  });
  it('requires actual route and direction, not geographic heading', () => {
    const feed = normalizeRealtime(raw([{ vehicle: { ...vehicle, trip: { ...trip, directionId: undefined } } }, { vehicle: { ...vehicle, trip: { ...trip, routeId: '19' } } }]), raw([]), now);
    expect(feed.vehicles).toEqual([]);
  });
  it('excludes placeholder IDs and old, future, or missing GPS timestamps', () => {
    for (const replacement of [{ vehicle: { id: 'None' } }, { vehicle: { id: '' } }, { timestamp: seconds - 121 }, { timestamp: seconds + 31 }, { timestamp: undefined }, { position: { latitude: 0, longitude: 0 } }]) {
      expect(normalizeRealtime(raw([{ vehicle: { ...vehicle, ...replacement } }]), raw([]), now).vehicles).toEqual([]);
    }
  });
  it('independently handles unavailable and stale upstream feeds', () => {
    const feed = normalizeRealtime(raw([{ vehicle }]), raw([{ tripUpdate: update }], seconds - 121), now);
    expect(feed.vehicles).toHaveLength(1); expect(feed.predictions).toEqual([]); expect(feed.warnings).toHaveLength(1);
    expect(normalizeRealtime(null, raw([{ tripUpdate: update }]), now).predictions).toHaveLength(2);
  });
  it('does not label skipped, canceled, missing-time, or NO_DATA updates as arrivals', () => {
    for (const stop of [{ stopId: 'first', scheduleRelationship: 'SKIPPED', arrival: { time: seconds + 90 } }, { stopId: 'first', scheduleRelationship: 'NO_DATA', arrival: { time: seconds + 90 } }, { stopId: 'first', arrival: { delay: 30 } }]) {
      const f = normalizeRealtime(raw([]), raw([{ tripUpdate: { ...update, stopTimeUpdate: [stop] } }]), now);
      expect(arrivalsForStop(f, '0', 'first', now)).toEqual([]);
    }
    const canceled = normalizeRealtime(raw([{ vehicle }]), raw([{ tripUpdate: { ...update, trip: { ...trip, scheduleRelationship: 'CANCELED' } } }]), now);
    expect(canceled.vehicles).toEqual([]); expect(canceled.predictions).toEqual([]);
  });
  it('ages out client-side even without another successful fetch', () => {
    expect(busesForDirection(feeds(), '0', now + 121000)).toEqual([]);
    expect(arrivalsForStop(feeds(), '0', 'second', now + 121000)).toEqual([]);
  });
  it('rejects malformed relay responses', () => {
    expect(validateRealtime(feeds())).toEqual(feeds());
    expect(() => validateRealtime({})).toThrow();
    expect(() => validateRealtime({ ...feeds(), predictions: [null] })).toThrow();
  });
});
