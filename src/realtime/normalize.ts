import { currentReport, type RealtimeFeed } from './types';
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown) => typeof value === 'string' && value.trim() && !['None', '0'].includes(value) ? value : null;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const time = (value: unknown) => { const n = number(value); return n !== null && n > 0 ? n * 1000 : null; };
function header(raw: unknown, now: number): number | null {
  const h = record(record(raw).header);
  if (h.incrementality && h.incrementality !== 'FULL_DATASET') return null;
  const timestamp = time(h.timestamp);
  return currentReport(timestamp, now) ? timestamp : null;
}
const direction = (raw: unknown) => raw === 0 ? '0' as const : raw === 1 ? '1' as const : null;
const canceled = (raw: unknown) => raw === 'CANCELED' || raw === 'DELETED';
/** Only explicit route, direction, timestamp and absolute predicted times are used. */
export function normalizeRealtime(vehiclesRaw: unknown, predictionsRaw: unknown, now: number): RealtimeFeed {
  const feed: RealtimeFeed = { fetchedAt: now, vehiclesAt: header(vehiclesRaw, now), predictionsAt: header(predictionsRaw, now), vehicles: [], predictions: [], warnings: [] };
  if (feed.vehiclesAt === null) feed.warnings.push('Live bus locations unavailable or out of date.');
  if (feed.predictionsAt === null) feed.warnings.push('Arrival predictions unavailable or out of date.');
  const canceledTrips = new Set<string>();
  if (feed.predictionsAt !== null) for (const raw of list(record(predictionsRaw).entity)) {
    const entity = record(raw); if (entity.isDeleted) continue;
    const update = record(entity.tripUpdate), trip = record(update.trip);
    if (trip.routeId !== '9') continue;
    const tripId = string(trip.tripId), directionId = direction(trip.directionId);
    if (!tripId || !directionId) continue;
    if (canceled(trip.scheduleRelationship)) { canceledTrips.add(tripId); continue; }
    const reportedAt = update.timestamp === undefined ? feed.predictionsAt : time(update.timestamp);
    if (!currentReport(reportedAt, now)) continue;
    for (const rawStop of list(update.stopTimeUpdate)) {
      const stop = record(rawStop), stopId = string(stop.stopId);
      if (!stopId || stop.scheduleRelationship === 'NO_DATA') continue;
      const skipped = stop.scheduleRelationship === 'SKIPPED';
      const arrivalAt = time(record(stop.arrival).time);
      if (!skipped && (arrivalAt === null || arrivalAt < now || arrivalAt > now + 4 * 3600_000)) continue;
      feed.predictions.push({ tripId, vehicleId: string(record(update.vehicle).id), directionId, stopId, arrivalAt: skipped ? null : arrivalAt, skipped, reportedAt: reportedAt! });
    }
  }
  if (feed.vehiclesAt !== null) for (const raw of list(record(vehiclesRaw).entity)) {
    const entity = record(raw); if (entity.isDeleted) continue;
    const vehicle = record(entity.vehicle), trip = record(vehicle.trip), position = record(vehicle.position);
    const id = string(record(vehicle.vehicle).id), tripId = string(trip.tripId), directionId = direction(trip.directionId);
    const lat = number(position.latitude), lon = number(position.longitude), reportedAt = time(vehicle.timestamp), bearing = number(position.bearing);
    if (trip.routeId !== '9' || !id || !tripId || !directionId || canceled(trip.scheduleRelationship) || canceledTrips.has(tripId)) continue;
    if (lat === null || lon === null || lat < 39.7 || lat > 40.3 || lon < -75.6 || lon > -74.9 || !currentReport(reportedAt, now)) continue;
    feed.vehicles.push({ id, tripId, directionId, lat, lon, bearing: bearing !== null && bearing >= 0 && bearing < 360 ? bearing : null, reportedAt: reportedAt! });
  }
  feed.vehicles = [...new Map(feed.vehicles.map(bus => [bus.id, bus])).values()];
  feed.predictions = feed.predictions.filter(p => !canceledTrips.has(p.tripId));
  return feed;
}
