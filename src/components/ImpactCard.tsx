import type { Stop, StopAssessment } from '../domain/types';

import { areaBoardingNotes } from '../domain/boardingSummary';
import { stopStatusCopy } from '../domain/stopScope';

export function ImpactCard({ assessment, stop, replay, showHeading = true }: { assessment: StopAssessment; stop: Stop; replay: boolean; showHeading?: boolean }) {
  const copy = stopStatusCopy(assessment);
  const boardingNotes = areaBoardingNotes(assessment, replay);
  const hasArea = boardingNotes.length > 0;

  return <section className={`impact-card impact-${assessment.status}`} aria-label={`Status for ${stop.name}`} aria-live="polite" aria-atomic="true">
    {showHeading && <div className="impact-heading">
      <span className="impact-icon" aria-hidden="true">{assessment.status === 'affected' ? '!' : assessment.status === 'unaffected' ? '✓' : '?'}</span>
      <div>{replay && <p className="eyebrow">Recorded example</p>}<h2>{copy.heading}</h2></div>
    </div>}
    {assessment.alternative ? <>
      <p className="impact-summary">Use <strong>{assessment.alternative.stop.name}</strong>.</p>
      <a className="agency-link" href={assessment.alternative.sourceUrl} target="_blank" rel="noreferrer">SEPTA boarding instructions</a>
    </> : hasArea ? <>
      {boardingNotes.map(note => <p className="impact-summary" key={note.id}>
        {note.text}
      </p>)}
      <p className="impact-note">Exact boarding point unconfirmed.</p>
      <a className="agency-link" href="https://www.septa.org/alerts" target="_blank" rel="noreferrer">Check SEPTA alerts</a>
    </> : <>
      <p className="impact-summary">{copy.summary}</p>
      {assessment.status !== 'unaffected' && <a className="agency-link" href="https://www.septa.org/alerts" target="_blank" rel="noreferrer">Check SEPTA alerts</a>}
    </>}
  </section>;
}
