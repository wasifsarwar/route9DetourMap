import type { Stop } from './types';

function words(value: string): string[] {
  return value.toLowerCase().replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/\b(street|avenue|aven|boulevard|road|lane)\b/g, word => ({ street: 'st', avenue: 'av', aven: 'av', boulevard: 'blvd', road: 'rd', lane: 'ln' })[word]!)
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/** Match intersections in either order, without confusing 7th with 17th. */
export function searchStops(stops: Stop[], query: string): Stop[] {
  const terms = words(query);
  return stops.filter(stop => {
    const candidates = words(`${stop.name} ${stop.id}`);
    return terms.every(term => candidates.some(word => /^\d+$/.test(term) ? word === term : word.startsWith(term)));
  });
}
