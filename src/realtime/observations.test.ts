import { describe, expect, it } from 'vitest';
import { retainObservations, observationKey, distanceToPaths } from './observations';
import type { LiveBus } from './types';
const now = 1791480000000;
const p: LiveBus = { id: '12', tripId: 'a', directionId: '0', lat: 40, lon: -75.2, reportedAt: now, bearing: null };
describe('bus review evidence', () => {
  it('deduplicates repeated timestamps while keeping separate trips and directions', () => {
    const points = retainObservations([p], [p, {...p,tripId:'b'}, {...p,directionId:'1'}], now);
    expect(points).toHaveLength(3);
    expect(new Set(points.map(observationKey)).size).toBe(3);
  });
  it('keeps exact off-route coordinates and timestamp gaps without interpolation', () => {
    const next = {...p, lat: 40.01, lon: -75.19, reportedAt: now + 180000};
    expect(retainObservations([p], [next], now+180000)).toEqual([p,next]);
  });
  it('drops old retained data and rejects stale or future incoming data', () => {
    expect(retainObservations([{...p,reportedAt:now-3600001}], [{...p,reportedAt:now-121000}, {...p,reportedAt:now+31000}], now)).toEqual([]);
  });
  it('caps memory and orders observations by source timestamp', () => {
    const many=Array.from({length:5002},(_,i)=>({...p,reportedAt:now-i}));
    const result=retainObservations([],many,now);
    expect(result).toHaveLength(5000); expect(result.at(-1)?.reportedAt).toBe(now);
  });
  it('compares real segments without bridging separate paths', () => {
    expect(distanceToPaths([40,-75.2], [[[40,-75.3],[40,-75.1]]])).toBe(0);
    expect(distanceToPaths([40,-75.2], [[[40,-75.3],[40,-75.25]],[[40,-75.15],[40,-75.1]]])!).toBeGreaterThan(4000);
    expect(distanceToPaths([40,-75.2], [])).toBeNull();
  });
});
