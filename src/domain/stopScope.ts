import type { DetourAlert, Stop, StopAssessment } from './types';

export type StopScope = 'selected' | 'elsewhere' | 'unknown';
/** Only agency stop lists establish scope; map distance never does. */
export function getStopScope(alert: DetourAlert, stopId: string, stops: Stop[]): StopScope {
  if (alert.sourceIssues.length || alert.stopCoverage === 'unknown') return 'unknown';
  if (alert.skippedStopIds.includes(stopId)) return 'selected';
  if (alert.stopCoverage !== 'explicit-list' || !alert.skippedStopIds.length
    || alert.skippedStopIds.some(id => !stops.some(stop => stop.id === id))) return 'unknown';
  return 'elsewhere';
}

export function hasElsewhereDetour(assessment: StopAssessment): boolean {
  return assessment.status === 'unaffected' && assessment.relevantAlerts.some(item => item.stopScope === 'elsewhere' && item.timing === 'active');
}

export function stopStatusCopy(assessment: StopAssessment): { heading: string; summary: string } {
  if (assessment.status === 'affected') return {
    heading: 'This stop is skipped', summary: 'SEPTA lists this stop as skipped. A replacement stop hasn’t been confirmed.',
  };
  if (assessment.status === 'unaffected') {
    const elsewhere = hasElsewhereDetour(assessment);
    return elsewhere ? {
      heading: 'Detour elsewhere on this route',
      summary: 'The published affected-stop lists name other stops, not yours. This does not confirm an arrival.',
    } : { heading: 'No detour reported here', summary: 'No impact appears in the alerts checked. This does not confirm an arrival.' };
  }
  return { heading: 'Stop status unconfirmed', summary: 'We can’t confirm whether buses are stopping here. Check SEPTA before you travel.' };
}
