import type {
  AlertFeed,
  AlertTiming,
  AssessmentInput,
  DetourAlert,
  EvaluatedAlert,
  StopAssessment,
} from './types';
import { parseInstant, toWallTime, withinSchedule } from './time';

export const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

export function isFeedFresh(feed: AlertFeed, now: Date, maxAgeMs = DEFAULT_MAX_AGE_MS): boolean {
  if (feed.mode !== 'live' || !Number.isFinite(now.getTime()) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return false;
  const timestamps = [feed.fetchedAt, ...feed.sources.filter((source) => source.ok).map((source) => source.fetchedAt)];
  return timestamps.every((timestamp) => {
    if (!timestamp) return false;
    const age = now.getTime() - parseInstant(timestamp);
    return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
  });
}

export function evaluateAlertTiming(alert: DetourAlert, now: Date): { timing: AlertTiming; reason: string } {
  if (!Number.isFinite(now.getTime())) return { timing: 'uncertain', reason: 'The check time is invalid.' };
  if (alert.timingIssues.length) return { timing: 'uncertain', reason: alert.timingIssues.join(' ') };
  const start = alert.startsAt === null ? -Infinity : parseInstant(alert.startsAt);
  const end = alert.endsAt === null ? Infinity : parseInstant(alert.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
    return { timing: 'uncertain', reason: 'The alert dates are missing, invalid, or inconsistent.' };
  }
  if (now.getTime() < start) return { timing: 'inactive', reason: 'This alert has not started.' };
  if (now.getTime() >= end) return { timing: 'inactive', reason: 'This alert has ended.' };
  try {
    if (!withinSchedule(alert.schedule, toWallTime(now))) {
      return { timing: 'inactive', reason: 'This alert is outside its Philadelphia service hours.' };
    }
  } catch (error) {
    return { timing: 'uncertain', reason: error instanceof Error ? error.message : 'The service hours are unclear.' };
  }
  return { timing: 'active', reason: 'The published dates and service hours apply at this time.' };
}

function dateKey(value: string): string | null {
  const normalized = value.replaceAll('-', '');
  if (!/^\d{8}$/.test(normalized)) return null;
  const iso = `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? normalized : null;
}

function feedComplete(feed: AlertFeed): boolean {
  return feed.complete && feed.sources.every((source) => source.ok);
}

/**
 * Combines every relevant alert. Route lines and candidate geometry are never
 * evidence that a bus accepts passengers at a stop.
 */
export function assessStop(input: AssessmentInput): StopAssessment {
  const { feed, route, directionId, stopId, now } = input;
  const fresh = isFeedFresh(feed, now, input.maxAgeMs);
  const replay = input.replay === true && feed.mode === 'snapshot';
  const result: StopAssessment = {
    status: 'unknown',
    title: 'Unable to confirm this stop',
    summary: 'There is not enough current, consistent information to confirm the stop status.',
    reasons: [],
    relevantAlerts: [],
    alternative: null,
    fresh,
  };
  if (!Number.isFinite(now.getTime())) {
    result.reasons.push('Choose a valid time for this check.');
    return result;
  }
  if (feed.routeId !== route.id) {
    result.reasons.push('The alert feed does not match the selected route.');
    return result;
  }
  const direction = route.directions.find((entry) => entry.id === directionId);
  if (!direction?.stops.some((stop) => stop.id === stopId)) {
    result.reasons.push('Select a stop on this route in your chosen direction.');
    return result;
  }
  const localDate = toWallTime(now).slice(0, 10).replaceAll('-', '');
  const validFrom = dateKey(route.validFrom);
  const validThrough = dateKey(route.validThrough);
  const validRoute = !!validFrom && !!validThrough && validFrom <= validThrough && localDate >= validFrom && localDate <= validThrough;

  result.relevantAlerts = feed.alerts
    .filter((alert) => alert.directionIds.includes(directionId))
    .map((alert): EvaluatedAlert => {
      const timing = evaluateAlertTiming(alert, now);
      const listed = alert.stopCoverage !== 'unknown' && alert.skippedStopIds.includes(stopId);
      let reason = timing.reason;
      if (timing.timing !== 'inactive') {
        if (alert.sourceIssues.length) reason += ` ${alert.sourceIssues.join(' ')}`;
        if (listed) reason += ' The agency lists your stop as skipped.';
        else if (alert.stopCoverage !== 'explicit-list' || alert.skippedStopIds.length === 0) reason += ' The agency has not supplied a complete list of affected stops.';
        else reason += ' Your stop is not named in this alert’s published stop list.';
      }
      return { alert, ...timing, affectsSelectedStop: listed && timing.timing !== 'inactive', reason };
    })
    .filter((evaluation) => evaluation.timing !== 'inactive');

  if (!validRoute) result.reasons.push('The scheduled route and stop data do not cover this date.');
  if (!fresh && !replay) {
    result.reasons.push(feed.mode === 'snapshot'
      ? 'Only recorded data are available. They cannot confirm current service.'
      : 'The alert data are older than the freshness limit or their timestamps cannot be verified.');
  }
  if (!feedComplete(feed)) result.reasons.push('Some agency feeds could not be checked. Additional alerts may be missing.');
  if (replay) result.reasons.push('This is a recorded-data check at the selected historical time, not live boarding guidance.');
  result.reasons.push(...feed.warnings);
  if (!validRoute || (!fresh && !replay)) return result;

  const confirmed = result.relevantAlerts.filter(({ alert, timing, affectsSelectedStop }) =>
    timing === 'active' && affectsSelectedStop && alert.sourceIssues.length === 0,
  );
  const unresolved = result.relevantAlerts.filter(({ alert, timing, affectsSelectedStop }) =>
    timing === 'uncertain' || alert.sourceIssues.length > 0 || alert.stopCoverage === 'unknown'
      || alert.skippedStopIds.length === 0
      || alert.skippedStopIds.some((id) => !direction.stops.some((stop) => stop.id === id))
      || (alert.stopCoverage === 'partial-list' && !affectsSelectedStop),
  );

  if (confirmed.length > 0) {
    result.status = 'affected';
    result.title = 'Your stop is affected';
    result.summary = 'An active agency alert lists your stop as skipped. A verified alternative is needed before choosing another boarding point.';
    result.reasons.push(...confirmed.map(({ alert }) => `${alert.title}: the agency explicitly lists this stop as skipped.`));
    if (unresolved.length) result.reasons.push('Other alerts still have unresolved details. They may add restrictions.');
  } else if (unresolved.length > 0) {
    result.reasons.push(...unresolved.map(({ alert, reason }) => `${alert.title}: ${reason}`));
  } else if (feedComplete(feed)) {
    result.status = 'unaffected';
    result.title = 'No reported impact at this stop';
    result.summary = 'None of the current alerts checked lists an active impact at this stop. This is limited to the agency information checked; it does not confirm that a bus will stop here.';
    result.reasons.push(result.relevantAlerts.length
      ? 'Your stop is absent from the published stop lists for every applicable alert checked.'
      : 'No applicable alerts were found for this direction at this time.');
  }

  // An agency-explicit replacement must cover all confirmed closures and remain
  // usable after checking all other alerts at that replacement stop as well.
  if (result.status === 'affected' && fresh && !replay && feedComplete(feed) && unresolved.length === 0) {
    for (const boarding of input.boarding ?? []) {
      const verifiedAt = parseInstant(boarding.verifiedAt);
      const validUntil = parseInstant(boarding.validUntil);
      if (boarding.verification !== 'agency-explicit' || !/^https?:\/\//.test(boarding.sourceUrl)
        || !Number.isFinite(verifiedAt) || !Number.isFinite(validUntil)
        || verifiedAt > now.getTime() || validUntil <= now.getTime() || verifiedAt >= validUntil
        || boarding.stopId === stopId || !confirmed.every(({ alert }) => boarding.forAlertIds.includes(alert.id))) continue;
      const stop = direction.stops.find((entry) => entry.id === boarding.stopId);
      if (!stop) continue;
      const candidate = assessStop({ ...input, stopId: stop.id, boarding: [] });
      if (candidate.status === 'unaffected') {
        result.alternative = { ...boarding, stop };
        result.summary = 'An active agency alert lists your stop as skipped. The agency identifies the alternative boarding point below.';
        break;
      }
    }
  }
  return result;
}
