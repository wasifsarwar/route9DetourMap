import type { AlertFeed, DetourAlert, FeedSource, ServiceWindow } from '../domain/types';

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isNonemptyText = (value: unknown): value is string => isText(value) && value.trim().length > 0;
const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const isTimestamp = (value: unknown): value is string => {
  if (!isText(value) || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  // Date.parse silently rolls February 30 into March. Keep every timestamp's written date valid.
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10);
};
const isBoundary = (value: unknown): boolean => value === null || isTimestamp(value);
function isUrl(value: unknown): value is string {
  if (!isText(value)) return false;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
const isCoordinate = (value: unknown): boolean => Array.isArray(value) && value.length === 2
  && typeof value[0] === 'number' && Number.isFinite(value[0]) && Math.abs(value[0]) <= 90
  && typeof value[1] === 'number' && Number.isFinite(value[1]) && Math.abs(value[1]) <= 180;
const isLine = (value: unknown): boolean => Array.isArray(value) && value.length >= 2 && value.every(isCoordinate);
const isGeometry = (value: unknown): boolean => Array.isArray(value) && value.every(isLine);
const isTime = (value: unknown, allowMidnight = false): boolean => isText(value) && (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) || (allowMidnight && value === '24:00'));
function isSchedule(value: unknown): value is ServiceWindow | null {
  return value === null || (isRecord(value) && Array.isArray(value.days) && value.days.length > 0
    && value.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
    && new Set(value.days).size === value.days.length && isTime(value.startTime) && isTime(value.endTime, true));
}
function isSource(value: unknown): value is FeedSource {
  return isRecord(value) && isNonemptyText(value.name) && isUrl(value.url) && typeof value.ok === 'boolean'
    && (value.ok ? isTimestamp(value.fetchedAt) : isBoundary(value.fetchedAt))
    && (value.error === undefined || isText(value.error));
}
function isAlert(value: unknown): value is DetourAlert {
  if (!isRecord(value)) return false;
  return isNonemptyText(value.id) && isNonemptyText(value.title) && isText(value.rawText) && isUrl(value.sourceUrl)
    && Array.isArray(value.directionIds) && value.directionIds.length > 0 && value.directionIds.every(direction => direction === '0' || direction === '1')
    && new Set(value.directionIds).size === value.directionIds.length && isBoundary(value.startsAt) && isBoundary(value.endsAt)
    && isSchedule(value.schedule) && isTexts(value.timingIssues) && isTexts(value.geometryIssues) && isTexts(value.sourceIssues)
    && isGeometry(value.geometry) && isGeometry(value.unservedGeometry) && (value.candidateGeometry === undefined || isLine(value.candidateGeometry))
    && isTexts(value.skippedStopIds) && value.skippedStopIds.every(isNonemptyText) && ['explicit-list', 'partial-list', 'unknown'].includes(String(value.stopCoverage))
    && (value.boardingNote === undefined || (isRecord(value.boardingNote) && isNonemptyText(value.boardingNote.text)
      && isUrl(value.boardingNote.sourceUrl) && value.boardingNote.precision === 'area-only'));
}

/** Treat a malformed deployment as unavailable, so consumers keep their existing safe fallback. */
export function validateLiveFeed(value: unknown): AlertFeed {
  if (!isRecord(value) || value.routeId !== '9' || value.mode !== 'live' || !isTimestamp(value.fetchedAt)
    || (value.collectedAt !== undefined && !isTimestamp(value.collectedAt))
    || typeof value.complete !== 'boolean' || !isTexts(value.warnings)
    || !Array.isArray(value.sources) || value.sources.length === 0 || !value.sources.every(isSource)
    || !Array.isArray(value.alerts) || !value.alerts.every(isAlert)) throw new Error('Current alerts failed validation. Please try refreshing again.');
  const ids = value.alerts.map(alert => alert.id);
  if (new Set(ids).size !== ids.length) throw new Error('Current alerts contain duplicate records. Please try refreshing again.');
  return value as unknown as AlertFeed;
}
