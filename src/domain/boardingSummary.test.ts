import { describe, expect, it } from 'vitest';
import { areaBoardingNotes } from './boardingSummary';
import type { StopAssessment, DetourAlert } from './types';

const note = { text: 'SEPTA says to board on Schuylkill between Walnut and Chestnut. The notice does not identify an exact stop or boarding point.', sourceUrl: 'https://www.septa.org/alerts', precision: 'area-only' as const };
const alert: DetourAlert = { id: 'closure', title: 'Construction', directionIds: ['1'], startsAt: null, endsAt: null, schedule: null, rawText: '', sourceUrl: note.sourceUrl, timingIssues: [], sourceIssues: [], geometryIssues: [], geometry: [], unservedGeometry: [], skippedStopIds: ['30576'], stopCoverage: 'partial-list', boardingNote: note };
function assessment(): StopAssessment {
  return { status: 'affected', title: '', summary: '', reasons: [], alternative: null, fresh: true,
    relevantAlerts: [{ alert: structuredClone(alert), timing: 'active', affectsSelectedStop: true, stopScope: 'selected', reason: '' }] };
}
describe('area boarding summary', () => {
  it('surfaces attributed area instructions without inventing an exact stop', () => {
    expect(areaBoardingNotes(assessment(), false)).toEqual([{ id: 'closure', sourceUrl: note.sourceUrl, text: 'SEPTA says to board on Schuylkill between Walnut and Chestnut.' }]);
  });
  it('withholds current guidance in replay and stale assessments', () => {
    expect(areaBoardingNotes(assessment(), true)).toEqual([]);
    expect(areaBoardingNotes({ ...assessment(), fresh: false }, false)).toEqual([]);
  });
  it('withholds guidance for unknown and unaffected results', () => {
    for (const status of ['unknown', 'unaffected'] as const) expect(areaBoardingNotes({ ...assessment(), status }, false)).toEqual([]);
  });
  it('does not borrow instructions from another stop or uncertain/expired alerts', () => {
    const value = assessment();
    value.relevantAlerts[0].affectsSelectedStop = false;
    expect(areaBoardingNotes(value, false)).toEqual([]);
    value.relevantAlerts[0].affectsSelectedStop = true;
    for (const timing of ['uncertain', 'inactive'] as const) {
      value.relevantAlerts[0].timing = timing;
      expect(areaBoardingNotes(value, false)).toEqual([]);
    }
  });
  it('withholds conflicting source instructions', () => {
    const value = assessment(); value.relevantAlerts[0].alert.sourceIssues = ['Conflicting sources'];
    expect(areaBoardingNotes(value, false)).toEqual([]);
  });
});
