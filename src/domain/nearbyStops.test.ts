import { describe, expect, it } from 'vitest';
import { nearbyStops, validFix, distanceLabel, walkingTimeLabel } from './nearbyStops';
const now = 1000000;
const fix = { lat: 40, lon: -75, accuracy: 20, timestamp: now };
const stop = (id: string, offset: number) => ({ id, name: id, lat: 40 + offset, lon: -75 });
describe('nearby stops', () => {
  it('sorts by distance, caps at three, and excludes distant stops', () => {
    const result = nearbyStops([stop('far', .02), stop('third', .003), stop('second', .002), stop('first', .001), stop('fourth', .004)], fix, now);
    expect(result.map(item => item.stop.id)).toEqual(['first', 'second', 'third']);
    expect(result[0].meters).toBeCloseTo(111.195, 1);
  });
  it('returns none outside Route 9 and does not mutate route order', () => {
    const stops = [stop('far', .1)];
    expect(nearbyStops(stops, fix, now)).toEqual([]);
    expect(stops[0].id).toBe('far');
  });
  it('rejects stale, invalid, future, and imprecise fixes', () => {
    for (const patch of [{ timestamp: now - 300001 }, { timestamp: now + 11000 }, { lat: NaN }, { lon: 181 }, { accuracy: 1001 }, { accuracy: -1 }]) {
      expect(validFix({ ...fix, ...patch }, now)).toBe(false);
      expect(nearbyStops([stop('here', 0)], { ...fix, ...patch }, now)).toEqual([]);
    }
  });
  it('uses rounded distances without implying an exact position', () => {
    expect(distanceLabel(0)).toBe('50 ft');
    expect(distanceLabel(1609.344)).toBe('1.0 mi');
  });
});

it('treats a Washington location as outside coverage, not a location failure', () => {
  const washington = { lat: 47.4, lon: -122.2, accuracy: 50, timestamp: now };
  expect(validFix(washington, now)).toBe(true);
  expect(nearbyStops([stop('Philadelphia stop', 0)], washington, now)).toEqual([]);
});

 it('estimates walking minutes from unrounded distance without claiming routed travel', () => {
  expect(walkingTimeLabel(0)).toBe('~1 min walk');
  expect(walkingTimeLabel(0.3 * 1609.344)).toBe('~7 min walk');
  expect(walkingTimeLabel(1609.344)).toBe('~23 min walk');
  expect(walkingTimeLabel(NaN)).toBe('Walk time unavailable');
  expect(walkingTimeLabel(-10)).toBe('Walk time unavailable');
});
