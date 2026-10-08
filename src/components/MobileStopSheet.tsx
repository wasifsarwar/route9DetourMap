import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Stop, StopAssessment } from '../domain/types';
import { stopStatusCopy } from '../domain/stopScope';
import { ImpactCard } from './ImpactCard';
import './MobileStopSheet.css';

export function MobileStopSheet({ stop, headsign, assessment, replay, expanded, onExpandedChange, children }: {
  stop: Stop; headsign: string; assessment: StopAssessment; replay: boolean;
  expanded: boolean; onExpandedChange: (expanded: boolean) => void; children: ReactNode;
}) {
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const copy = stopStatusCopy(assessment);
  useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [stop.id, headsign]);
  function collapse() { onExpandedChange(false); toggle.current?.focus(); }
  return <section className={`mobile-stop-sheet mobile-stop-sheet--${assessment.status} ${expanded ? 'is-expanded' : ''}`}
    aria-label="Selected stop" onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.preventDefault(); collapse(); } }}>
    <div className="mobile-stop-sheet__summary">
      <div className="mobile-stop-sheet__stop"><h2>{stop.name}</h2><p>Toward {headsign}{replay && ' · Recorded example'}</p></div>
      <div className="mobile-stop-sheet__status" role="status" aria-live="polite" aria-atomic="true">
        <strong><span aria-hidden="true">{assessment.status === 'affected' ? '!' : assessment.status === 'unknown' ? '?' : '✓'}</span>{copy.heading}</strong>
        <p>{assessment.status === 'affected' ? assessment.alternative ? `Board at ${assessment.alternative.stop.name}.` : 'Exact boarding point unconfirmed.'
          : assessment.status === 'unknown' ? 'Check SEPTA before you travel.' : 'This does not confirm an arrival.'}</p>
      </div>
      <button className="mobile-stop-sheet__toggle" ref={toggle} aria-expanded={expanded} aria-controls={id}
        onClick={() => onExpandedChange(!expanded)}><span>{expanded ? 'Show more map' : assessment.status === 'affected' ? 'View boarding guidance' : 'View service details'}</span><span aria-hidden="true">{expanded ? '⌄' : '⌃'}</span></button>
    </div>
    <div id={id} ref={body} className="mobile-stop-sheet__body" hidden={!expanded}>
      <ImpactCard assessment={assessment} stop={stop} replay={replay} showHeading={false} />
      {children}
    </div>
  </section>;
}
