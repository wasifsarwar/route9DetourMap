import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { presentAlertText } from './alertText';
import { normalizeFeed, type RawFeed } from '../data/normalize';
import { normalizeSnapshot } from '../data/snapshot';

const snapshot = normalizeSnapshot(JSON.parse(readFileSync(new URL('../../public/data/route9-snapshot.json', import.meta.url), 'utf8')) as unknown);
const capturedAt = '2026-10-08T02:46:41.000Z';
const readFixture = (file: string) => readFileSync(new URL(`../data/fixtures/${file}`, import.meta.url), 'utf8');
const source: RawFeed = {
  detours: { fetchedAt: capturedAt, value: JSON.parse(readFixture('detours.json')) },
  legacy: { fetchedAt: capturedAt, value: JSON.parse(readFixture('legacy-alerts.json')) },
  northbound: { fetchedAt: capturedAt, value: readFixture('northbound.kml') },
  southbound: { fetchedAt: capturedAt, value: readFixture('southbound.kml') },
};
const live = normalizeFeed(source, snapshot.route);

const sinkholeSteps = ['Follow 4th.', 'Turn right onto Spruce.', 'Turn right onto 9th.', 'Turn left onto Walnut.', 'Rejoin the regular route.'];

describe('rider-friendly agency text', () => {
  it('expands the real sinkhole notice into ordered turns with its stated end date', () => {
    const alert = live.alerts.find(item => item.id === 'D17345')!;
    const text = presentAlertText(alert);
    expect(text.intro).toBe('Northbound route instructions');
    expect(text.direction).toBe('Northbound');
    expect(text.timing).toEqual(['All day, every day until October 10, 2026.']);
    expect(text.steps).toEqual(sinkholeSteps);
    expect(text.originalText).toBe(alert.rawText);
    expect(text.paragraphs).toEqual([]);
  });

  it('presents the already-expanded SEPTA legacy/screenshot wording identically', () => {
    const raw = live.alerts.find(item => item.id === 'D17345')!;
    const legacy = (source.legacy.value as Record<string, string>[]).find(item => item.detour_id === '17345')!;
    const first = presentAlertText(raw);
    const second = presentAlertText({ ...raw, rawText: legacy.detour_message });
    expect(second.steps).toEqual(first.steps);
    expect(second.timing).toEqual(first.timing);
    expect(second.direction).toBe(first.direction);
    expect(second.originalText).toBe(legacy.detour_message);
  });

  it('keeps the PECO October 5 wording even though the structured end date is October 8', () => {
    const alert = live.alerts.find(item => item.id === 'D17603')!;
    const before = structuredClone(alert);
    const text = presentAlertText(alert);
    expect(text.timing).toEqual(['Until 5 AM on October 5, 2026.']);
    expect(text.direction).toBe('Southbound');
    expect(text.steps).toEqual(['Follow Ridge.', 'Turn left onto Wigard.', 'Turn right onto Valley.', 'Turn right onto Livezey.', 'Turn left onto Ridge.', 'Rejoin the regular route.']);
    expect(alert).toEqual(before);
    expect(alert.timingIssues.length).toBeGreaterThan(0);
  });

  it('retains weekday and Sunday wording instead of resolving the structured recurrence conflicts', () => {
    const bridge = live.alerts.find(item => item.id === 'D16646')!;
    const bridgeText = presentAlertText(bridge);
    expect(bridgeText.timing).toEqual(['Weekdays only from 9:00 PM–5:00 AM on October 23, 2026.']);
    expect(bridgeText.steps).toEqual(['Follow Walnut.', 'Turn right onto 20th.', 'Turn left onto JFK.', 'Turn right onto Schuylkill.', 'Rejoin the regular route.']);
    expect(bridgeText.timing.join(' ')).not.toContain('until');
    const sunday = presentAlertText(live.alerts.find(item => item.id === 'D16944')!);
    expect(sunday.timing).toEqual(['October 4–October 25, Sundays only 6:30 AM–6:00 PM.']);
    expect(sunday.timing.join(' ')).not.toContain('2026');
    expect(sunday.steps).toEqual(['Follow Walnut St.', 'Turn left onto Broad St.', 'Turn right onto Spruce St.', 'Turn right onto 22nd St.', 'Turn left onto Walnut St.', 'Rejoin the regular route.']);
  });

  it('makes the reviewed closure readable without inventing an exact replacement stop', () => {
    const alert = live.alerts.find(item => item.id === 'D16046')!;
    const text = presentAlertText(alert);
    expect(text.steps).toEqual([]);
    expect(text.paragraphs).toEqual([
      'The northbound stop at Schuylkill and JFK is closed until further notice because of construction.',
      'SEPTA says to board on Schuylkill between Walnut and Chestnut.',
    ]);
    expect(text.originalText).toBe(alert.rawText);
    expect(JSON.stringify(text)).not.toContain('20407');
    expect(text.timing).toEqual([]);
  });

  it('also handles every recorded prototype notice without changing its source', () => {
    for (const alert of snapshot.feed.alerts) {
      const text = presentAlertText(alert);
      expect(text.originalText).toBe(alert.rawText);
      expect(text.steps.length + text.paragraphs.length).toBeGreaterThan(0);
    }
    expect(presentAlertText(snapshot.feed.alerts.find(item => item.id === 'D17345')!).steps).toEqual(sinkholeSteps);
  });

  it('falls back to readable original qualifications for unfamiliar instructions', () => {
    const rawText = 'NB via Walnut\nR - 20th except during police activity\nFollow the flagger instructions';
    const text = presentAlertText({ rawText });
    expect(text.steps).toEqual([]);
    expect(text.paragraphs.join(' ')).toContain('except during police activity');
    expect(text.paragraphs.join(' ')).toContain('Follow the flagger instructions');
    expect(text.originalText).toBe(rawText);
  });

  it('does not turn unknown text, invalid dates or missing years into invented directions', () => {
    const rawText = 'Service may change on 13/40/26; watch for notices.';
    const text = presentAlertText({ rawText });
    expect(text.direction).toBeNull();
    expect(text.steps).toEqual([]);
    expect(text.paragraphs).toEqual([rawText]);
    expect(presentAlertText({ rawText: '24/7 until 10/10, NB via 4th, Reg Rt' }).timing).toEqual(['All day, every day until October 10.']);
    expect(presentAlertText({ rawText: '' }).paragraphs).toEqual(['The agency did not provide written instructions.']);
  });
});
