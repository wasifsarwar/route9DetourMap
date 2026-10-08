import type { Stop, StopAssessment } from '../domain/types';

const headings = {
  affected: 'This stop is skipped',
  unaffected: 'No detour reported here',
  unknown: 'Stop status unconfirmed',
};

export function ImpactCard({ assessment, stop, replay }: { assessment: StopAssessment; stop: Stop; replay: boolean }) {
  const boardingNotes = assessment.relevantAlerts.filter(({ alert, timing, affectsSelectedStop }) =>
    timing === 'active' && affectsSelectedStop && alert.sourceIssues.length === 0 && alert.boardingNote,
  );
  const hasArea = assessment.status === 'affected' && boardingNotes.length > 0;

  return <section className={`impact-card impact-${assessment.status}`} aria-label={`Status for ${stop.name}`} aria-live="polite" aria-atomic="true">
    <div className="impact-heading">
      <span className="impact-icon" aria-hidden="true">{assessment.status === 'affected' ? '!' : assessment.status === 'unaffected' ? '✓' : '?'}</span>
      <div>{replay && <p className="eyebrow">Recorded example</p>}<h2>{headings[assessment.status]}</h2></div>
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
      <p className="impact-summary">{assessment.status === 'affected' ? 'SEPTA lists this stop as skipped. A replacement stop hasn’t been confirmed.'
        : assessment.status === 'unaffected' ? 'No impact appears in the alerts checked. This does not confirm an arrival.'
          : 'We can’t confirm whether buses are stopping here. Check SEPTA before you travel.'}</p>
      {assessment.status !== 'unaffected' && <a className="agency-link" href="https://www.septa.org/alerts" target="_blank" rel="noreferrer">Check SEPTA alerts</a>}
    </>}
  </section>;
}
