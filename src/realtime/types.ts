import type { DirectionId } from '../domain/types';
export interface LiveBus { id: string; tripId: string; directionId: DirectionId; lat: number; lon: number; bearing: number | null; reportedAt: number; }
export interface StopPrediction { tripId: string; vehicleId: string | null; directionId: DirectionId; stopId: string; arrivalAt: number | null; skipped: boolean; reportedAt: number; }
export interface RealtimeFeed { fetchedAt: number; vehiclesAt: number | null; predictionsAt: number | null; vehicles: LiveBus[]; predictions: StopPrediction[]; warnings: string[]; }
export const MAX_REALTIME_AGE = 120_000;
export function currentReport(timestamp: number | null, now: number): boolean {
  return timestamp !== null && Number.isFinite(timestamp) && now - timestamp <= MAX_REALTIME_AGE && timestamp <= now + 30_000;
}
