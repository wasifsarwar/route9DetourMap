import type { ServiceWindow } from './types';

export const ZONE = 'America/New_York';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parts(instant: Date | string | number): Record<string, string> {
  return Object.fromEntries(
    formatter.formatToParts(new Date(instant)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
}

export function toWallTime(instant: Date | string | number): string {
  const part = parts(instant);
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}

/** Interpret datetime-local input in Philadelphia, independent of the device zone. */
export function parseWallTime(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('Choose a valid date and time.');
  }
  const [year, month, day, hour, minute] = value.match(/\d+/g)!.map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall;
  for (let i = 0; i < 4; i += 1) {
    const part = parts(guess);
    const displayed = Date.UTC(+part.year, +part.month - 1, +part.day, +part.hour, +part.minute);
    guess += wall - displayed;
  }
  // Reject invalid calendar dates and the missing spring-forward hour.
  if (toWallTime(guess) !== value) {
    throw new Error('This Philadelphia time does not exist. Choose another time.');
  }
  return guess;
}

/** Source instants must include a time zone and contain real calendar dates. */
export function parseInstant(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return NaN;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const calendar = new Date(Date.UTC(+year, +month - 1, +day));
  if (calendar.getUTCFullYear() !== +year || calendar.getUTCMonth() !== +month - 1 || calendar.getUTCDate() !== +day
    || +hour > 23 || +minute > 59 || +(second ?? '0') > 59 || +(offsetHour ?? '0') > 23 || +(offsetMinute ?? '0') > 59) return NaN;
  return Date.parse(value);
}

function clockMinutes(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && value !== '24:00') {
    throw new Error('The alert has an invalid daily time window.');
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** End-exclusive windows. After-midnight hours belong to the previous service day. */
export function withinSchedule(schedule: ServiceWindow | null, localTime: string): boolean {
  if (!schedule) return true;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime)) {
    throw new Error('Choose a valid date and time.');
  }
  if (!schedule.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) {
    throw new Error('The alert has invalid service days.');
  }
  const [date, time] = localTime.split('T');
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const current = clockMinutes(time);
  const start = clockMinutes(schedule.startTime);
  const end = clockMinutes(schedule.endTime);
  if (start === end) {
    throw new Error('The alert has an ambiguous daily time window.');
  }
  if (start < end) return schedule.days.includes(day) && current >= start && current < end;
  return (current >= start && schedule.days.includes(day))
    || (current < end && schedule.days.includes((day + 6) % 7));
}
