import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import type { Coordinate, RouteDirection } from '../domain/types';
import type { RealtimeFeed, LiveBus } from '../realtime/types';
import { currentReport } from '../realtime/types';
import { observationKey, retainObservations, distanceToPaths } from '../realtime/observations';
import './BusReview.css';
export function BusReview({ map, feed, now, direction, candidate, candidateLabel, onExplore }: {
  onExplore: () => void; map: L.Map; feed: RealtimeFeed | null; now: number; direction: RouteDirection;
  candidate: Coordinate[][]; candidateLabel: string;
}) {
  const [recording, setRecording] = useState(false);
  const [points, setPoints] = useState<LiveBus[]>([]);
  const [selected, setSelected] = useState('');
  const [overlay, setOverlay] = useState(true);
  useEffect(() => {
    const incoming = recording && document.visibilityState === 'visible' && feed && currentReport(feed.vehiclesAt, now) ? feed.vehicles : [];
    setPoints(previous => retainObservations(previous, incoming, now));
  }, [feed, now, recording]);
  const trips = [...new Map(points.filter(p => p.directionId === direction.id).map(p => [observationKey(p), p])).entries()];
  const key = trips.some(([k]) => k === selected) ? selected : trips[0]?.[0] ?? '';
  const trail = useMemo(() => points.filter(p => observationKey(p) === key), [points, key]);
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    if (overlay) for (const p of trail) {
      const text = document.createElement('span');
      text.textContent = `Bus ${p.id} · ${new Date(p.reportedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} Philadelphia time · observed position`;
      L.circleMarker([p.lat,p.lon], { radius: 5, color: '#663b94', fillColor: '#fff', fillOpacity: .9, weight: 2 }).bindTooltip(text).addTo(group);
    }
    return () => { group.remove(); };
  }, [map, trail, overlay]);
  function exportEvidence() {
    const data = { version: 1, exportedAt: new Date().toISOString(), source: 'SEPTA GTFS-Realtime via Route 9 relay', note: 'Observed points only. Missing intervals are unknown. Positions do not confirm boarding.', tripKey: key,
      observations: trail, comparisonAtExport: { normalShape: direction.shape, candidateLabel, candidatePaths: candidate } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'route9-observations.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const latest = trail.at(-1);
  const normalDistance = latest ? distanceToPaths([latest.lat,latest.lon], [direction.shape]) : null;
  const candidateDistance = latest ? distanceToPaths([latest.lat,latest.lon], candidate) : null;
  const gaps = trail.slice(1).filter((p,i) => p.reportedAt-trail[i].reportedAt > 120000).length;
  return <details className="bus-review">
    <summary>Test tool · Bus path review {recording ? '· Recording' : '· Paused'}</summary>
    <div className="bus-review__body">
      <p>Collects only while this page is open and visible. Keeps up to one hour in memory; reload clears it. Purple dots are reported positions, not a verified route or boarding locations.</p>
      <div className="bus-review__actions"><button onClick={() => setRecording(!recording)}>{recording ? 'Pause recording' : 'Start recording'}</button><button onClick={() => { setRecording(false); setPoints([]); setSelected(''); }}>Clear observations</button><a href="./">Exit test mode</a></div>
      {recording && <p role="status">{!feed || !currentReport(feed.vehiclesAt, now) ? 'Waiting for fresh bus positions.' : 'Recording both directions. Choose a trip below to review.'}</p>}
      <label>Observed bus / trip<select value={key} onChange={e => setSelected(e.target.value)}><option value="">Choose a recorded trip</option>{trips.map(([k,p]) => <option key={k} value={k}>Bus {p.id} · trip {p.tripId} · {direction.label}</option>)}</select></label>
      <div className="bus-review__actions"><label><input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)} />Show observed positions</label><button disabled={!trail.length} onClick={() => { onExplore(); map.fitBounds(L.latLngBounds(trail.map(p => [p.lat,p.lon] as Coordinate)), { padding: [40,90], maxZoom: 16 }); }}>Fit observations</button><button disabled={!trail.length} onClick={exportEvidence}>Export JSON</button></div>
      <p>{trail.length} unique reports · {gaps} gaps over two minutes. Dots are never joined across unobserved travel.</p>
      {latest && <p>Latest observed point: {new Date(latest.reportedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} Philadelphia time. Approximate distance to normal path: {normalDistance ?? 'unknown'} m. {candidateDistance === null ? 'Explore a detour to compare its displayed path.' : `Distance to ${candidateLabel}: ${candidateDistance} m.`} Proximity alone does not verify a detour.</p>}
    </div>
  </details>;
}
