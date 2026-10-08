import type { Stop, StopAssessment } from '../domain/types';

const headings = {
  affected: 'Your stop is affected',
  unaffected: 'No impact reported for your stop',
  unknown: 'Unable to confirm your stop',
};

export function ImpactCard({ assessment, stop, replay }: { assessment: StopAssessment; stop: Stop; replay: boolean }) {
  const boardingNotes = assessment.relevantAlerts.filter(({ alert, timing, affectsSelectedStop }) =>
    timing === 'active' && affectsSelectedStop && alert.sourceIssues.length === 0 && alert.boardingNote,
  );

  return (
    <section className={`impact-card impact-${assessment.status}`} aria-live="polite" aria-atomic="true">
      <div className="impact-heading">
        <span className="impact-icon" aria-hidden="true">{assessment.status === 'affected' ? '!' : assessment.status === 'unaffected' ? '✓' : '?'}</span>
        <div><p className="eyebrow">{replay ? 'RECORDED EXAMPLE' : 'YOUR STOP'}</p><h2>{headings[assessment.status]}</h2></div>
      </div>
      <p className="selected-stop-name">{stop.name}</p>
      <p className="impact-summary">{assessment.summary}</p>
      {assessment.reasons.length > 0 && <ul className="impact-reasons">{assessment.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}

      {assessment.alternative ? (
        <div className="boarding-box">
          <h3>Agency-confirmed alternative</h3>
          <p>{assessment.alternative.stop.name}</p>
          <p>{assessment.alternative.note}</p>
          <a href={assessment.alternative.sourceUrl} target="_blank" rel="noreferrer">View boarding information</a>
        </div>
      ) : (
        <div className="boarding-box">
          {assessment.status === 'affected' && boardingNotes.length > 0 ? <>
            <h3>SEPTA’s boarding instructions</h3>
            {boardingNotes.map(({ alert }) => <div key={alert.id}>
              <blockquote>{alert.boardingNote?.text}</blockquote>
              <a href={alert.boardingNote?.sourceUrl} target="_blank" rel="noreferrer">View the agency source</a>
            </div>)}
            <p className="boarding-caution">This describes an area, not an exact boarding point. We have not confirmed a replacement stop on the map.</p>
          </> : <>
            <h3>{assessment.status === 'unaffected' ? 'What this result means' : 'Before you change stops'}</h3>
            <p>{assessment.status === 'unaffected'
              ? 'No impact appears in the alerts checked for this stop. This does not confirm an arrival or rule out an unreported change.'
              : 'An exact alternative boarding point has not been confirmed. Check the agency’s instructions before walking to another stop.'}</p>
          </>}
          <a className="agency-link" href="https://www.septa.org/alerts" target="_blank" rel="noreferrer">Check SEPTA service alerts</a>
        </div>
      )}
    </section>
  );
}
