import { useEffect, useRef, useState } from 'react';
import type { AlertFeed, RouteData, RouteDirection } from '../domain/types';
import { assessStop } from '../domain/impact';
import { nearbyStops, distanceLabel, validFix, type LocationFix } from '../domain/nearbyStops';
import { requestLocation } from '../hooks/location';
import { Icon } from './Icon';

export function NearbyStops({ route, direction, feed, now, onSelect }: {
  route: RouteData; direction: RouteDirection; feed: AlertFeed; now: Date; onSelect: (id: string) => void;
}) {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  async function locate() {
    const id = ++request.current;
    setLoading(true); setError(''); setFix(null);
    try {
      const result = await requestLocation(navigator.geolocation);
      if (id !== request.current) return;
      if (!validFix(result, Date.now())) throw new Error('Location is too imprecise or out of date. Try again or search for your stop.');
      setFix(result);
    } catch (failure) {
      if (id === request.current) setError(failure instanceof Error ? failure.message : 'Location is unavailable. Search for your stop.');
    } finally { if (id === request.current) setLoading(false); }
  }
  const locationTime = Math.max(now.getTime(), Date.now());
  const expired = fix && !validFix(fix, locationTime);
  const matches = fix ? nearbyStops(direction.stops, fix, locationTime) : [];
  function clear() { request.current++; setLoading(false); setFix(null); setError(''); }
  return <div className="nearby-stops">
    <div className="nearby-stops__actions"><button onClick={() => { void locate(); }} disabled={loading}><Icon name="pin" />{loading ? 'Finding you…' : fix ? 'Update location' : 'Near me'}</button>
      {(fix || error || loading) && <button onClick={clear}>{loading ? 'Cancel' : 'Clear'}</button>}</div>
    <div role="status" aria-live="polite">
      {error && <p>{error}</p>}
      {expired && <p>Location is out of date. Update it to find nearby stops.</p>}
      {fix && !expired && <>
        <p>Near you toward {direction.headsign}. Approximate straight-line distances.</p>
        {fix.accuracy > 100 && <p>Location is approximate (within about {Math.round(fix.accuracy)} m). Stop order may vary.</p>}
        {!matches.length && <p>No Route 9 stops within a mile. Try searching by street.</p>}
      </>}
    </div>
    {fix && !expired && matches.length > 0 && <ul aria-label="Nearby stops">{matches.map(({ stop, meters }) => {
      const assessment = assessStop({ route, feed, directionId: direction.id, stopId: stop.id, now, boarding: [] });
      return <li key={stop.id}><button onClick={() => { onSelect(stop.id); clear(); }}>
        <span className="nearby-stops__name">{stop.name}<small>About {distanceLabel(meters)}</small></span>
        <span className={`nearby-stops__status nearby-stops__status--${assessment.status}`}>{assessment.status === 'affected' ? 'Stop skipped' : assessment.status === 'unaffected' ? 'No impact reported' : 'Status unconfirmed'}</span>
      </button></li>;
    })}</ul>}
    {!fix && !error && !loading && <p className="nearby-stops__privacy">Uses your location once. Not saved or shared by this app.</p>}
  </div>;
}
