import { useEffect, useRef, useState } from 'react';
import type { AlertFeed, RouteData, RouteDirection } from '../domain/types';
import { hasElsewhereDetour } from '../domain/stopScope';
import { assessStop } from '../domain/impact';
import { nearbyStops, distanceLabel, walkingTimeLabel, validFix, type LocationFix } from '../domain/nearbyStops';
import { requestLocation } from '../hooks/location';
import { Icon } from './Icon';

type NearbyProps = {
  route: RouteData; direction: RouteDirection; feed: AlertFeed; now: Date; onSelect: (id: string) => void;
};

export function useNearbyStops() {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);
  async function locate() {
    const id = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true); setError(''); setFix(null);
    try {
      const result = await requestLocation(navigator.geolocation, controller.current.signal);
      if (id !== request.current) return;
      if (!validFix(result, Date.now())) throw new Error('Location is too imprecise or out of date. Try again or search for your stop.');
      setFix(result);
    } catch (failure) {
      if (id === request.current) setError(failure instanceof Error ? failure.message : 'Location is unavailable. Search for your stop.');
    } finally { if (id === request.current) setLoading(false); }
  }
  function clear() { request.current++; controller.current?.abort(); controller.current = null; setLoading(false); setFix(null); setError(''); }
  return { fix, loading, error, locate, clear, open: loading || !!fix || !!error };
}

type NearbyState = ReturnType<typeof useNearbyStops>;

export function NearbyStopsPanel({ route, direction, feed, now, onSelect, state, onDismiss }: NearbyProps & { state: NearbyState; onDismiss?: () => void }) {
  const { fix, loading, error, clear } = state;
  const locationTime = Math.max(now.getTime(), Date.now());
  const expired = fix && !validFix(fix, locationTime);
  const matches = fix ? nearbyStops(direction.stops, fix, locationTime) : [];
  if (!state.open) return null;
  return <div className="nearby-stops nearby-stops--panel">
    <div className="nearby-stops__panel-head">
      <strong>{loading ? 'Finding nearby stops' : error ? 'Location unavailable' : 'Stops near you'}</strong>
      <button type="button" onClick={onDismiss ?? clear}>{loading ? 'Cancel' : 'Clear'}</button>
    </div>
    <div role="status" aria-live="polite">
      {loading && <p>Allow location access to find Route 9 stops nearby.</p>}
      {error && <p>{error}</p>}
      {expired && <p>Location is out of date. Update it to find nearby stops.</p>}
      {fix && !expired && <>
        <p>Toward {direction.headsign}. Walk estimates use straight-line distance; actual walks may take longer.</p>
        {fix.accuracy > 100 && <p>Location is approximate (within about {Math.round(fix.accuracy)} m). Stop order may vary.</p>}
        {!matches.length && <p>No Route 9 stops within a mile of your location. This app covers Philadelphia’s Route 9. You can explore it using stop search.</p>}
      </>}
    </div>
    {fix && !expired && matches.length > 0 && <ul aria-label="Nearby stops">{matches.map(({ stop, meters }) => {
      const assessment = assessStop({ route, feed, directionId: direction.id, stopId: stop.id, now, boarding: [] });
      return <li key={stop.id}><button type="button" onClick={() => { onSelect(stop.id); clear(); }}>
        <span className="nearby-stops__name">{stop.name}<small>{fix.accuracy <= 100 ? `${walkingTimeLabel(meters)} · ${distanceLabel(meters)}` : `About ${distanceLabel(meters)} · walk time unavailable`}</small></span>
        <span className={`nearby-stops__status nearby-stops__status--${assessment.status}`}>{assessment.status === 'affected' ? 'Stop skipped' : assessment.status === 'unaffected' ? hasElsewhereDetour(assessment) ? 'Detour elsewhere' : 'No impact reported' : 'Status unconfirmed'}</span>
      </button></li>;
    })}</ul>}
    <p className="nearby-stops__privacy">Uses your location once. Not saved or shared by this app.</p>
  </div>;
}

export function NearbyStops(props: NearbyProps) {
  const state = useNearbyStops();
  return <div className="nearby-stops">
    <div className="nearby-stops__actions"><button type="button" onClick={() => { void state.locate(); }} disabled={state.loading}><Icon name="pin" />{state.loading ? 'Finding you…' : state.fix ? 'Update location' : 'Near me'}</button></div>
    <NearbyStopsPanel {...props} state={state} />
  </div>;
}
