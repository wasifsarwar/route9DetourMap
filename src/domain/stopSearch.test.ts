import { describe, expect, it } from 'vitest';
import { searchStops } from './stopSearch';
const stops = [
  { id: '1', name: 'Walnut St & 7th St', lat: 0, lon: 0 },
  { id: '2', name: 'Walnut St & 17th St', lat: 0, lon: 0 },
  { id: '3', name: 'Schuylkill Av & JFK Blvd', lat: 0, lon: 0 },
];
describe('stop search', () => {
  it('matches intersections regardless of order, punctuation, case, or ordinal suffix', () => {
    for (const query of ['Walnut 7th', '7 WALNUT', 'walnut & 7th street']) expect(searchStops(stops, query)).toEqual([stops[0]]);
  });
  it('expands street types and supports partial street names', () => {
    expect(searchStops(stops, 'Schuyl avenue JFK boulevard')).toEqual([stops[2]]);
  });
  it('keeps route order for empty searches and returns no results for unknown streets', () => {
    expect(searchStops(stops, '  ')).toEqual(stops);
    expect(searchStops(stops, 'Broad')).toEqual([]);
  });
});
