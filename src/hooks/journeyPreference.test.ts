import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteData } from '../domain/types';
import { JOURNEY_STORAGE_KEY, readJourneyPreference, resolveJourney, writeJourneyPreference, type JourneyPreference, type JourneyStorage } from './journeyPreference';
import { useSavedJourney } from './useSavedJourney';

const route: RouteData = {
  id: '9', name: 'Route 9', sourceUrl: 'https://www.septa.org/', feedVersion: 'example', validFrom: '2026-09-27', validThrough: '2027-02-20',
  directions: [
    { id: '0', label: 'Southbound', headsign: '4th-Walnut', shape: [], stops: [
      { id: 'south-first', name: 'South first', lat: 40, lon: -75 },
      { id: 'south-second', name: 'South second', lat: 40, lon: -75 },
    ] },
    { id: '1', label: 'Northbound', headsign: 'Andorra', shape: [], stops: [
      { id: 'north-first', name: 'North first', lat: 40, lon: -75 },
      { id: '30576', name: 'Schuylkill & JFK', lat: 40, lon: -75 },
    ] },
  ],
};
const preference: JourneyPreference = { version: 1, routeId: '9', directionId: '0', stopId: 'south-second' };
function memoryStorage(initial?: string): JourneyStorage {
  const values = new Map<string, string>(initial === undefined ? [] : [[JOURNEY_STORAGE_KEY, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}
afterEach(() => vi.unstubAllGlobals());

describe('saved journey validation', () => {
  it('restores the exact saved direction and stop after a save and reload', () => {
    const storage = memoryStorage();
    expect(writeJourneyPreference(preference, storage)).toBe(true);
    const restored = resolveJourney(route, readJourneyPreference(storage));
    expect(restored?.direction.id).toBe('0');
    expect(restored?.stop.id).toBe('south-second');
  });

  it.each(['not json', 'null', '[]', '{}', '{"version":0}', '{"version":2,"routeId":"9","directionId":"0","stopId":"south-second"}',
    '{"version":1,"routeId":"9","directionId":0,"stopId":"south-second"}',
    '{"version":1,"routeId":"9","directionId":"east","stopId":"south-second"}',
    '{"version":1,"routeId":"9","directionId":"0","stopId":null}',
  ])('ignores malformed or unsupported saved data: %s', (serialized) => {
    const storage = memoryStorage(serialized);
    expect(readJourneyPreference(storage)).toBeNull();
    expect(resolveJourney(route, readJourneyPreference(storage))?.stop.id).toBe('30576');
  });

  it('keeps a valid saved direction when its saved stop was removed from the latest route', () => {
    const selected = resolveJourney(route, { ...preference, stopId: 'removed-stop' });
    expect(selected?.direction.id).toBe('0');
    expect(selected?.stop.id).toBe('south-first');
  });

  it('never restores an opposite-direction stop or another route’s saved journey', () => {
    expect(resolveJourney(route, { ...preference, stopId: '30576' })?.stop.id).toBe('south-first');
    const anotherRoute = resolveJourney(route, { ...preference, routeId: '27' });
    expect(anotherRoute?.direction.id).toBe('1');
    expect(anotherRoute?.stop.id).toBe('30576');
  });

  it('uses available fallback stops and handles missing or empty directions', () => {
    const northOnly = { ...route, directions: [{ ...route.directions[1], stops: [route.directions[1].stops[0]] }] };
    expect(resolveJourney(northOnly, preference)?.stop.id).toBe('north-first');
    expect(resolveJourney({ ...route, directions: [route.directions[0]] }, null)?.stop.id).toBe('south-first');
    expect(resolveJourney({ ...route, directions: [{ ...route.directions[1], stops: [] }, route.directions[0]] }, null)?.direction.id).toBe('0');
    expect(resolveJourney({ ...route, directions: [] }, null)).toBeNull();
  });

  it('never stores or restores replay time, inspection state, or arbitrary extra fields', () => {
    const extra = { ...preference, mode: 'replay', replayTime: '2026-10-07T21:54', inspectedAlertId: 'D17345', privateNote: 'not part of the preference' };
    const storage = memoryStorage(JSON.stringify(extra));
    expect(readJourneyPreference(storage)).toEqual(preference);
    expect(writeJourneyPreference(extra, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(JOURNEY_STORAGE_KEY)!)).toEqual(preference);
  });
});

describe('unavailable storage and route loading', () => {
  it('continues with safe defaults when storage cannot be read or written', () => {
    const brokenStorage: JourneyStorage = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Quota exceeded'); } };
    expect(readJourneyPreference(brokenStorage)).toBeNull();
    expect(writeJourneyPreference(preference, brokenStorage)).toBe(false);
    expect(readJourneyPreference(null)).toBeNull();
    expect(writeJourneyPreference(preference, null)).toBe(false);
  });

  it('handles browsers that throw when accessing localStorage itself', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('SecurityError'); } });
    expect(readJourneyPreference()).toBeNull();
    expect(writeJourneyPreference(preference)).toBe(false);
  });

  function Probe({ data }: { data?: RouteData }) {
    const { direction, stop } = useSavedJourney(data);
    return createElement('span', null, direction && stop ? `${direction.id}:${stop.id}` : 'loading');
  }

  it('renders without window in SSR and tests', () => {
    vi.stubGlobal('window', undefined);
    expect(renderToStaticMarkup(createElement(Probe, { data: route }))).toBe('<span>1:30576</span>');
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>loading</span>');
  });

  it('does not overwrite a valid saved journey with defaults while route data is unavailable', () => {
    const serialized = JSON.stringify(preference);
    const storage = memoryStorage(serialized);
    const save = vi.spyOn(storage, 'setItem');
    vi.stubGlobal('window', { localStorage: storage });
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>loading</span>');
    expect(storage.getItem(JOURNEY_STORAGE_KEY)).toBe(serialized);
    expect(renderToStaticMarkup(createElement(Probe, { data: route }))).toBe('<span>0:south-second</span>');
    expect(save).not.toHaveBeenCalled();
  });
});
