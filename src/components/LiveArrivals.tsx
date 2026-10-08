import type { DirectionId, StopAssessment } from '../domain/types';
import type { RealtimeFeed } from '../realtime/types';
import { currentReport } from '../realtime/types';
import { arrivalsForStop, arrivalMinutes } from '../realtime/select';
import './LiveArrivals.css';
export function LiveArrivals({ feed, now, error, directionId, stopId, assessment }: { feed: RealtimeFeed | null; now: number; error: boolean; directionId: DirectionId; stopId: string; assessment: StopAssessment }) {
  const arrivals = arrivalsForStop(feed, directionId, stopId, now).slice(0,3);
  const available = feed && currentReport(feed.predictionsAt, now);
  return <div className="live-arrivals" aria-label="Arrival estimates for selected stop">
    <strong>Next buses</strong>
    {assessment.status === 'affected' ? <p>This stop is reported skipped. Arrival times are withheld.</p>
      : !available ? <p>{error || feed ? 'Live arrivals unavailable.' : 'Checking live arrivals…'}</p>
      : arrivals.length ? <><div className="live-arrivals__times">{arrivals.map(p => <span key={p.tripId}>{arrivalMinutes(p.arrivalAt!, now)} <small>min</small></span>)}</div>
        <p>SEPTA estimates{assessment.status === 'unknown' ? ' · stopping here is unconfirmed.' : ' · may change.'}</p></>
      : <p>No live predictions for this stop. This does not mean no buses are running.</p>}
  </div>;
}
