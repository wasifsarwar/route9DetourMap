import { useCallback, useState } from 'react';
import type { DirectionId, RouteData } from '../domain/types';
import { readJourneyPreference, resolveJourney, resolveMapStop, writeJourneyPreference, type JourneyPreference, type JourneySelection } from './journeyPreference';

/** Remember the last route direction and stop, independently of replay or map inspection. */
export function useSavedJourney(route: RouteData | undefined) {
  const [preference, setPreference] = useState<JourneyPreference | null>(() => readJourneyPreference());
  const selection = route ? resolveJourney(route, preference) : null;
  const direction = selection?.direction;
  const stop = selection?.stop;

  const commit = useCallback((next: JourneySelection) => {
    if (!route) return;
    const value: JourneyPreference = { version: 1, routeId: route.id, directionId: next.direction.id, stopId: next.stop.id };
    setPreference(value);
    writeJourneyPreference(value);
  }, [route]);

  const selectDirection = useCallback((id: DirectionId) => {
    if (!route || direction?.id === id) return;
    const nextDirection = route.directions.find(item => item.id === id && item.stops.length > 0);
    if (!nextDirection) return;
    commit({ direction: nextDirection, stop: nextDirection.stops.find(item => item.id === '30576') ?? nextDirection.stops[0] });
  }, [route, direction, commit]);

  const selectStop = useCallback((id: string) => {
    const nextStop = direction?.stops.find(item => item.id === id);
    if (!direction || !nextStop) return;
    commit({ direction, stop: nextStop });
  }, [direction, commit]);

  const selectMapStop = useCallback((directionId: DirectionId, stopId: string) => {
    const next = route ? resolveMapStop(route, directionId, stopId) : null;
    if (next) commit(next);
  }, [route, commit]);
  return { direction, stop, selectDirection, selectStop, selectMapStop };
}
