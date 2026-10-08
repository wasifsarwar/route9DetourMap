import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { AlertFeed, Coordinate, DetourAlert, DirectionId, FeedSource, RouteData, ServiceWindow } from '../domain/types';

export const SOURCES = {
  detours: 'https://www3.septa.org/api/v2/detours/?route=9',
  legacy: 'https://www3.septa.org/api/Alerts/get_alert_data.php?route_id=bus_route_9',
  northbound: 'https://www3.septa.org/api/v2/kml/?route=9&type=bus&direction=1',
  southbound: 'https://www3.septa.org/api/v2/kml/?route=9&type=bus&direction=0',
} as const;
export type SourceKey = keyof typeof SOURCES;
export interface SourceResult { value?: unknown; fetchedAt: string | null; error?: string }
export type RawFeed = Record<SourceKey, SourceResult>;

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const string = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const array = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ZONE = 'America/New_York';
const wallFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** SEPTA timestamps omit an offset. Parse in Philadelphia, never the browser timezone. */
export function parseAgencyDate(value: unknown): string | null {
  const match = string(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  const [, month, day, year, hours, minutes, seconds = '0', meridiem] = match;
  let hour = Number(hours);
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem.toUpperCase() === 'PM' ? 12 : 0);
  }
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31 || hour > 23 || +minutes > 59 || +seconds > 59) return null;
  const wall = Date.UTC(+year, +month - 1, +day, hour, +minutes, +seconds);
  const expected = { year: +year, month: +month, day: +day, hour, minute: +minutes, second: +seconds };
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(wallFormatter.formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, +part.value]));
    instant += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  const actual = Object.fromEntries(wallFormatter.formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, +part.value]));
  if (Object.entries(expected).some(([key, value]) => actual[key] !== value)) return null;
  // A repeated fall-back wall time needs an explicit offset; guessing could shift a closure by an hour.
  for (const candidate of [instant - 3_600_000, instant + 3_600_000]) {
    const repeated = Object.fromEntries(wallFormatter.formatToParts(candidate).filter(part => part.type !== 'literal').map(part => [part.type, +part.value]));
    if (Object.entries(expected).every(([key, value]) => repeated[key] === value)) return null;
  }
  return new Date(instant).toISOString();
}

function normalizeSchedule(raw: unknown, text: string, issues: string[]): ServiceWindow | null {
  const entries = Object.entries(object(raw));
  if (!entries.length) {
    issues.push('SEPTA did not supply interpretable daily operating hours.');
    return null;
  }
  const active: { day: number; start: string; end: string }[] = [];
  for (const [dayName, value] of entries) {
    if (!string(value)) continue;
    const day = DAYS.indexOf(dayName);
    const match = string(value).match(/^(\d{2}:\d{2}):\d{2}-(\d{2}:\d{2}):(\d{2})$/);
    if (day === -1 || !match || !/^([01]\d|2[0-3]):[0-5]\d$/.test(match[1]) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(match[2])) {
      issues.push('One of SEPTA’s daily operating windows could not be interpreted.');
      continue;
    }
    active.push({ day, start: match[1], end: match[2] === '23:59' && match[3] === '59' ? '24:00' : match[2] });
  }
  if (!active.length) {
    issues.push('No active daily operating windows could be confirmed.');
    return null;
  }
  const days = active.map(window => window.day).sort((a, b) => a - b);
  if (/weekdays?\s+only/i.test(text) && days.some(day => day === 0 || day === 6)) issues.push('The text says weekdays only, but the structured schedule includes weekends.');
  if (/sundays?\s+only/i.test(text) && days.some(day => day !== 0)) issues.push('The text says Sundays only, but the structured schedule includes other days.');
  if (/weekends?\s+only/i.test(text) && days.some(day => day > 0 && day < 6)) issues.push('The text says weekends only, but the structured schedule includes weekdays.');
  const first = active[0];
  const writtenHours = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (writtenHours) {
    const time = (hour: string, minute: string | undefined, period: string) => `${String(Number(hour) % 12 + (period.toLowerCase() === 'pm' ? 12 : 0)).padStart(2, '0')}:${minute ?? '00'}`;
    if (time(writtenHours[1], writtenHours[2], writtenHours[3]) !== first.start || time(writtenHours[4], writtenHours[5], writtenHours[6]) !== first.end) issues.push('The written operating hours disagree with the structured daily hours.');
  }
  if (/24\s*\/\s*7/.test(text) && (days.length !== 7 || active.some(window => window.start !== '00:00' || window.end !== '24:00'))) issues.push('The text says 24/7, but the structured schedule is more limited.');
  if (active.some(window => window.start !== first.start || window.end !== first.end)) {
    issues.push('Daily operating hours vary by day and need review.');
    return null;
  }
  return { days, startTime: first.start, endTime: first.end };
}

function dateIssues(rawText: string, start: string | null, end: string | null): string[] {
  const issues: string[] = [];
  if (!start) issues.push('The start time is missing or could not be interpreted.');
  if (!end) issues.push('The end time is missing or could not be interpreted.');
  if (start && end && Date.parse(start) >= Date.parse(end)) issues.push('The structured end time is not after the start time.');
  const textEnd = rawText.match(/until\s+(?:(?:\d{1,2}(?::\d{2})?\s*[ap]m)\s+(?:on\s+)?)?(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (textEnd && end) {
    const year = textEnd[3].length === 2 ? `20${textEnd[3]}` : textEnd[3];
    const textDay = `${year}-${textEnd[1].padStart(2, '0')}-${textEnd[2].padStart(2, '0')}`;
    const endParts = Object.fromEntries(wallFormatter.formatToParts(new Date(end)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const structuredDay = `${endParts.year}-${endParts.month}-${endParts.day}`;
    const writtenClock = rawText.match(/until\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)\s+(?:on\s+)?\d{1,2}\/\d{1,2}\/\d{2,4}/i);
    if (writtenClock && textDay === structuredDay) {
      const expectedHour = Number(writtenClock[1]) % 12 + (writtenClock[3].toLowerCase() === 'pm' ? 12 : 0);
      if (expectedHour !== Number(endParts.hour) || Number(writtenClock[2] ?? 0) !== Number(endParts.minute)) issues.push('The written end time disagrees with the structured end time.');
    }
    if (textDay !== structuredDay) issues.push(`The written end date (${textDay}) disagrees with the structured end date (${structuredDay}).`);
  }
  return issues;
}

interface Geometry { detour: Coordinate[][]; unserved: Coordinate[][]; warnings: string[] }
export function parseKml(value: unknown): Record<string, Geometry> {
  const xml = string(value);
  if (!xml || XMLValidator.validate(xml) !== true) throw new Error('SEPTA returned invalid KML.');
  const root = object(new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false }).parse(xml));
  if (!root.kml) throw new Error('The map response does not contain a KML document.');
  const output: Record<string, Geometry> = {};
  // A recursive walk also accepts Folder/MultiGeometry wrappers and namespace prefixes.
  function visit(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const item = object(value);
    for (const placemark of array(item.Placemark)) {
      const mark = object(placemark);
      const match = string(mark.name).match(/^PROD:(DETOUR|UNSERVERD|UNSERVED):(D\d+)$/);
      if (!match) continue;
      const geometry = output[match[2]] ??= { detour: [], unserved: [], warnings: [] };
      function lines(node: unknown): void {
        if (Array.isArray(node)) { node.forEach(lines); return; }
        const data = object(node);
        if (data.LineString) for (const rawLine of array(data.LineString)) {
          const text = string(object(rawLine).coordinates);
          const tokens = text.split(/\s+/).filter(Boolean);
          const points: Coordinate[] = [];
          let invalid = false;
          for (const token of tokens) {
            const [longitude, latitude] = token.split(',').map(Number);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { invalid = true; break; }
            points.push([latitude, longitude]);
          }
          if (invalid || points.length < 2) geometry.warnings.push('An invalid map segment was omitted.');
          else {
            geometry[match![1] === 'DETOUR' ? 'detour' : 'unserved'].push(points);
            const first = points[0], last = points[points.length - 1];
            if (first[0] === last[0] && first[1] === last[1]) geometry.warnings.push(match![1] === 'DETOUR' ? 'The published detour forms a closed loop; its geometry needs review.' : 'The published skipped route segment has identical endpoints.');
          }
        }
        Object.entries(data).filter(([key]) => key !== 'LineString').forEach(([, child]) => { if (child && typeof child === 'object') lines(child); });
      }
      lines(mark);
    }
    Object.entries(item).filter(([key]) => key !== 'Placemark').forEach(([, child]) => visit(child));
  }
  visit(root);
  return output;
}

function directionIds(raw: unknown, text: string): DirectionId[] {
  if (raw === '0' || raw === 0) return ['0'];
  if (raw === '1' || raw === 1) return ['1'];
  const north = /\b(NB|northbound)\b/i.test(text), south = /\b(SB|southbound)\b/i.test(text);
  return north !== south ? [north ? '1' : '0'] : ['0', '1'];
}

function normalizeV2(raw: ObjectValue, geometry: Record<string, Geometry>): DetourAlert {
  const rawText = string(raw.raw_card_message) || string(raw.message);
  const startsAt = parseAgencyDate(raw.start), endsAt = parseAgencyDate(raw.end);
  const timingIssues = dateIssues(rawText, startsAt, endsAt);
  const schedule = normalizeSchedule(raw.day_time_active_info, rawText, timingIssues);
  const id = string(raw.detour_id);
  const shapes = geometry[id];
  const geometryIssues = [...(shapes?.warnings ?? ['A current detour map is unavailable.'])];
  const namedIntersections = Object.values(object(raw.coordinate_detail_from_message));
  const lastIntersection = namedIntersections[namedIntersections.length - 1];
  const endLocation = string(raw.end_location).split(',').map(Number);
  if (Array.isArray(lastIntersection) && endLocation.length === 2 && [...lastIntersection.slice(0, 2), ...endLocation].every(Number.isFinite)) {
    const northSouth = (Number(lastIntersection[0]) - endLocation[0]) * 111_320;
    const eastWest = (Number(lastIntersection[1]) - endLocation[1]) * 111_320 * Math.cos(endLocation[0] * Math.PI / 180);
    if (Math.hypot(northSouth, eastWest) > 200) geometryIssues.push('The published path endpoint is more than 200 meters from the last named intersection; the route geometry needs review.');
  }
  const sourceIssues: string[] = [];
  if (!rawText) sourceIssues.push('SEPTA did not provide a readable alert message.');
  if (raw.is_parsed === false || raw.exception) sourceIssues.push('SEPTA reports an incomplete alert interpretation.');
  const skippedStopIds = Object.keys(object(raw.skipped_stops)).filter(id => /^\d+$/.test(id));
  return {
    id, title: string(raw.reason) || 'Route 9 alert', directionIds: directionIds(raw.direction_id, rawText), startsAt, endsAt, schedule, rawText, sourceUrl: SOURCES.detours,
    timingIssues, sourceIssues, geometryIssues,
    geometry: shapes?.detour ?? [], unservedGeometry: shapes?.unserved ?? [], skippedStopIds,
    stopCoverage: skippedStopIds.length ? 'explicit-list' : 'unknown',
  };
}

function normalizeLegacy(raw: ObjectValue, text: string, id: string, route?: RouteData): DetourAlert {
  const startsAt = parseAgencyDate(raw.detour_start_date_time), endsAt = parseAgencyDate(raw.detour_end_date_time);
  const directions = directionIds(undefined, text);
  const timingIssues = dateIssues(text, startsAt, endsAt);
  if (/\b(?:weekdays?|weekends?|sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?)\s+only\b|\d{1,2}(?::\d{2})?\s*[ap]m\s*-\s*\d{1,2}/i.test(text)) timingIssues.push('This service notice describes recurring hours without a structured schedule; the active hours need review.');
  // The one agency wording we have reviewed names an intersection, not a replacement point.
  // Match its content and the GTFS stop name, never only an alert ID that could be reused.
  const namesClosedIntersection = /(?:NB|northbound)\s+Transit\s+Stop\s+at[\s,]*Schuylkill\s+and\s+JFK\b/i.test(text)
    && /dis(?:cont|ont)i(?:nued|uned)|discontinued|closed/i.test(text);
  const closedStop = namesClosedIntersection ? route?.directions.find(direction => direction.id === '1')?.stops.find(stop => /^Schuylkill Av & JFK Blvd$/i.test(stop.name)) : undefined;
  return {
    id, title: string(raw.detour_reason) || 'Route 9 service notice', directionIds: directions, startsAt, endsAt, schedule: null, rawText: text, sourceUrl: SOURCES.legacy,
    timingIssues, sourceIssues: [],
    geometryIssues: ['This notice is published in SEPTA’s service notices and has no detour map.', ...(closedStop ? ['Closed stop matched by the explicitly named northbound Schuylkill/JFK intersection in the agency text and GTFS stop name.'] : [])],
    geometry: [], unservedGeometry: [], skippedStopIds: closedStop ? [closedStop.id] : [], stopCoverage: closedStop ? 'partial-list' : 'unknown',
    ...(closedStop && /Please board passengers[\s,]+on Schuylkill between[\s,]+Walnut and Chestnut/i.test(text) ? { boardingNote: { text: 'SEPTA says to board on Schuylkill between Walnut and Chestnut. The notice does not identify an exact stop or boarding point.', sourceUrl: SOURCES.legacy, precision: 'area-only' as const } } : {}),
  };
}

/** Ignore presentation differences, including legacy expansion of the agency's L/R shorthand. */
function comparableText(value: string): string {
  return value.toLowerCase().replace(/\b([rl])\s*-/g, (_, turn: string) => turn === 'r' ? 'right' : 'left')
    .replace(/\b(right|left)\s+on\b/g, '$1').replace(/[^a-z0-9]/g, '');
}

function preserveLegacyDisagreement(primary: DetourAlert, legacy: DetourAlert): boolean {
  let disagrees = false;
  for (const boundary of ['startsAt', 'endsAt'] as const) {
    const a = primary[boundary], b = legacy[boundary];
    // Legacy timestamps are only minute precision; a seconds-only difference is expected.
    if (a && b && Math.abs(Date.parse(a) - Date.parse(b)) >= 60_000) {
      const issue = `SEPTA's detour and service-notice feeds disagree about the ${boundary === 'startsAt' ? 'start' : 'end'} time (${a} versus ${b}).`;
      primary.timingIssues.push(issue);
      legacy.timingIssues.push(issue);
      disagrees = true;
    }
  }
  if (legacy.directionIds.length === 1 && (primary.directionIds.length !== 1 || primary.directionIds[0] !== legacy.directionIds[0])) {
    const issue = 'SEPTA’s detour and service-notice feeds disagree about the affected direction.';
    primary.sourceIssues.push(issue);
    legacy.sourceIssues.push(issue);
    disagrees = true;
  }
  if (comparableText(primary.rawText) !== comparableText(legacy.rawText)) {
    const issue = 'SEPTA’s detour and service-notice feeds publish different instructions for this alert. Both versions need review.';
    primary.sourceIssues.push(issue);
    legacy.sourceIssues.push(issue);
    disagrees = true;
  }
  return disagrees;
}

/** Invalid responses are failed sources, never silently interpreted as an empty feed. */
export function normalizeFeed(raw: RawFeed, route?: RouteData, mode: AlertFeed['mode'] = 'live'): AlertFeed {
  const warnings: string[] = [];
  const sources: FeedSource[] = [];
  const parsed: Partial<Record<SourceKey, unknown>> = {};
  for (const key of Object.keys(SOURCES) as SourceKey[]) {
    const result = raw[key];
    let error = result.error;
    try {
      if (!error && !Number.isFinite(Date.parse(result.fetchedAt ?? ''))) throw new Error('The source retrieval time is unavailable.');
      if (!error && (key === 'detours' || key === 'legacy')) {
        if (!Array.isArray(result.value) || result.value.some(record => !record || typeof record !== 'object' || Array.isArray(record))) throw new Error('Expected an array of alert records.');
        parsed[key] = result.value;
      } else if (!error) parsed[key] = parseKml(result.value);
    } catch (failure) { error = failure instanceof Error ? failure.message : 'Invalid source response.'; }
    sources.push({ name: key === 'legacy' ? 'SEPTA service notices' : key === 'detours' ? 'SEPTA detours' : `SEPTA ${key} maps`, url: SOURCES[key], fetchedAt: result.fetchedAt, ok: !error, ...(error ? { error } : {}) });
  }
  const geometry = { ...object(parsed.northbound), ...object(parsed.southbound) } as Record<string, Geometry>;
  const alerts: DetourAlert[] = [];
  for (const rawRecord of (parsed.detours ?? []) as ObjectValue[]) {
    if (string(rawRecord.route_id) !== '9' || !/^D\d+$/.test(string(rawRecord.detour_id))) {
      warnings.push('An unexpected detour record could not be assigned to Route 9.');
      continue;
    }
    alerts.push(normalizeV2(rawRecord, geometry));
  }
  for (const [index, rawRecord] of ((parsed.legacy ?? []) as ObjectValue[]).entries()) {
    if (string(rawRecord.route_id) !== 'bus_route_9') { warnings.push('An unexpected service notice could not be assigned to Route 9.'); continue; }
    const text = string(rawRecord.detour_message);
    const id = `D${string(rawRecord.detour_id)}`;
    if (text) {
      const primary = alerts.find(alert => alert.id === id);
      const legacy = normalizeLegacy(rawRecord, text, id === 'D' ? `legacy-${index}` : id, route);
      if (!primary) alerts.push(legacy);
      else if (preserveLegacyDisagreement(primary, legacy)) alerts.push({ ...legacy, id: `${id}-legacy-${index}`, title: `${legacy.title} — service notice` });
    }
    for (const field of ['current_message', 'advisory_message']) {
      const notice = string(rawRecord[field]);
      if (notice && !alerts.some(alert => alert.rawText === notice)) alerts.push(normalizeLegacy(rawRecord, notice, `notice-${string(rawRecord.advisory_id) || index}-${field}`, route));
    }
  }
  const times = sources.filter(source => source.ok && source.fetchedAt).map(source => Date.parse(source.fetchedAt!)).filter(Number.isFinite);
  // Age is bounded by the oldest successful upstream retrieval, not the build or page-load time.
  const fetchedAt = times.length ? new Date(Math.min(...times)).toISOString() : new Date(0).toISOString();
  const complete = sources.slice(0, 2).every(source => source.ok) && warnings.length === 0;
  if (!complete) warnings.push('Not all Route 9 alert sources could be checked. Stop status may be incomplete.');
  if (sources.slice(2).some(source => !source.ok)) warnings.push('Some current detour maps could not be loaded; alert text is still evaluated.');
  return { routeId: '9', alerts, fetchedAt, mode, complete, sources, warnings };
}
