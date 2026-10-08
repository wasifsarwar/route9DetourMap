import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinate, DetourAlert, RouteDirection, Stop, StopAssessment } from '../domain/types';
import { buildDetourTrace, samplePathPoints } from '../domain/mapGeometry';
import './RouteMap.css';

interface RouteMapProps {
  direction: RouteDirection;
  stop: Stop;
  assessment: StopAssessment;
  onSelectStop: (stopId: string) => void;
  reviewedAlerts: DetourAlert[];
  inspectedAlertId: string;
  inspectionRequest: number;
  onInspectAlert: (alertId: string) => void;
}
const colors = { normal: '#3769c5', detour: '#dd661c', selected: '#182c4c', alternative: '#147464' };
function validCoordinates(coordinates: Coordinate[]): Coordinate[] {
  return coordinates.filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
}
function textNode(text: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.textContent = text;
  return node;
}

/** Route dots show a path; stop markers always keep their evidenced physical locations. */
export function RouteMap({ direction, stop, assessment, onSelectStop, reviewedAlerts, inspectedAlertId, inspectionRequest, onInspectAlert }: RouteMapProps) {
  const section = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const selectStop = useRef(onSelectStop);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [pathView, setPathView] = useState<'directions' | 'agency'>('directions');
  selectStop.current = onSelectStop;
  const mappedAlerts = assessment.relevantAlerts.filter(({ alert }) => alert.geometry.length || alert.candidateGeometry?.length);
  const focused = mappedAlerts.find(({ alert }) => alert.id === inspectedAlertId) ?? mappedAlerts[0];
  const trace = useMemo(() => focused ? buildDetourTrace(direction, focused.alert,
    reviewedAlerts.find((alert) => alert.id === focused.alert.id)) : null, [direction, focused, reviewedAlerts]);
  const interpreted = trace?.kind === 'interpreted' && pathView === 'directions';
  const useTrace = !!trace?.path.length && (pathView === 'directions' || trace.kind === 'agency');
  const inferredStops = useTrace ? trace?.possiblyBypassedStopIds ?? [] : [];
  const bypassedStops = direction.stops.filter((item) => inferredStops.includes(item.id));
  const mapNotice = focused ? [
    interpreted || focused.alert.geometryIssues.length || focused.alert.sourceIssues.length ? 'Detour path unconfirmed' : '',
    focused.timing === 'uncertain' ? 'Timing unconfirmed' : '',
  ].filter(Boolean).join(' · ') : '';

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true }).setView([39.99, -75.19], 12);
    map.current = instance;
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    tiles.on('tileerror', () => setTilesUnavailable(true));
    tiles.on('tileload', () => setTilesUnavailable(false));
    tiles.addTo(instance);
    layers.current = L.layerGroup().addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; layers.current = null; };
  }, []);

  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    const draw = (coordinates: Coordinate[], color: string, label: string, options: L.PolylineOptions = {}) => {
      const path = validCoordinates(coordinates);
      if (path.length > 1) L.polyline(path, { color, weight: 5, opacity: .8, ...options }).bindTooltip(textNode(label)).addTo(group);
    };
    const dots = (path: Coordinate[], color: string, spacing: number) => {
      for (const point of samplePathPoints(path, spacing)) L.circleMarker(point, {
        radius: 3, color, weight: 1, fillColor: '#fff', fillOpacity: 1, interactive: false,
        className: 'route-path-dot',
      }).addTo(group);
    };
    const replaced = useTrace && !!trace?.bypassedPath.length;
    if (replaced && trace) {
      draw(trace.bypassedPath, '#8994a3', 'Normal route section bypassed by this illustrated detour; stop closures unconfirmed', { weight: 4, opacity: .65, dashArray: '5 7' });
      for (const path of [trace.beforePath, trace.afterPath]) {
        draw(path, colors.normal, `Normal scheduled route · ${direction.headsign}`);
        dots(path, colors.normal, 180);
      }
    } else {
      draw(direction.shape, colors.normal, `Normal scheduled route · ${direction.headsign}`);
      dots(direction.shape, colors.normal, 180);
    }

    for (const { alert, timing } of assessment.relevantAlerts) {
      if (timing === 'inactive') continue;
      const isFocused = alert.id === focused?.alert.id;
      if (isFocused && useTrace && trace) {
        draw(trace.path, colors.detour, interpreted ? `${alert.title} · Illustration of written directions, not a verified bus trace` : `${alert.title} · Agency-reported path`, {
          weight: 6, opacity: .95, dashArray: timing === 'uncertain' || !assessment.fresh ? '10 8' : undefined,
          className: 'focused-detour-path',
        });
        dots(trace.path, colors.detour, 80);
      } else {
        for (const path of alert.geometry) {
          draw(path, colors.detour,
          `${alert.title} · Agency geometry${alert.geometryIssues.length ? ' · path needs review' : ''}${timing === 'uncertain' ? ' · timing uncertain' : ''}`, {
            weight: isFocused ? 5 : 3, opacity: isFocused ? .8 : .35,
            dashArray: alert.geometryIssues.length ? '3 7' : timing === 'uncertain' || !assessment.fresh ? '10 8' : undefined,
          });
          if (isFocused) dots(path, colors.detour, 80);
        }
      }
    }

    for (const routeStop of direction.stops) {
      const listed = assessment.relevantAlerts.filter(({ alert, timing }) => timing !== 'inactive' && alert.skippedStopIds.includes(routeStop.id));
      const isSelected = routeStop.id === stop.id;
      const confirmed = listed.some(({ timing, alert }) => timing === 'active' && !alert.sourceIssues.length && alert.stopCoverage !== 'unknown')
        && isSelected && assessment.fresh && assessment.status === 'affected';
      const inferred = inferredStops.includes(routeStop.id);
      const status = listed.length ? confirmed ? 'Agency lists this stop as skipped'
        : isSelected ? 'Listed as skipped; current impact is unconfirmed' : 'Agency lists this stop as skipped; select to check current impact'
        : inferred ? 'On the illustrated bypassed section; closure and replacement stop unconfirmed'
          : 'Scheduled stop; select to check reported impact';
      const marker = L.marker([routeStop.lat, routeStop.lon], {
        icon: L.divIcon({ className: `route-stop ${isSelected ? 'route-stop--selected' : ''} ${listed.length ? 'route-stop--skipped' : inferred ? 'route-stop--inferred' : ''}`,
          html: `<span aria-hidden="true">${listed.length ? '×' : inferred ? '?' : '▪'}</span>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
        keyboard: true, riseOnHover: true, zIndexOffset: isSelected ? 1000 : 0,
      }).bindTooltip(textNode(`${isSelected ? 'Your stop · ' : ''}${routeStop.name} · ${status}`));
      marker.on('click', () => selectStop.current(routeStop.id));
      marker.on('add', () => {
        const element = marker.getElement();
        if (!element) return;
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `Check ${routeStop.name}. ${status}`);
        element.addEventListener('keydown', (event) => {
          if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); selectStop.current(routeStop.id); }
        });
      });
      marker.addTo(group);
    }
    if (assessment.alternative) {
      const alternative = assessment.alternative.stop;
      L.marker([alternative.lat, alternative.lon], {
        icon: L.divIcon({ className: 'route-stop route-stop--replacement', html: '<span aria-hidden="true">✓</span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
      }).bindTooltip(textNode(`Agency-confirmed replacement · ${alternative.name}`), { permanent: true, direction: 'top', offset: [0, -12] }).addTo(group);
    }
  }, [direction, stop, assessment, focused, trace, useTrace, interpreted, inferredStops]);

  useEffect(() => { map.current?.setView([stop.lat, stop.lon], 15, { animate: false }); }, [direction.id, stop.id, stop.lat, stop.lon]);
  const detourCoordinates = useTrace && trace ? trace.path : focused?.alert.geometry.flat() ?? [];
  const detourBounds = useRef(detourCoordinates);
  detourBounds.current = detourCoordinates;
  useEffect(() => {
    if (!inspectionRequest || !detourBounds.current.length) return;
    map.current?.fitBounds(L.latLngBounds(detourBounds.current), { padding: [40, 40], maxZoom: 16, animate: false });
    section.current?.scrollIntoView({ block: 'nearest' });
  }, [inspectionRequest]);
  function showFullRoute() {
    const coordinates = validCoordinates(direction.shape);
    if (coordinates.length) map.current?.fitBounds(L.latLngBounds(coordinates), { padding: [30, 30], maxZoom: 15, animate: false });
  }

  return <section ref={section} className="route-map" aria-label="Route map and reported detours">
    <div className="route-map__toolbar">
      <h2>Route map</h2>
      <div className="route-map__controls">
        <button onClick={() => map.current?.setView([stop.lat, stop.lon], 15, { animate: false })}>Near stop</button>
        <button onClick={showFullRoute}>Full route</button>
      </div>
    </div>
    {focused && <div className="detour-inspector">
      <div className="detour-inspector__select"><label htmlFor="map-detour">Detour</label><select id="map-detour" value={focused.alert.id} onChange={(event) => onInspectAlert(event.target.value)}>
        {mappedAlerts.map(({ alert }) => <option key={alert.id} value={alert.id}>{alert.title}</option>)}
      </select><button onClick={() => onInspectAlert(focused.alert.id)}>View detour</button></div>
      {mapNotice && <p className="route-map__notice">{mapNotice}</p>}
    </div>}
    <div className="route-map__canvas-wrap">
      <div ref={container} className="route-map__canvas" aria-label={`Map of ${direction.headsign}; selected stop ${stop.name}`} />
      {tilesUnavailable && <p className="route-map__tile-error" role="status">Street tiles could not load. Route lines and stop details remain available.</p>}
    </div>
    <div className="route-map__footer">
      <ul className="route-map__legend" aria-label="Map legend">
        <li><span className="route-map__line route-map__line--normal" aria-hidden="true" />Normal route</li>
        <li><span className="route-map__line route-map__line--reported" aria-hidden="true" />Detour</li>
        <li><span className="legend-stop legend-stop--inferred" aria-hidden="true">?</span>Unconfirmed stop</li>
        <li><span className="legend-stop legend-stop--skipped" aria-hidden="true">×</span>Reported skipped</li>
      </ul>
      <p className="route-map__marker-key">Dots trace the route. Squares are stops.</p>
      <details className="route-map__details">
        <summary>Map details</summary>
        <div className="route-map__details-content">
          {trace?.kind === 'interpreted' && <div className="path-view" role="group" aria-label="Detour path source">
            <button aria-pressed={pathView === 'directions'} onClick={() => setPathView('directions')}>Written directions</button>
            <button aria-pressed={pathView === 'agency'} onClick={() => setPathView('agency')}>Agency geometry</button>
          </div>}
          {focused && <p className="path-explanation">{interpreted ? 'The illustrated path follows the written turns. The agency map disagrees, so this is not a verified bus trace.'
            : focused.alert.geometryIssues.length ? 'The agency’s published path needs review; its points do not establish boarding locations.' : 'This path comes from the agency. It does not establish where passengers can board.'}
            {focused.timing === 'uncertain' ? ' When this applies is also unconfirmed.' : ''}</p>}
          {focused && [...focused.alert.geometryIssues, ...focused.alert.sourceIssues].length > 0 && <ul className="route-map__issues">
            {[...focused.alert.geometryIssues, ...focused.alert.sourceIssues].map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
          </ul>}
          <p>Blue squares are scheduled stops; the dark outline marks your selection. A question mark means the illustrated path may bypass that stop, but its closure is unconfirmed. A cross means an agency notice lists it as skipped; select it to check current impact.</p>
          {bypassedStops.length > 0 && <div className="bypassed-stops"><strong>Possibly bypassed stops</strong>
            <p>The agency has not confirmed closures or replacement locations for this section.</p>
            <ul>{bypassedStops.map((item) => <li key={item.id}><button onClick={() => onSelectStop(item.id)}>{item.name}</button></li>)}</ul>
          </div>}
          <p>Stop markers keep their real locations. {assessment.alternative ? 'The green marker identifies the agency-confirmed replacement.' : 'No exact replacement boarding point has been confirmed for this check.'}</p>
        </div>
      </details>
    </div>
  </section>;
}
export default RouteMap;
