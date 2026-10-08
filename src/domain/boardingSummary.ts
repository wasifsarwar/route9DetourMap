import type { StopAssessment } from './types';

/** Area instructions are attributed guidance, never an exact replacement stop. */
export function areaBoardingNotes(assessment: StopAssessment, replay: boolean) {
  if (replay || !assessment.fresh || assessment.status !== 'affected' || assessment.alternative) return [];
  return assessment.relevantAlerts.flatMap(({ alert, timing, affectsSelectedStop }) => {
    const note = alert.boardingNote;
    if (!note || timing !== 'active' || !affectsSelectedStop || alert.sourceIssues.length) return [];
    return [{ id: alert.id, sourceUrl: note.sourceUrl,
      text: note.text.replace(' The notice does not identify an exact stop or boarding point.', '') }];
  });
}
