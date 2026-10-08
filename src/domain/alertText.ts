import type { DetourAlert } from './types';

export interface AlertTextPresentation {
  intro: string;
  direction: 'Northbound' | 'Southbound' | null;
  timing: string[];
  steps: string[];
  paragraphs: string[];
  originalText: string;
}

type AlertTextInput = Pick<DetourAlert, 'rawText'> & Partial<Pick<DetourAlert, 'startsAt' | 'endsAt'>>;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const compact = (value: string): string => value.replace(/\s+/g, ' ').trim();
const sentence = (value: string): string => {
  const cleaned = value.replace(/^[\s,.;]+|[\s,;]+$/g, '').trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) + (/[.!?]$/.test(cleaned) ? '' : '.') : '';
};

/** A two-digit year is expanded only when an explicit source timestamp supplies its century. */
function writtenDate(month: string, day: string, year: string | undefined, original: string, alert: AlertTextInput): string {
  const numericMonth = Number(month), numericDay = Number(day);
  let writtenYear = year;
  if (year?.length === 2) {
    const context = [alert.startsAt, alert.endsAt].find(value => value && /^\d{4}-/.test(value) && value.slice(2, 4) === year);
    if (context) writtenYear = context.slice(0, 4);
  }
  const validationYear = writtenYear?.length === 4 ? Number(writtenYear) : 2000;
  const date = new Date(Date.UTC(validationYear, numericMonth - 1, numericDay));
  if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 || date.getUTCMonth() !== numericMonth - 1 || date.getUTCDate() !== numericDay) return original;
  return `${MONTHS[numericMonth - 1]} ${numericDay}${writtenYear ? `, ${writtenYear}` : ''}`;
}

function readableText(value: string, alert: AlertTextInput): string {
  // Legacy notices insert commas at line wraps, including inside a split date.
  let text = value.replace(/(\d{1,2}-\d{1,2}-)[\s,]+(\d{2,4})\b/g, '$1$2');
  text = compact(text).replace(/\bon(?=\d)/gi, 'on ');
  text = text.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g, (original, month: string, day: string, year: string | undefined) => writtenDate(month, day, year, original, alert));
  text = text.replace(/\b(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})\b/g, (original, month: string, day: string, year: string) => writtenDate(month, day, year, original, alert));
  text = text.replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, (original, hour: string, minute: string | undefined, period: string) => {
    if (+hour < 1 || +hour > 12 || (minute !== undefined && +minute > 59)) return original;
    return `${Number(hour)}${minute === undefined ? '' : `:${minute}`} ${period.toUpperCase()}`;
  });
  return text.replace(/\b24\s*\/\s*7\b/g, 'all day, every day')
    .replace(/\bNB\b/g, 'northbound').replace(/\bSB\b/g, 'southbound')
    .replace(/\bReg(?:ular)?\.?\s+Rt\.?\b/gi, 'regular route')
    .replace(/\b(Sundays|Weekdays|Weekends)\s+Only\b/gi, '$1 only')
    .replace(/\b(AM|PM)\s*-\s*(?=\d)/g, '$1–')
    .replace(/(\b\d{1,2})\s+-\s+(?=[A-Z][a-z]+\s+\d)/g, '$1–')
    .replace(/,\s*,+/g, ',').replace(/from,\s*/gi, 'from ');
}

function writtenDirection(text: string): AlertTextPresentation['direction'] {
  const north = /\b(?:NB|northbound)\b/i.test(text), south = /\b(?:SB|southbound)\b/i.test(text);
  return north === south ? null : north ? 'Northbound' : 'Southbound';
}

function routeSteps(text: string): { timingText: string; steps: string[] } | null {
  const marker = /\b(?:(NB|SB|northbound|southbound)\s+via\s+|([RL])\s*-\s*|(Right|Left)\s+(?:on|onto)\s+|(Reg(?:ular)?\.?\s+Rt\.?))\b/gi;
  const matches = [...text.matchAll(marker)];
  if (!matches.length || !matches[0][1]) return null;
  const steps: string[] = [];
  for (let index = 0; index < matches.length; index++) {
    const current = matches[index];
    const payload = compact(text.slice(current.index + current[0].length, matches[index + 1]?.index ?? text.length)).replace(/^[,;\s]+|[,;.\s]+$/g, '');
    if (current[4]) {
      if (payload || index !== matches.length - 1) return null;
      steps.push('Rejoin the regular route.');
      continue;
    }
    // Only name a turn when its entire payload reads like a street name. A new instruction
    // or qualifier belongs in the fallback text, never hidden inside an invented route step.
    if (!payload || !/^[\p{L}\p{N} .&'’()-]+$/u.test(payload)
      || /\b(?:until|except|closed|board|buses|shuttle|only|due|continue|reverse|stop|notice)\b/i.test(payload)
      || (index > 0 && current[1])) return null;
    if (current[1]) steps.push(`Follow ${payload}.`);
    else steps.push(`Turn ${(current[2] ?? current[3]).toLowerCase().startsWith('r') ? 'right' : 'left'} onto ${payload}.`);
  }
  return { timingText: text.slice(0, matches[0].index).replace(/[\s,;]+$/g, ''), steps };
}

/** Reword only the agency's actual text. Status, recurrence conflicts and route accuracy remain separate. */
export function presentAlertText(alert: AlertTextInput): AlertTextPresentation {
  const originalText = alert.rawText;
  const direction = writtenDirection(originalText);
  const presentation: AlertTextPresentation = {
    intro: direction ? `${direction} service notice` : 'Agency service notice', direction,
    timing: [], steps: [], paragraphs: [], originalText,
  };
  const route = routeSteps(originalText);
  if (route) {
    presentation.intro = direction ? `${direction} route instructions` : 'Agency route instructions';
    presentation.steps = route.steps;
    const timing = sentence(readableText(route.timingText, alert));
    if (timing) presentation.timing.push(timing);
    return presentation;
  }

  // This complete source sentence is a stop notice, not a street-turn sequence. Repair
  // its known transcription errors while retaining the agency's broad boarding area.
  const closure = compact(originalText.replace(/,/g, ' ')).match(/^The\s+(NB|northbound)\s+Transit Stop at\s+Schuylkill and JFK\s+(?:and\s+)?is\s+(?:disontiuned|discontinued)\s+until further notice due to construction\.\s+Please board passengers\s+on Schuylkill between\s+Walnut and Chestnut\.?$/i);
  if (closure) {
    presentation.intro = 'Northbound stop change';
    presentation.paragraphs = [
      'The northbound stop at Schuylkill and JFK is closed until further notice because of construction.',
      'SEPTA says to board on Schuylkill between Walnut and Chestnut.',
    ];
    return presentation;
  }

  // Unknown formats keep their wording and qualifications. Only unambiguous abbreviations
  // are expanded; the caller still has the untouched source for inspection.
  const expanded = originalText.replace(/(^|[\n,;])\s*([RL])\s*-\s*/gi, (_match, delimiter: string, turn: string) => `${delimiter} Turn ${turn.toLowerCase() === 'r' ? 'right' : 'left'} onto `);
  const fallback = sentence(readableText(expanded, alert));
  presentation.paragraphs = [fallback || 'The agency did not provide written instructions.'];
  return presentation;
}
