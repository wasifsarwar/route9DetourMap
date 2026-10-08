import type { DirectionId } from '../domain/types';
import { currentReport, type RealtimeFeed } from './types';
export function busesForDirection(feed: RealtimeFeed | null, direction: DirectionId, now: number) {
  return feed && currentReport(feed.vehiclesAt, now) ? feed.vehicles.filter(v => v.directionId === direction && currentReport(v.reportedAt, now)) : [];
}
export function arrivalsForStop(feed: RealtimeFeed | null, direction: DirectionId, stopId: string, now: number) {
  if (!feed || !currentReport(feed.predictionsAt, now)) return [];
  return feed.predictions.filter(p => p.directionId === direction && p.stopId === stopId && !p.skipped && p.arrivalAt !== null && p.arrivalAt >= now && currentReport(p.reportedAt, now))
    .sort((a,b) => a.arrivalAt! - b.arrivalAt!).filter((p, index, values) => values.findIndex(other => other.tripId === p.tripId) === index);
}
export const arrivalMinutes = (arrivalAt: number, now: number) => Math.max(1, Math.ceil((arrivalAt - now) / 60_000));
