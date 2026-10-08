import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinate, DetourAlert, RouteDirection, Stop, StopAssessment } from '../domain/types';
import { buildDetourTrace, samplePathPoints } from '../domain/mapGeometry';
import { getAutomaticMapFocus, getStopFocusPoints, resolveMapInspection, type MapInspection } from '../domain/mapFocus';
import { Icon } from './Icon';
import './RouteMap.css';

interface RouteMapProps {
  mobile: boolean;
  result: ReactNode;
  direction: RouteDirection;
  stop: Stop;
  assessment: StopAssessment;
  onSelectStop: (stopId: string) => void;
  reviewedAlerts: DetourAlert[];
  inspectedAlertId: string;
  inspectionRequest: number;
  onInspectAlert: (alertId: string) => void;
}
const colors = { normal: '#245ac3', detour: '#bc5724', selected: '#182c4c', alternative: '#147464' };
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
export function RouteMap({ mobile, result, direction, stop, assessment, onSelectStop, reviewedAlerts, inspectedAlertId, inspectionRequest, onInspectAlert }: RouteMapProps) {
  const section = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const selectStop = useRef(onSelectStop);
  const [stopOffscreen, setStopOffscreen] = useState(false);
  const fullRouteButton = useRef<HTMLButtonElement>(null);
  const detourPicker = useRef<HTMLSelectElement>(null);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [agencyChoice, setAgencyChoice] = useState<string | null>(null);
  const selectionKey = `${direction.id}:${stop.id}`;
  const [storedInspection, setStoredInspection] = useState<MapInspection>(() => ({
    selectionKey, request: inspectionRequest, alertId: inspectionRequest ? inspectedAlertId || null : null,
  }));
  const inspection = resolveMapInspection(storedInspection, selectionKey, inspectionRequest, inspectedAlertId);
  useEffect(() => {
    if (inspection !== storedInspection) setStoredInspection(inspection);
  }, [inspection, storedInspection]);

  selectStop.current = onSelectStop;
  const availableAlerts = assessment.relevantAlerts.filter(({ alert, timing }) => timing !== 'inactive' && alert.directionIds.includes(direction.id));
  const automaticFocus = useMemo(() => getAutomaticMapFocus(direction, stop, assessment.relevantAlerts, reviewedAlerts),
    [direction, stop, assessment.relevantAlerts, reviewedAlerts]);
  const manualFocus = availableAlerts.find(({ alert }) => alert.id === inspection.alertId);
  const focused = manualFocus ?? availableAlerts.find(({ alert }) => alert.id === automaticFocus.alertId);
  const agencyViewKey = `${selectionKey}:${focused?.alert.id}:${inspection.request}:${JSON.stringify([focused?.alert.geometry, focused?.alert.geometryIssues, focused?.alert.sourceIssues])}`;
  const pathView = agencyChoice === agencyViewKey ? 'agency' : 'directions';
  const disputedAgencyPath = !!focused?.alert.geometry.length && !!(focused.alert.geometryIssues.length || focused.alert.sourceIssues.length);
  const showFocusedAgency = !disputedAgencyPath || pathView === 'agency';
  const trace = useMemo(() => focused ? buildDetourTrace(direction, focused.alert,
    reviewedAlerts.find((alert) => alert.id === focused.alert.id)) : null, [direction, focused, reviewedAlerts]);
  const interpreted = trace?.kind === 'interpreted' && pathView === 'directions';
  const useTrace = !!trace?.path.length && (pathView === 'directions' || trace.kind === 'agency');
  const inferredStops = useTrace ? trace?.possiblyBypassedStopIds ?? [] : [];
  const bypassedStops = direction.stops.filter((item) => inferredStops.includes(item.id));
  const hasPublishedPath = !!focused && (!!trace?.path.length || focused.alert.geometry.some(path => path.length > 1));
  const nearby = !manualFocus && (automaticFocus.reason === 'illustrated-bypass' || automaticFocus.reason === 'nearby-path');
  const pathUnconfirmed = hasPublishedPath && (interpreted || !!focused?.alert.geometryIssues.length || !!focused?.alert.sourceIssues.length);
  const mapNotice = focused ? [
    manualFocus ? 'Exploring a route alert · not a stop-impact confirmation' : '',
    nearby ? pathUnconfirmed ? 'Nearby detour · path and stops unconfirmed' : 'Nearby detour · stop impact unconfirmed' : '',
    !hasPublishedPath ? 'No detour path published' : '',
    disputedAgencyPath && !showFocusedAgency && !useTrace ? 'Disputed agency map hidden' : pathUnconfirmed && !nearby ? 'Detour path unconfirmed' : '',
    focused.timing === 'uncertain' ? 'Timing unconfirmed' : '',
  ].filter(Boolean).join(' · ') : '';

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: true }).setView([39.99, -75.19], 12);
    map.current = instance;
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
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
    const instance = map.current;
    if (!instance) return;
    const update = () => {
      const size = instance.getSize();
      if (!size.x || !size.y) return;
      setStopOffscreen(!instance.getBounds().contains([stop.lat, stop.lon]));
    };
    instance.on('moveend resize', update);
    update();
    return () => { instance.off('moveend resize', update); };
  }, [stop.lat, stop.lon]);

  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    const draw = (coordinates: Coordinate[], color: string, label: string, options: L.PolylineOptions = {}) => {
      const path = validCoordinates(coordinates);
      if (path.length > 1) {
        if (options.className === 'focused-detour-path') L.polyline(path, {
          color: '#fff', weight: 10, opacity: .9, interactive: false,
        }).addTo(group);
        L.polyline(path, { color, weight: 5, opacity: .8, ...options }).bindTooltip(textNode(label)).addTo(group);
      }
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
        if ((alert.geometryIssues.length || alert.sourceIssues.length) && !(isFocused && showFocusedAgency)) continue;
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
      }).bindTooltip(textNode(isSelected ? routeStop.name : `${routeStop.name} · ${status}`), {
        permanent: isSelected, direction: 'top', offset: [0, -15],
        className: isSelected ? 'selected-stop-label' : '',
      });
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
  }, [direction, stop, assessment, focused, trace, useTrace, interpreted, inferredStops, showFocusedAgency]);

  const detourCoordinates = useTrace && trace ? trace.path : showFocusedAgency ? focused?.alert.geometry.flat() ?? [] : [];
  const namedStopCoordinates: Coordinate[] = direction.stops.filter(item => focused?.alert.skippedStopIds.includes(item.id))
    .map(item => [item.lat, item.lon]);
  const cameraPoints = manualFocus
    ? detourCoordinates.length ? detourCoordinates : namedStopCoordinates.length ? namedStopCoordinates : [[stop.lat, stop.lon] as Coordinate]
    : getStopFocusPoints(stop, useTrace && trace ? [trace.path, trace.bypassedPath] : showFocusedAgency ? focused?.alert.geometry ?? [] : []);
  const camera = useRef({ points: cameraPoints, manual: !!manualFocus });
  camera.current = { points: cameraPoints, manual: !!manualFocus };
  // A polling refresh should not undo a rider's pan or Full route view. Refocus
  // only when the selected stop, applicable alert, or explicit view changes.
  const cameraKey = `${selectionKey}:${focused?.alert.id ?? 'stop'}:${pathView}:${manualFocus ? `manual-${inspection.request}` : 'auto'}`;
  useEffect(() => {
    const { points, manual } = camera.current;
    if (!points.length) return;
    if (points.length === 1) map.current?.setView(points[0], 16, { animate: false });
    else map.current?.fitBounds(L.latLngBounds(points), { paddingTopLeft: mobile ? [24, 76] : [44, 100], paddingBottomRight: mobile ? [24, 42] : [44, 90], maxZoom: 16, animate: false });
    if (manual) section.current?.scrollIntoView({ block: 'nearest' });
  }, [cameraKey]);
  function showNearStop() {
    setAgencyChoice(null);
    setStoredInspection({ selectionKey, request: inspectionRequest, alertId: null });
    map.current?.setView([stop.lat, stop.lon], 16, { animate: false });
  }
  function showFullRoute() {
    const coordinates = validCoordinates(direction.shape);
    if (coordinates.length) map.current?.fitBounds(L.latLngBounds(coordinates), { paddingTopLeft: mobile ? [24, 76] : [35, 100], paddingBottomRight: mobile ? [24, 42] : [35, 90], maxZoom: 15, animate: false });
  }

  return <section ref={section} className="route-map" aria-label="Route map and reported detours">
    <div className="route-map__toolbar">
      <h2 className="sr-only">Route map</h2>
      <div className="route-map__controls">
        <button ref={fullRouteButton} onClick={showFullRoute}><Icon name="frame" />Full route</button>
      </div>
    </div>
    {availableAlerts.length > 0 && <div className="detour-inspector">
      {manualFocus ? <div className="detour-inspector__viewing">
        <span>Exploring: <strong>{manualFocus.alert.title}</strong></span>
        <button aria-label="Close detour view" onClick={() => {
          showNearStop();
          requestAnimationFrame(() => detourPicker.current?.focus({ preventScroll: true }));
        }}><span aria-hidden="true">×</span></button>
      </div> : <div className="detour-inspector__select"><label htmlFor="map-detour" className="sr-only">Explore route alerts</label><select ref={detourPicker} id="map-detour" value="" onChange={(event) => event.target.value ? onInspectAlert(event.target.value) : showNearStop()}>
        <option value="">Explore route alerts</option>
        {availableAlerts.map(({ alert }) => <option key={alert.id} value={alert.id}>{alert.title}</option>)}
      </select></div>}
      {manualFocus && <p className="detour-inspector__context">Selected stop: {stop.name}</p>}
      {disputedAgencyPath && <button className="detour-inspector__agency" aria-pressed={pathView === 'agency'}
        onClick={() => setAgencyChoice(pathView === 'agency' ? null : agencyViewKey)}>
        {pathView === 'agency' ? 'Hide unverified agency map' : 'Show agency map—unverified'}
      </button>}
    </div>}
    <div className="route-map__canvas-wrap">
    {stopOffscreen && <button className="route-map__return" onClick={() => {
      showNearStop();
      fullRouteButton.current?.focus({ preventScroll: true });
    }}><Icon name="pin" />Back to my stop</button>}

      <div ref={container} className="route-map__canvas" aria-label={`Map of ${direction.headsign}; selected stop ${stop.name}`} />
      {mapNotice && <p className="route-map__notice">{mapNotice}</p>}
      {tilesUnavailable && <p className="route-map__tile-error" role="status">Street tiles could not load. Route lines and stop details remain available.</p>}
    </div>
    {result}
    <div className="route-map__footer">
      <ul className="route-map__legend" aria-label="Map legend">
        <li><span className="route-map__line route-map__line--normal" aria-hidden="true" />Route</li>
        <li><span className="route-map__line route-map__line--reported" aria-hidden="true" />Detour</li>
      </ul>
      <details className="route-map__details">
        <summary>Map key & details</summary>
        <div className="route-map__details-content">
          <div className="stop-legend"><span><span className="legend-stop legend-stop--inferred" aria-hidden="true">?</span>Stop unconfirmed</span><span><span className="legend-stop legend-stop--skipped" aria-hidden="true">×</span>Reported skipped</span></div>
          <p>Dots trace the route. Squares are stops.</p>
          {trace?.kind === 'interpreted' && <div className="path-view" role="group" aria-label="Detour path source">
            <button aria-pressed={pathView === 'directions'} onClick={() => setAgencyChoice(null)}>Written directions</button>
            <button aria-pressed={pathView === 'agency'} onClick={() => setAgencyChoice(agencyViewKey)}>{disputedAgencyPath ? 'Show agency map—unverified' : 'Agency geometry'}</button>
          </div>}
          {focused && <p className="path-explanation">{!hasPublishedPath ? 'This notice has no published detour path. The map shows its listed stop when available; nearby route lines do not establish an alternative boarding point.'
            : interpreted ? 'The illustrated path follows the written turns. The agency map disagrees, so this is not a verified bus trace.'
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
