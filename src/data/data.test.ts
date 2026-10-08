import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeFeed, parseAgencyDate, parseKml, type RawFeed } from './normalize';
import { normalizeSnapshot } from './snapshot';
import { validateLiveFeed } from './validate';

const at = '2026-10-08T02:46:41.000Z';
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const snapshot = JSON.parse(readFileSync(new URL('../../public/data/route9-snapshot.json', import.meta.url), 'utf8')) as unknown;
const route = normalizeSnapshot(snapshot).route;
function captured(): RawFeed {
  return {
    detours: { fetchedAt: at, value: JSON.parse(fixture('detours.json')) },
    legacy: { fetchedAt: at, value: JSON.parse(fixture('legacy-alerts.json')) },
    northbound: { fetchedAt: at, value: fixture('northbound.kml') },
    southbound: { fetchedAt: at, value: fixture('southbound.kml') },
  };
}

describe('agency source normalization', () => {
  it('merges all five real notices, including the closure absent from the map feed', () => {
    const feed = normalizeFeed(captured(), route);
    expect(feed.complete).toBe(true);
    expect(feed.alerts.map(alert => alert.id).sort()).toEqual(['D16046', 'D16646', 'D16944', 'D17345', 'D17603']);
    const closure = feed.alerts.find(alert => alert.id === 'D16046')!;
    expect(closure.directionIds).toEqual(['1']);
    expect(closure.skippedStopIds).toEqual(['30576']);
    expect(closure.stopCoverage).toBe('partial-list');
    expect(closure.boardingNote?.precision).toBe('area-only');
    expect(closure.sourceIssues).toEqual([]);
    expect(closure.timingIssues).toEqual([]);
    expect(closure.geometry).toEqual([]);
  });

  it('retains each real timing conflict without hardcoding its alert ID', () => {
    const feed = normalizeFeed(captured(), route);
    expect(feed.alerts.find(alert => alert.id === 'D17603')?.timingIssues.join(' ')).toContain('2026-10-05');
    expect(feed.alerts.find(alert => alert.id === 'D16646')?.timingIssues.join(' ')).toContain('weekdays only');
    expect(feed.alerts.find(alert => alert.id === 'D16944')?.timingIssues.join(' ')).toContain('Sundays only');
    const raw = captured();
    const detours = raw.detours.value as Record<string, unknown>[];
    const peco = detours.find(alert => alert.detour_id === 'D17603')!;
    peco.raw_card_message = (peco.raw_card_message as string).replace('10/5/26', '10/8/26');
    expect(normalizeFeed(raw, route).alerts.find(alert => alert.id === 'D17603')?.timingIssues).toEqual([]);
  });

  it('preserves empty stop lists as unknown and warns about a loop and zero-length skipped segment', () => {
    const sinkhole = normalizeFeed(captured(), route).alerts.find(alert => alert.id === 'D17345')!;
    expect(sinkhole.stopCoverage).toBe('unknown');
    expect(sinkhole.skippedStopIds).toEqual([]);
    expect(sinkhole.geometryIssues.join(' ')).toContain('closed loop');
    expect(sinkhole.geometryIssues.join(' ')).toContain('identical endpoints');
    expect(sinkhole.timingIssues).toEqual([]);
    expect(normalizeFeed(captured(), route).alerts.find(alert => alert.id === 'D16944')?.geometryIssues.join(' ')).toContain('last named intersection');
    expect(sinkhole.geometry[0][0]).toEqual([39.9479, -75.1527]);
  });

  it('does not interpret a malformed response or legacy failure as no disruptions', () => {
    const raw = captured();
    raw.legacy = { fetchedAt: null, error: 'Upstream timeout' };
    const partial = normalizeFeed(raw, route);
    expect(partial.complete).toBe(false);
    expect(partial.sources.find(source => source.name === 'SEPTA service notices')?.ok).toBe(false);
    raw.detours = { fetchedAt: at, value: { error: 'upstream unavailable' } };
    expect(normalizeFeed(raw, route).complete).toBe(false);
    expect(normalizeFeed(raw, route).alerts).toEqual([]);
  });

  it('does not make successful alerts incomplete just because a map fails', () => {
    const raw = captured();
    raw.northbound = { fetchedAt: null, error: 'Map timeout' };
    const feed = normalizeFeed(raw, route);
    expect(feed.complete).toBe(true);
    expect(feed.alerts).toHaveLength(5);
    expect(feed.warnings.join(' ')).toContain('maps could not be loaded');
  });

  it('uses the oldest successful source retrieval as freshness, ignoring stale agency metadata', () => {
    const raw = captured();
    raw.legacy.fetchedAt = '2026-10-08T02:45:00.000Z';
    const feed = normalizeFeed(raw, route);
    expect(feed.fetchedAt).toBe('2026-10-08T02:45:00.000Z');
    expect(feed.fetchedAt).not.toContain('2023');
  });

  it('does not retain the reviewed closure mapping after the actual message changes', () => {
    const raw = captured();
    const notices = raw.legacy.value as Record<string, unknown>[];
    notices[0].detour_message = 'Northbound Route 9 service is delayed.';
    const alert = normalizeFeed(raw, route).alerts.find(alert => alert.id === 'D16046')!;
    expect(alert.skippedStopIds).toEqual([]);
    expect(alert.boardingNote).toBeUndefined();
  });

  it('keeps non-detour legacy advisories in the checked set', () => {
    const raw = captured();
    (raw.legacy.value as Record<string, unknown>[])[0].advisory_message = 'Route 9 may experience delays.';
    const feed = normalizeFeed(raw, route);
    expect(feed.alerts).toHaveLength(6);
    expect(feed.alerts.find(alert => alert.rawText.includes('may experience'))?.directionIds).toEqual(['0', '1']);
  });

  it('retains namespace-prefixed KML and rejects malformed XML or coordinates', () => {
    const xml = '<k:kml xmlns:k="http://www.opengis.net/kml/2.2"><k:Document><k:Folder><k:Placemark><k:name>PROD:DETOUR:D1</k:name><k:MultiGeometry><k:LineString><k:coordinates>-75,40,0 -75.1,40.1,0</k:coordinates></k:LineString></k:MultiGeometry></k:Placemark></k:Folder></k:Document></k:kml>';
    expect(parseKml(xml).D1.detour).toEqual([[[40, -75], [40.1, -75.1]]]);
    expect(() => parseKml('<html>broken')).toThrow();
    const invalid = parseKml(xml.replace('-75.1,40.1,0', 'NaN,40.1,0')).D1;
    expect(invalid.detour).toEqual([]);
    expect(invalid.warnings).not.toEqual([]);
  });
});

describe('agency local time and replay', () => {
  it('parses both schemas in Eastern time including summer/winter offsets', () => {
    expect(parseAgencyDate('10/07/2026, 19:27:22')).toBe('2026-10-07T23:27:22.000Z');
    expect(parseAgencyDate('9/9/2026   6:57 PM')).toBe('2026-09-09T22:57:00.000Z');
    expect(parseAgencyDate('1/9/2026   6:57 PM')).toBe('2026-01-09T23:57:00.000Z');
    expect(parseAgencyDate('2/30/2026   6:57 PM')).toBeNull();
    expect(parseAgencyDate('3/8/2026   2:30 AM')).toBeNull();
    expect(parseAgencyDate('11/1/2026   1:30 AM')).toBeNull();
    expect(parseAgencyDate('bad timestamp')).toBeNull();
  });
  it('keeps the old research data recorded and distinct from current service', () => {
    const normalized = normalizeSnapshot(snapshot);
    expect(normalized.feed.mode).toBe('snapshot');
    expect(normalized.route.validFrom).toBe('2026-09-27');
    expect(normalized.route.validThrough).toBe('2027-02-20');
    expect(normalized.route.directions.every(direction => direction.stops.length === 56)).toBe(true);
    expect(normalized.feed.alerts.find(alert => alert.id === 'D17345')?.candidateGeometry).toHaveLength(4);
  });
});


describe('published feed boundary validation', () => {
  it('accepts the normalized complete feed and an explicit partial feed', () => {
    expect(validateLiveFeed(normalizeFeed(captured(), route)).alerts).toHaveLength(5);
    const partial = captured();
    partial.legacy = { fetchedAt: null, error: 'Unavailable' };
    expect(validateLiveFeed(normalizeFeed(partial, route)).complete).toBe(false);
  });

  it.each([
    ['non-string warnings', (feed: Record<string, any>) => { feed.warnings = [{}]; }],
    ['invalid source entry', (feed: Record<string, any>) => { feed.sources[0] = null; }],
    ['unusable source timestamp', (feed: Record<string, any>) => { feed.sources[0].fetchedAt = 'tomorrow'; }],
    ['missing successful source timestamp', (feed: Record<string, any>) => { feed.sources[0].fetchedAt = null; }],
    ['invalid source URL', (feed: Record<string, any>) => { feed.sources[0].url = 'javascript:alert(1)'; }],
    ['wrong direction', (feed: Record<string, any>) => { feed.alerts[0].directionIds = ['east']; }],
    ['missing alert direction', (feed: Record<string, any>) => { feed.alerts[0].directionIds = []; }],
    ['invalid timestamp', (feed: Record<string, any>) => { feed.alerts[0].startsAt = 'not-a-date'; }],
    ['missing geometry warnings', (feed: Record<string, any>) => { delete feed.alerts[0].geometryIssues; }],
    ['non-string source issue', (feed: Record<string, any>) => { feed.alerts[0].sourceIssues = [5]; }],
    ['invalid nested coordinate', (feed: Record<string, any>) => { feed.alerts[0].geometry = [[[200, -75], [40, -75]]]; }],
    ['invalid unserved segment', (feed: Record<string, any>) => { feed.alerts[0].unservedGeometry = ['bad']; }],
    ['wrong operating day', (feed: Record<string, any>) => { feed.alerts[0].schedule.days = [7]; }],
    ['invalid window time', (feed: Record<string, any>) => { feed.alerts[0].schedule.startTime = '25:00'; }],
    ['invalid stop coverage', (feed: Record<string, any>) => { feed.alerts[0].stopCoverage = 'confirmed'; }],
    ['invalid candidate geometry', (feed: Record<string, any>) => { feed.alerts[0].candidateGeometry = [[40, null], [40, -75]]; }],
    ['invalid boarding precision', (feed: Record<string, any>) => { feed.alerts[4].boardingNote.precision = 'exact'; }],
    ['duplicate alert IDs', (feed: Record<string, any>) => { feed.alerts.push(feed.alerts[0]); }],
  ])('rejects %s without reaching render code', (_name, mutate) => {
    const feed = structuredClone(normalizeFeed(captured(), route));
    mutate(feed);
    expect(() => validateLiveFeed(feed)).toThrow(/Current alerts/);
  });
});

describe('overlapping agency source versions', () => {
  it('ignores source punctuation, turn abbreviation expansion, and rounded seconds', () => {
    const feed = normalizeFeed(captured(), route);
    expect(feed.alerts).toHaveLength(5);
    expect(feed.alerts.every(alert => !alert.sourceIssues.length)).toBe(true);
  });

  it('retains and flags a materially different legacy closure with the same ID', () => {
    const raw = captured();
    const legacy = raw.legacy.value as Record<string, unknown>[];
    legacy[3].detour_message = legacy[0].detour_message;
    const feed = normalizeFeed(raw, route);
    const primary = feed.alerts.find(alert => alert.id === 'D17345')!;
    const extra = feed.alerts.find(alert => alert.id.startsWith('D17345-legacy'))!;
    expect(primary.sourceIssues.join(' ')).toContain('different instructions');
    expect(extra.rawText).toContain('Schuylkill and JFK');
    expect(extra.skippedStopIds).toEqual(['30576']);
    expect(extra.sourceIssues.join(' ')).toContain('different instructions');
  });

  it('flags conflicting start/end boundaries and keeps the second version', () => {
    const raw = captured();
    (raw.legacy.value as Record<string, unknown>[])[3].detour_end_date_time = '10/12/2026 11:59 PM';
    const feed = normalizeFeed(raw, route);
    expect(feed.alerts.find(alert => alert.id === 'D17345')?.timingIssues.join(' ')).toContain('disagree about the end time');
    expect(feed.alerts.find(alert => alert.id.startsWith('D17345-legacy'))).toBeDefined();
  });

  it('flags a direction discrepancy even when the written messages match', () => {
    const raw = captured();
    (raw.detours.value as Record<string, unknown>[])[0].direction_id = '0';
    expect(normalizeFeed(raw, route).alerts.find(alert => alert.id === 'D17345')?.sourceIssues.join(' ')).toContain('affected direction');
  });
});
