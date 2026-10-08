import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessStop } from '../domain/impact';
import { collectFeed } from './collect';
import * as normalization from './normalize';
import { SOURCES, type RawFeed } from './normalize';
import { normalizeSnapshot } from './snapshot';
import { validateLiveFeed } from './validate';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const { route } = normalizeSnapshot(JSON.parse(readFileSync(new URL('../../public/data/route9-snapshot.json', import.meta.url), 'utf8')));
const firstRetrieval = '2026-10-08T02:46:00.000Z';
const collectedAt = '2026-10-08T02:47:00.000Z';
function captured(): RawFeed {
  return {
    detours: { fetchedAt: firstRetrieval, value: JSON.parse(fixture('detours.json')) },
    legacy: { fetchedAt: '2026-10-08T02:46:01.000Z', value: JSON.parse(fixture('legacy-alerts.json')) },
    northbound: { fetchedAt: '2026-10-08T02:46:02.000Z', value: fixture('northbound.kml') },
    southbound: { fetchedAt: '2026-10-08T02:46:03.000Z', value: fixture('southbound.kml') },
  };
}
afterEach(() => vi.restoreAllMocks());

describe('publication after each completed collection', () => {
  it('publishes valid alerts with collection order separate from the original source timestamps', () => {
    const raw = captured();
    const feed = collectFeed(raw, route, collectedAt);
    expect(validateLiveFeed(feed)).toBe(feed);
    expect(feed.complete).toBe(true);
    expect(feed.alerts).toHaveLength(5);
    expect(feed.alerts.find(alert => alert.id === 'D16046')?.skippedStopIds).toEqual(['30576']);
    expect(feed.collectedAt).toBe(collectedAt);
    expect(feed.fetchedAt).toBe(firstRetrieval);
    expect(feed.sources.map(source => source.fetchedAt)).toEqual(Object.values(raw).map(source => source.fetchedAt));
  });

  it('publishes an explicit incomplete state when normalized records fail schema validation', () => {
    const raw = captured();
    const detours = raw.detours.value as Record<string, unknown>[];
    detours.push({ ...detours[0] });
    const feed = collectFeed(raw, route, collectedAt);
    expect(validateLiveFeed(feed)).toBe(feed);
    expect(feed.complete).toBe(false);
    expect(feed.alerts).toEqual([]);
    expect(feed.collectedAt).toBe(collectedAt);
    expect(feed.fetchedAt).toBe(firstRetrieval);
    expect(feed.sources.every(source => source.ok)).toBe(true);
    expect(feed.sources.map(source => source.fetchedAt)).toEqual(Object.values(raw).map(source => source.fetchedAt));
    expect(feed.warnings.join(' ')).toContain('duplicate records');
    expect(feed.warnings.join(' ')).toContain('does not mean there are no disruptions');
    expect(assessStop({ feed, route, directionId: '1', stopId: '30576', now: new Date(collectedAt) }).status).toBe('unknown');
  });

  it('preserves successful retrievals and actual request failures when normalization throws', () => {
    const raw = captured();
    raw.legacy = { fetchedAt: null, error: 'HTTP 503' };
    vi.spyOn(normalization, 'normalizeFeed').mockImplementation(() => { throw new Error('Unexpected agency document structure'); });
    const feed = collectFeed(raw, route, collectedAt);
    expect(feed.complete).toBe(false);
    expect(feed.alerts).toEqual([]);
    expect(feed.fetchedAt).toBe(firstRetrieval);
    expect(feed.collectedAt).toBe(collectedAt);
    expect(feed.sources.find(source => source.url === SOURCES.legacy)).toMatchObject({ ok: false, fetchedAt: null, error: 'HTTP 503' });
    expect(feed.sources.find(source => source.url === SOURCES.detours)).toMatchObject({ ok: true, fetchedAt: firstRetrieval });
    expect(feed.warnings.join(' ')).toContain('Unexpected agency document structure');
  });

  it('preserves a per-source parse failure when another source causes envelope validation to fail', () => {
    const raw = captured();
    const detours = raw.detours.value as Record<string, unknown>[];
    detours.push({ ...detours[0] });
    raw.northbound.value = '<not-kml />';
    const feed = collectFeed(raw, route, collectedAt);
    expect(feed.complete).toBe(false);
    expect(feed.sources.find(source => source.url === SOURCES.northbound)).toMatchObject({
      ok: false, fetchedAt: raw.northbound.fetchedAt, error: 'The map response does not contain a KML document.',
    });
  });

  it('keeps ordinary incomplete feeds and surviving alerts without pretending the whole collection failed parsing', () => {
    const raw = captured();
    raw.detours = { fetchedAt: null, error: 'Request timed out' };
    const feed = collectFeed(raw, route, collectedAt);
    expect(feed.complete).toBe(false);
    expect(feed.alerts.some(alert => alert.id === 'D16046')).toBe(true);
    expect(feed.fetchedAt).toBe(raw.legacy.fetchedAt);
    expect(feed.warnings.join(' ')).not.toContain('Collection validation failed');
  });

  it('publishes total outages with current collection order and no invented fresh source time', () => {
    const raw = captured();
    for (const key of Object.keys(SOURCES) as (keyof RawFeed)[]) raw[key] = { fetchedAt: null, error: 'Network unavailable' };
    const feed = collectFeed(raw, route, collectedAt);
    expect(feed.complete).toBe(false);
    expect(feed.alerts).toEqual([]);
    expect(feed.fetchedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(feed.collectedAt).toBe(collectedAt);
    expect(feed.sources.every(source => !source.ok && source.fetchedAt === null)).toBe(true);
  });

  it('does not hide caller errors or synthesize missing source results', () => {
    expect(() => collectFeed(captured(), route, 'not-a-date')).toThrow('collection time');
    const missing = captured();
    delete (missing as Partial<RawFeed>).legacy;
    expect(() => collectFeed(missing, route, collectedAt)).toThrow('missing a configured source');
  });
});
