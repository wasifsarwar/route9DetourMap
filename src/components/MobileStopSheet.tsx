import { useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Stop, StopAssessment } from '../domain/types';
import { stopStatusCopy } from '../domain/stopScope';
import { areaBoardingNotes } from '../domain/boardingSummary';
import { ImpactCard } from './ImpactCard';
import './MobileStopSheet.css';

export function MobileStopSheet({ arrivals, stop, headsign, assessment, replay, expanded, onExpandedChange, children }: {
  arrivals?: ReactNode; stop: Stop; headsign: string; assessment: StopAssessment; replay: boolean;
  expanded: boolean; onExpandedChange: (expanded: boolean) => void; children: ReactNode;
}) {
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const readingPosition = useRef(0);
  const [hasViewedDetails, setHasViewedDetails] = useState(false);
  const copy = stopStatusCopy(assessment);
  const boardingNotes = areaBoardingNotes(assessment, replay);
  useLayoutEffect(() => {
    readingPosition.current = 0;
    setHasViewedDetails(false);
    if (body.current) body.current.scrollTop = 0;
  }, [stop.id, headsign, replay]);
  useLayoutEffect(() => {
    if (expanded) {
      setHasViewedDetails(true);
      if (body.current) body.current.scrollTop = readingPosition.current;
    } else if (body.current?.contains(document.activeElement)) {
      toggle.current?.focus({ preventScroll: true });
    }
  }, [expanded, stop.id, headsign, replay]);
  function collapse() { onExpandedChange(false); toggle.current?.focus(); }
  return <section className={`mobile-stop-sheet mobile-stop-sheet--${assessment.status} ${expanded ? 'is-expanded' : ''}`}
    aria-label="Selected stop" onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.preventDefault(); collapse(); } }}>
    <div className="mobile-stop-sheet__summary">
      <div className="mobile-stop-sheet__stop"><h2>{stop.name}</h2><p>Toward {headsign}{replay && ' · Recorded example'}</p></div>
      <div className="mobile-stop-sheet__status" role="status" aria-live="polite" aria-atomic="true">
        <strong><span aria-hidden="true">{assessment.status === 'affected' ? '!' : assessment.status === 'unknown' ? '?' : '✓'}</span>{copy.heading}</strong>
        {boardingNotes.map(note => <p className="mobile-stop-sheet__boarding" key={note.id}>{note.text}</p>)}
        <p>{assessment.status === 'affected'  ? assessment.alternative ? `Board at ${assessment.alternative.stop.name}.` : 'Exact boarding point unconfirmed.'
          : assessment.status === 'unknown' ? 'Check SEPTA before you travel.' : 'This does not confirm an arrival.'}</p>
      </div>
      {arrivals}
      <button className="mobile-stop-sheet__toggle" ref={toggle} aria-expanded={expanded} aria-controls={id}
        onClick={() => onExpandedChange(!expanded)}><span>{expanded ? 'Show more map' : hasViewedDetails ? 'Return to service details' : assessment.status === 'affected' ? 'View boarding guidance' : 'View service details'}</span><span aria-hidden="true">{expanded ? '⌄' : '⌃'}</span></button>
    </div>
    <div id={id} ref={body} className="mobile-stop-sheet__body" hidden={!expanded}
      onScroll={event => { if (expanded) readingPosition.current = event.currentTarget.scrollTop; }}>
      <ImpactCard assessment={assessment} stop={stop} replay={replay} showHeading={false} />
      {children}
    </div>
  </section>;
}
