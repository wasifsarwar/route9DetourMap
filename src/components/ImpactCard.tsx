import type { Stop, StopAssessment } from '../domain/types';

import { stopStatusCopy } from '../domain/stopScope';

export function ImpactCard({ assessment, stop, replay }: { assessment: StopAssessment; stop: Stop; replay: boolean }) {
  const copy = stopStatusCopy(assessment);
  const boardingNotes = assessment.relevantAlerts.filter(({ alert, timing, affectsSelectedStop }) =>
    timing === 'active' && affectsSelectedStop && alert.sourceIssues.length === 0 && alert.boardingNote,
  );
  const hasArea = assessment.status === 'affected' && boardingNotes.length > 0;

  return <section className={`impact-card impact-${assessment.status}`} aria-label={`Status for ${stop.name}`} aria-live="polite" aria-atomic="true">
    <div className="impact-heading">
      <span className="impact-icon" aria-hidden="true">{assessment.status === 'affected' ? '!' : assessment.status === 'unaffected' ? '✓' : '?'}</span>
      <div>{replay && <p className="eyebrow">Recorded example</p>}<h2>{copy.heading}</h2></div>
    </div>
    {assessment.alternative ? <>
      <p className="impact-summary">Use <strong>{assessment.alternative.stop.name}</strong>.</p>
      <a className="agency-link" href={assessment.alternative.sourceUrl} target="_blank" rel="noreferrer">SEPTA boarding instructions</a>
    </> : hasArea ? <>
      {boardingNotes.map(({ alert }) => <p className="impact-summary" key={alert.id}>
        {alert.boardingNote?.text.replace(' The notice does not identify an exact stop or boarding point.', '')}
      </p>)}
      <p className="impact-note">Exact boarding point unconfirmed.</p>
      <a className="agency-link" href="https://www.septa.org/alerts" target="_blank" rel="noreferrer">Check SEPTA alerts</a>
    </> : <>
      <p className="impact-summary">{copy.summary}</p>
      {assessment.status !== 'unaffected' && <a className="agency-link" href="https://www.septa.org/alerts" target="_blank" rel="noreferrer">Check SEPTA alerts</a>}
    </>}
  </section>;
}
