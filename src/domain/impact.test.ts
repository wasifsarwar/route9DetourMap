import { stopStatusCopy } from './stopScope';
import { describe, expect, it } from 'vitest';
import { assessStop, evaluateAlertTiming, isFeedFresh } from './impact';
import { parseInstant, parseWallTime, toWallTime, withinSchedule } from './time';
import type { AlertFeed, AssessmentInput, DetourAlert, RouteData, VerifiedBoarding } from './types';

const now = new Date('2026-10-08T02:00:00Z');
const stops = [
  { id: 'closed', name: 'Walnut & 21st', lat: 39.95, lon: -75.17 },
  { id: 'replacement', name: 'Walnut & 20th', lat: 39.95, lon: -75.16 },
  { id: 'other', name: 'Walnut & 19th', lat: 39.95, lon: -75.15 },
];
const route: RouteData = {
  id: '9', name: '4th-Walnut to Andorra', sourceUrl: 'https://www3.septa.org/developer/google_bus.zip',
  feedVersion: 'test', validFrom: '20260927', validThrough: '20270220',
  directions: [
    { id: '1', label: 'Northbound', headsign: 'Andorra', shape: [], stops },
    { id: '0', label: 'Southbound', headsign: '4th-Walnut', shape: [], stops: [{ ...stops[0], id: 'south' }] },
  ],
};
function alert(overrides: Partial<DetourAlert> = {}): DetourAlert {
  return {
    id: 'closure', title: 'Construction', directionIds: ['1'],
    startsAt: '2026-10-01T00:00:00-04:00', endsAt: '2026-10-10T00:00:00-04:00',
    schedule: null, rawText: 'Do not board at Walnut & 21st.', sourceUrl: 'https://www3.septa.org/api/BusDetours/9',
    timingIssues: [], geometryIssues: [], sourceIssues: [], geometry: [], unservedGeometry: [],
    skippedStopIds: ['closed'], stopCoverage: 'explicit-list', ...overrides,
  };
}
function feed(alerts: DetourAlert[] = [alert()], overrides: Partial<AlertFeed> = {}): AlertFeed {
  return {
    routeId: '9', alerts, fetchedAt: now.toISOString(), mode: 'live', complete: true, warnings: [],
    sources: [{ name: 'SEPTA', url: 'https://www3.septa.org/api/BusDetours/9', fetchedAt: now.toISOString(), ok: true }],
    ...overrides,
  };
}
function input(overrides: Partial<AssessmentInput> = {}): AssessmentInput {
  return { feed: feed(), route, directionId: '1', stopId: 'closed', now, ...overrides };
}
const boarding: VerifiedBoarding = {
  stopId: 'replacement', forAlertIds: ['closure'], sourceUrl: 'https://www3.septa.org/agency-notice',
  verifiedAt: '2026-10-07T20:00:00Z', validUntil: '2026-10-09T20:00:00Z', verification: 'agency-explicit',
  note: 'Agency explicitly identifies this replacement for the closure.',
};

describe('Philadelphia time and recurring service days', () => {
  it('uses Eastern offsets independently of the browser time zone', () => {
    expect(new Date(parseWallTime('2026-10-07T21:54')).toISOString()).toBe('2026-10-08T01:54:00.000Z');
    expect(new Date(parseWallTime('2026-12-01T21:54')).toISOString()).toBe('2026-12-02T02:54:00.000Z');
    expect(toWallTime('2026-10-08T01:54:00Z')).toBe('2026-10-07T21:54');
  });
  it('rejects nonexistent dates and the spring-forward missing hour', () => {
    expect(() => parseWallTime('2026-03-08T02:30')).toThrow();
    expect(() => parseWallTime('2026-02-30T12:00')).toThrow();
    expect(() => parseWallTime('2026-10-07T25:00')).toThrow();
  });
  it('rejects normalized invalid dates and source timestamps without an explicit zone', () => {
    expect(parseInstant('2026-02-30T10:00:00Z')).toBeNaN();
    expect(parseInstant('2026-10-07T21:00:00')).toBeNaN();
    expect(parseInstant('2026-10-07T24:00:00Z')).toBeNaN();
    expect(parseInstant('2026-10-08T02:26:59.409736+00:00')).toBe(Date.parse('2026-10-08T02:26:59.409Z'));
  });
  it('uses end-exclusive Sunday hours', () => {
    const schedule = { days: [0], startTime: '06:30', endTime: '18:00' };
    expect(withinSchedule(schedule, '2026-10-11T06:29')).toBe(false);
    expect(withinSchedule(schedule, '2026-10-11T06:30')).toBe(true);
    expect(withinSchedule(schedule, '2026-10-11T18:00')).toBe(false);
    expect(withinSchedule(schedule, '2026-10-12T12:00')).toBe(false);
  });
  it('assigns overnight after-midnight hours to the previous service day', () => {
    const schedule = { days: [1, 2, 3, 4, 5], startTime: '21:00', endTime: '05:00' };
    expect(withinSchedule(schedule, '2026-10-10T02:00')).toBe(true);
    expect(withinSchedule(schedule, '2026-10-10T05:00')).toBe(false);
    expect(withinSchedule(schedule, '2026-10-10T22:00')).toBe(false);
    expect(withinSchedule(schedule, '2026-10-12T02:00')).toBe(false);
    expect(withinSchedule(schedule, '2026-10-12T21:00')).toBe(true);
  });
});

describe('timing evidence', () => {
  it('applies start inclusively and end exclusively', () => {
    const record = alert({ startsAt: now.toISOString(), endsAt: new Date(now.getTime() + 1000).toISOString() });
    expect(evaluateAlertTiming(record, new Date(now.getTime() - 1)).timing).toBe('inactive');
    expect(evaluateAlertTiming(record, now).timing).toBe('active');
    expect(evaluateAlertTiming(record, new Date(now.getTime() + 1000)).timing).toBe('inactive');
  });
  it('keeps conflicting dates and recurrence uncertain instead of selecting one interpretation', () => {
    expect(evaluateAlertTiming(alert({ timingIssues: ['Text end date disagrees with API.'] }), now).timing).toBe('uncertain');
    expect(evaluateAlertTiming(alert({ schedule: { days: [0], startTime: '06:30', endTime: '18:00' }, timingIssues: ['Text says Sunday; API says daily.'] }), now).timing).toBe('uncertain');
  });
  it.each([
    { startsAt: 'not-a-date' },
    { endsAt: '2026-02-30T12:00:00Z' },
    { endsAt: '2026-09-01T12:00:00Z' },
    { schedule: { days: [8], startTime: '00:00', endTime: '24:00' } },
    { schedule: { days: [3], startTime: '25:00', endTime: '05:00' } },
  ])('returns uncertain for malformed temporal evidence %j', (override) => {
    expect(evaluateAlertTiming(alert(override), now).timing).toBe('uncertain');
  });
});

describe('joint stop assessment', () => {
  it('reports an explicitly listed active closure even when another alert has unknown stops', () => {
    const result = assessStop(input({ feed: feed([alert(), alert({ id: 'another', stopCoverage: 'unknown', skippedStopIds: [] })]) }));
    expect(result.status).toBe('affected');
    expect(result.relevantAlerts).toHaveLength(2);
    expect(result.alternative).toBeNull();
    expect(result.reasons.join(' ')).toMatch(/unresolved/);
  });
  it('preserves an explicit positive closure when another source failed, without recommending an alternative', () => {
    const result = assessStop(input({ feed: feed([alert()], { complete: false }), boarding: [boarding] }));
    expect(result.status).toBe('affected');
    expect(result.reasons.join(' ')).toMatch(/missing/);
    expect(result.alternative).toBeNull();
  });
  it('filters direction before evaluating conflicting alerts', () => {
    const result = assessStop(input({ directionId: '0', stopId: 'south', feed: feed([alert({ timingIssues: ['Conflicting dates'] })]) }));
    expect(result.status).toBe('unaffected');
    expect(result.relevantAlerts).toEqual([]);
  });
  it('does not treat candidate geometry or an absent skip list as stop evidence', () => {
    const record = alert({ stopCoverage: 'unknown', skippedStopIds: [], candidateGeometry: [[39.95, -75.17], [39.95, -75.16]] });
    expect(assessStop(input({ feed: feed([record]) })).status).toBe('unknown');
    expect(assessStop(input({ feed: feed([alert({ skippedStopIds: [] })]) })).status).toBe('unknown');
  });
  it('uses a partial named closure only as positive evidence for that stop', () => {
    const records = feed([alert({ stopCoverage: 'partial-list' })]);
    expect(assessStop(input({ feed: records })).status).toBe('affected');
    expect(assessStop(input({ feed: records, stopId: 'other' })).status).toBe('unknown');
  });
  it('limits unaffected language to checked agency alerts and published lists', () => {
    const result = assessStop(input({ stopId: 'other' }));
    expect(result.status).toBe('unaffected');
    expect(result.title).toBe('Detour elsewhere on this route');
    expect(result.summary).toMatch(/does not confirm/);
  });
  it('cannot clear a stop when any applicable alert has unknown stop coverage or inconsistent timing', () => {
    for (const record of [alert({ id: 'unknown', stopCoverage: 'unknown' }), alert({ id: 'conflict', timingIssues: ['Conflicting dates'] })]) {
      expect(assessStop(input({ stopId: 'other', feed: feed([alert(), record]) })).status).toBe('unknown');
    }
  });
  it('does not let geometry quality invalidate separate explicit stop evidence', () => {
    expect(assessStop(input({ feed: feed([alert({ geometryIssues: ['Published line loops.'] })]) })).status).toBe('affected');
  });
  it('does not use conflicted source evidence to confirm a closure', () => {
    expect(assessStop(input({ feed: feed([alert({ sourceIssues: ['Agency source withdrawn.'] })]) })).status).toBe('unknown');
  });
  it('cannot clear stops with incomplete feeds or stop IDs outside the route data', () => {
    expect(assessStop(input({ stopId: 'other', feed: feed([], { complete: false }) })).status).toBe('unknown');
    expect(assessStop(input({ stopId: 'other', feed: feed([alert({ skippedStopIds: ['missing-stop'] })]) })).status).toBe('unknown');
    expect(assessStop(input({ stopId: 'south' })).status).toBe('unknown');
    expect(assessStop(input({ feed: feed([], { routeId: '27' }) })).status).toBe('unknown');
  });
  it('validates route service dates in Philadelphia, inclusive of the final local date', () => {
    const throughToday = { ...route, validThrough: '2026-10-07' };
    expect(assessStop(input({ route: throughToday })).status).toBe('affected');
    expect(assessStop(input({ route: { ...route, validThrough: '20261006' } })).status).toBe('unknown');
    expect(assessStop(input({ route: { ...route, validFrom: '20260230' } })).status).toBe('unknown');
  });
});

describe('freshness and recorded replay', () => {
  it('expires at fifteen minutes, checks every successful source timestamp, and rejects future timestamps', () => {
    expect(isFeedFresh(feed(), new Date(now.getTime() + 15 * 60_000))).toBe(true);
    expect(isFeedFresh(feed(), new Date(now.getTime() + 15 * 60_000 + 1))).toBe(false);
    expect(isFeedFresh(feed(), new Date(now.getTime() - 1))).toBe(false);
    const oldSource = [{ ...feed().sources[0], fetchedAt: '2026-10-07T20:00:00Z' }];
    expect(isFeedFresh(feed([], { sources: oldSource }), now)).toBe(false);
  });
  it('stale or invalid data cannot confirm even an explicitly listed closure', () => {
    expect(assessStop(input({ now: new Date(now.getTime() + 16 * 60_000) })).status).toBe('unknown');
    expect(assessStop(input({ feed: feed([alert()], { fetchedAt: '2026-02-30T12:00:00Z' }) })).status).toBe('unknown');
    expect(assessStop(input({ now: new Date(NaN) })).status).toBe('unknown');
  });
  it('requires explicit recorded replay and never offers live alternatives in replay', () => {
    const historicalFeed = feed([alert()], { mode: 'snapshot' });
    expect(assessStop(input({ feed: historicalFeed })).status).toBe('unknown');
    const result = assessStop(input({ feed: historicalFeed, replay: true, boarding: [boarding] }));
    expect(result.status).toBe('affected');
    expect(result.fresh).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/recorded-data/);
    expect(result.alternative).toBeNull();
  });
  it('does not let the replay switch bypass freshness of a live feed', () => {
    expect(assessStop(input({ now: new Date(now.getTime() + 16 * 60_000), replay: true })).status).toBe('unknown');
  });
});

describe('agency-verified replacement boarding', () => {
  it('offers a current explicit replacement only after checking it against every alert', () => {
    expect(assessStop(input({ boarding: [boarding] })).alternative?.stop.id).toBe('replacement');
    const anotherClosure = alert({ id: 'replacement-closed', skippedStopIds: ['replacement'] });
    expect(assessStop(input({ boarding: [boarding], feed: feed([alert(), anotherClosure]) })).alternative).toBeNull();
  });
  it.each([
    { validUntil: now.toISOString() },
    { verifiedAt: new Date(now.getTime() + 1).toISOString() },
    { forAlertIds: ['wrong-alert'] },
    { stopId: 'unmapped-stop' },
    { stopId: 'closed' },
    { sourceUrl: '' },
  ])('rejects an unverified or expired replacement %j', (override) => {
    expect(assessStop(input({ boarding: [{ ...boarding, ...override }] })).alternative).toBeNull();
  });
  it('requires replacement evidence to cover every active closure affecting the original stop', () => {
    const result = assessStop(input({ boarding: [boarding], feed: feed([alert(), alert({ id: 'second-closure' })]) }));
    expect(result.status).toBe('affected');
    expect(result.alternative).toBeNull();
  });
});

describe('stop-specific scope', () => {
  it('separates an active detour elsewhere using complete agency stop lists', () => {
    const result = assessStop(input({ stopId: 'other' }));
    expect(result.status).toBe('unaffected');
    expect(result.relevantAlerts[0].stopScope).toBe('elsewhere');
  });
  it('keeps timing conflicts elsewhere visible without clearing current service', () => {
    const result = assessStop(input({ stopId: 'other', feed: feed([alert({ timingIssues: ['Conflicting schedule'] })]) }));
    expect(result.status).toBe('unknown');
    expect(result.relevantAlerts[0].stopScope).toBe('elsewhere');
    expect(result.reasons.join(' ')).toContain('Other stops are listed');
  });
  it('never infers elsewhere from partial, missing, mismatched, or conflicted lists', () => {
    for (const patch of [{ stopCoverage: 'partial-list' as const }, { skippedStopIds: [] }, { skippedStopIds: ['unmapped'] }, { sourceIssues: ['Conflict'] }]) {
      const result = assessStop(input({ stopId: 'other', feed: feed([alert(patch)]) }));
      expect(result.status).toBe('unknown');
      expect(result.relevantAlerts[0].stopScope).toBe('unknown');
    }
  });
  it('puts a selected-stop closure before uncertainty and elsewhere alerts', () => {
    const result = assessStop(input({ feed: feed([alert({ id: 'elsewhere', skippedStopIds: ['other'] }), alert({ id: 'unknown', skippedStopIds: [] }), alert()]) }));
    expect(result.relevantAlerts.map(item => item.stopScope)).toEqual(['selected', 'unknown', 'elsewhere']);
    expect(result.status).toBe('affected');
  });
});

it('reserves elsewhere wording for a resolved stop assessment', () => {
  expect(stopStatusCopy(assessStop(input({ stopId: 'other' }))).heading).toBe('Detour elsewhere on this route');
  for (const change of [{ now: new Date(now.getTime() + 16 * 60_000) }, { feed: feed([alert()], { complete: false }) }, { feed: feed([alert({ timingIssues: ['Conflicting hours'] })]) }]) {
    expect(stopStatusCopy(assessStop(input({ stopId: 'other', ...change }))).heading).toBe('Stop status unconfirmed');
  }
  expect(stopStatusCopy(assessStop(input({ stopId: 'other', feed: feed([]) }))).heading).toBe('No detour reported here');
});


describe('weekday detour display windows in Philadelphia time', () => {
  const record = alert({ startsAt: '2026-10-01T00:00:00-04:00', endsAt: '2026-11-10T00:00:00-05:00', schedule: { days: [1,2,3,4,5], startTime: '07:00', endTime: '16:00' } });
  it.each([
    ['2026-10-08T10:59:59Z', 'inactive'],
    ['2026-10-08T11:00:00Z', 'active'],
    ['2026-10-08T19:59:59Z', 'active'],
    ['2026-10-08T20:00:00Z', 'inactive'],
    ['2026-10-10T16:00:00Z', 'inactive'],
    ['2026-09-30T16:00:00Z', 'inactive'],
    ['2026-11-10T17:00:00Z', 'inactive'],
    ['2026-11-02T11:59:59Z', 'inactive'],
    ['2026-11-02T12:00:00Z', 'active'],
  ])('%s is %s regardless of the rider timezone', (timestamp, expected) => {
    expect(evaluateAlertTiming(record, new Date(timestamp)).timing).toBe(expected);
  });
});
