import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinate, DetourAlert, RouteDirection, Stop, StopAssessment } from '../domain/types';
import { buildDetourTrace } from '../domain/mapGeometry';
import { getAutomaticMapFocus, getStopFocusPoints, resolveMapInspection, type MapInspection } from '../domain/mapFocus';
import type { useRealtime } from '../realtime/useRealtime';
import { busesForDirection, arrivalsForStop, arrivalMinutes } from '../realtime/select';
import { currentReport } from '../realtime/types';
import { Icon } from './Icon';
import { presentAlertText } from '../domain/alertText';
import { BusReview } from './BusReview';
import './RouteMap.css';

interface RouteMapProps {
  realtime: ReturnType<typeof useRealtime>;
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
export function RouteMap({ realtime, mobile, result, direction, stop, assessment, onSelectStop, reviewedAlerts, inspectedAlertId, inspectionRequest, onInspectAlert }: RouteMapProps) {
  const reviewEnabled = new URLSearchParams(window.location.search).get('review') === '1' && realtime.enabled;
  const [reviewMap, setReviewMap] = useState<L.Map | null>(null);
  const section = useRef<HTMLElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const busMarkers = useRef(new Map<string, L.Marker>());
  const [followId, setFollowId] = useState<string | null>(null);
  const [followNotice, setFollowNotice] = useState('');
  const liveBuses = busesForDirection(realtime.feed, direction.id, realtime.now);
  const followed = liveBuses.find(bus => bus.id === followId);
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
    if (reviewEnabled) setReviewMap(instance);
    instance.on('dragstart', () => { setFollowId(null); setFollowNotice(''); });
    const stopKeyboardFollow = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { setFollowId(null); setFollowNotice(''); }
    };
    container.current.addEventListener('keydown', stopKeyboardFollow);
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
    return () => { container.current?.removeEventListener('keydown', stopKeyboardFollow); resize.disconnect(); busMarkers.current.clear(); instance.remove(); map.current = null; layers.current = null; };
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
    let opened: { id: string; position: L.LatLng | undefined; scroll: number } | null = null;
    for (const layer of group.getLayers()) {
      if (!(layer instanceof L.Polyline) || !layer.isPopupOpen()) continue;
      const popup = layer.getPopup(), content = popup?.getContent();
      if (content instanceof HTMLElement && content.dataset.alertId) opened = { id: content.dataset.alertId, position: popup?.getLatLng(), scroll: content.parentElement?.scrollTop ?? 0 };
    }
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
    const replaced = useTrace && !!trace?.bypassedPath.length;
    if (replaced && trace) {
      draw(trace.bypassedPath, '#8994a3', 'Normal route section bypassed by this illustrated detour; stop closures unconfirmed', { weight: 4, opacity: .65, dashArray: '5 7' });
      for (const path of [trace.beforePath, trace.afterPath]) {
        draw(path, colors.normal, `Normal scheduled route · ${direction.headsign}`);
      }
    } else {
      draw(direction.shape, colors.normal, `Normal scheduled route · ${direction.headsign}`);
    }

    for (const { alert, timing } of assessment.relevantAlerts) {
      if (timing === 'inactive') continue;
      // Unclear schedules are inspectable evidence, never automatic detour paths.
      if (timing === 'uncertain' && manualFocus?.alert.id !== alert.id) continue;
      const isFocused = alert.id === focused?.alert.id;
      const candidate = buildDetourTrace(direction, alert, reviewedAlerts.find(reference => reference.id === alert.id));
      const paths = isFocused && pathView === 'agency' && showFocusedAgency ? alert.geometry
        : candidate.path.length ? [candidate.path]
        : !alert.geometryIssues.length && !alert.sourceIssues.length ? alert.geometry : [];
      for (const coordinates of paths) {
        const path = validCoordinates(coordinates);
        if (path.length < 2) continue;
        const content = document.createElement('div'); content.className = 'detour-popup'; content.dataset.alertId = alert.id;
        const heading = document.createElement('strong'); heading.textContent = alert.title; content.append(heading);
        const readable = presentAlertText(alert);
        const lines = [timing === 'uncertain' ? 'Timing unconfirmed.' : '', ...readable.timing, readable.intro, ...readable.steps, ...readable.paragraphs,
          'Reported detour; path and boarding locations may be unconfirmed.'].filter(Boolean);
        for (const line of lines) { const p = document.createElement('p'); p.textContent = line; content.append(p); }
        const options = { color: isFocused ? '#bc5724' : '#d18a58', weight: isFocused ? 4 : 3, opacity: .75, dashArray: '7 8', className: 'detour-path' };
        L.polyline(path, options).addTo(group);
        // A wider transparent line makes narrow dashed paths usable on touch screens.
        const hit = L.polyline(path, { color: '#d18a58', weight: 18, opacity: 0, className: 'detour-hit-target' })
          .bindTooltip(textNode(`${alert.title} · Tap for alert`))
          .bindPopup(content, { maxWidth: 250, maxHeight: 190, autoPan: opened?.id !== alert.id, autoPanPaddingTopLeft: L.point(16, 80), autoPanPaddingBottomRight: L.point(16, 20) }).addTo(group);
        if (opened?.id === alert.id) { hit.openPopup(opened.position); if (content.parentElement) content.parentElement.scrollTop = opened.scroll; }
        hit.on('popupclose', () => { hit.getPopup()!.options.autoPan = true; });
        {
          const element = hit.getElement();
          element?.setAttribute('tabindex', '0'); element?.setAttribute('role', 'button'); element?.setAttribute('aria-label', `Read detour alert: ${alert.title}`);
          element?.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') { event.preventDefault(); hit.openPopup(); } });
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
          html: `<span aria-hidden="true">${listed.length ? '×' : inferred ? '?' : ''}</span>`, iconSize: [32, 32], iconAnchor: [16, 16] }),
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

  useEffect(() => {
    const instance = map.current;
    if (!instance || !realtime.enabled) return;
    const buses = busesForDirection(realtime.feed, direction.id, realtime.now);
    for (const [id, marker] of busMarkers.current) if (!buses.some(bus => bus.id === id)) { marker.remove(); busMarkers.current.delete(id); }
    for (const bus of buses) {
      const existing = busMarkers.current.get(bus.id);
      const oldContent = existing?.getPopup()?.getContent();
      const wasExpanded = oldContent instanceof HTMLElement && !!oldContent.querySelector('details')?.open;
      const scrollTop = oldContent instanceof HTMLElement ? oldContent.scrollTop : 0;
      const popup = document.createElement('div'); popup.className = 'bus-popup';
      popup.style.maxHeight = `${Math.max(100, Math.min(250, instance.getSize().y - 130))}px`;
      const title = document.createElement('strong'); title.textContent = `Route 9 · Bus ${bus.id} · ${direction.label}`; popup.append(title);
      const age = document.createElement('p'); age.textContent = `Position updated ${Math.max(0, Math.floor((realtime.now - bus.reportedAt) / 1000))} seconds ago`; popup.append(age);
      const followButton = document.createElement('button');
      followButton.type = 'button'; followButton.textContent = followId === bus.id ? 'Stop following' : 'Follow this bus';
      followButton.addEventListener('click', () => {
        setFollowNotice(''); setFollowId(followId === bus.id ? null : bus.id);
        instance.closePopup();
      });
      popup.append(followButton);
      const prediction = arrivalsForStop(realtime.feed, direction.id, stop.id, realtime.now).find(p => p.tripId === bus.tripId);
      const selected = document.createElement('p'); selected.textContent = assessment.status === 'affected' ? 'Your selected stop is reported skipped.' : prediction ? `Your stop: ${arrivalMinutes(prediction.arrivalAt!, realtime.now)} min · SEPTA estimate` : 'No live estimate for your selected stop.'; popup.append(selected);
      const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Upcoming stop estimates'; details.open = wasExpanded; details.append(summary);
      const list = document.createElement('ul');
      const upcoming = realtime.feed && currentReport(realtime.feed.predictionsAt, realtime.now) ? realtime.feed.predictions.filter(p => p.tripId === bus.tripId && p.directionId === direction.id && currentReport(p.reportedAt, realtime.now) && (p.skipped || p.arrivalAt !== null && p.arrivalAt >= realtime.now)) : [];
      for (const p of upcoming) {
        const row = document.createElement('li');
        const closed = p.skipped || assessment.relevantAlerts.some(e => e.timing === 'active' && !e.alert.sourceIssues.length && e.alert.skippedStopIds.includes(p.stopId));
        row.textContent = `${direction.stops.find(s => s.id === p.stopId)?.name ?? `Stop ${p.stopId}`}: ${closed ? 'reported skipped' : `${arrivalMinutes(p.arrivalAt!, realtime.now)} min`}`;
        list.append(row);
      }
      if (!upcoming.length) { const row = document.createElement('li'); row.textContent = 'Predictions unavailable.'; list.append(row); }
      details.append(list); popup.append(details);
      details.addEventListener('toggle', () => {
        const activePopup = busMarkers.current.get(bus.id)?.getPopup();
        if (details.open === wasExpanded || activePopup?.getContent() !== popup || !activePopup.isOpen()) return;
        activePopup.options.autoPan = true;
        activePopup.update();
        activePopup.options.autoPan = false;
      });
      const note = document.createElement('p'); note.textContent = assessment.status === 'unknown' ? 'SEPTA estimates. Stopping at your selected stop is unconfirmed.' : 'SEPTA estimates. Detours may change boarding locations.'; popup.append(note);
      if (existing) { existing.setLatLng([bus.lat, bus.lon]); existing.setPopupContent(popup); popup.scrollTop = scrollTop; }
      else {
        const marker = L.marker([bus.lat, bus.lon], { icon: L.divIcon({ className: 'live-bus', html: '<span aria-hidden="true">🚌</span>', iconSize: [30,30], iconAnchor: [15,15] }), title: `Route 9 bus ${bus.id} · ${direction.label}`, zIndexOffset: 1500 }).bindPopup(popup, { maxWidth: 260, autoPan: true, autoPanPaddingTopLeft: L.point(16, 76), autoPanPaddingBottomRight: L.point(16, 20) }).addTo(instance);
        // Bring a newly opened popup into view once; polling must not move the map.
        marker.on('popupopen', () => { marker.getPopup()!.options.autoPan = false; });
        marker.on('popupclose', () => { marker.getPopup()!.options.autoPan = true; });
        busMarkers.current.set(bus.id, marker);
      }
    }
  }, [realtime.feed, realtime.now, realtime.enabled, direction, stop, assessment, followId]);

  useEffect(() => {
    if (followId && !followed) {
      setFollowId(null);
      setFollowNotice('Bus position unavailable. Following stopped.');
    }
  }, [followId, followed]);
  useEffect(() => {
    if (followed) map.current?.setView([followed.lat, followed.lon], Math.max(14, map.current.getZoom()), { animate: false });
  }, [followed?.id, followed?.lat, followed?.lon]);

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
    setFollowId(null); setFollowNotice('');
    const { points, manual } = camera.current;
    if (!points.length) return;
    if (points.length === 1) map.current?.setView(points[0], 16, { animate: false });
    else map.current?.fitBounds(L.latLngBounds(points), { paddingTopLeft: mobile ? [24, 76] : [44, 100], paddingBottomRight: mobile ? [24, 42] : [44, 90], maxZoom: 16, animate: false });
    if (manual) section.current?.scrollIntoView({ block: 'nearest' });
  }, [cameraKey]);
  function showNearStop() {
    setFollowId(null); setFollowNotice('');
    setAgencyChoice(null);
    setStoredInspection({ selectionKey, request: inspectionRequest, alertId: null });
    map.current?.setView([stop.lat, stop.lon], 16, { animate: false });
  }
  function showFullRoute() {
    setFollowId(null); setFollowNotice('');
    const coordinates = validCoordinates(direction.shape);
    if (coordinates.length) map.current?.fitBounds(L.latLngBounds(coordinates), { paddingTopLeft: mobile ? [24, 76] : [35, 100], paddingBottomRight: mobile ? [24, 42] : [35, 90], maxZoom: 15, animate: false });
  }

  function showLiveBuses() {
    setFollowId(null); setFollowNotice('');
    map.current?.closePopup();
    if (liveBuses.length) map.current?.fitBounds(L.latLngBounds(liveBuses.map(bus => [bus.lat, bus.lon] as Coordinate)), {
      paddingTopLeft: [24, 90], paddingBottomRight: [24, 48], maxZoom: 15, animate: false,
    });
  }

  return <section ref={section} className="route-map" aria-label="Route map and reported detours">
    <div className="route-map__toolbar">
      <h2 className="sr-only">Route map</h2>
      <div className="route-map__controls">
        <button ref={fullRouteButton} onClick={showFullRoute}><Icon name="frame" />Full route</button>
      </div>
    </div>
    <div className="route-map__canvas-wrap">
    {availableAlerts.length > 0 && <div className="detour-inspector">
      {manualFocus ? <div className="detour-inspector__viewing">
        <span>Exploring: <strong>{manualFocus.alert.title}</strong></span>
        <button aria-label="Close detour view" onClick={() => {
          showNearStop();
          requestAnimationFrame(() => detourPicker.current?.focus({ preventScroll: true }));
        }}><span aria-hidden="true">×</span></button>
      </div> : <div className="detour-inspector__select"><label htmlFor="map-detour" className="sr-only">Explore route alerts</label><select ref={detourPicker} id="map-detour" value="" onChange={(event) => event.target.value ? onInspectAlert(event.target.value) : showNearStop()}>
        <option value="">Explore route alerts</option>
        {availableAlerts.map(({ alert, timing }) => <option key={alert.id} value={alert.id}>{alert.title}{timing === 'uncertain' ? ' · timing unconfirmed' : ''}</option>)}
      </select></div>}
      {manualFocus && <p className="detour-inspector__context">Selected stop: {stop.name}</p>}
      {disputedAgencyPath && <div className="detour-inspector__agency-note"><button className="detour-inspector__agency" aria-describedby="agency-map-explanation" aria-pressed={pathView === 'agency'}
        onClick={() => setAgencyChoice(pathView === 'agency' ? null : agencyViewKey)}>
        {pathView === 'agency' ? 'Hide detour' : 'Show SEPTA’s reported detour'}
      </button><p id="agency-map-explanation">SEPTA’s map and directions disagree. The actual route is uncertain.</p></div>}
    </div>}

    {!realtime.enabled && stopOffscreen && <button className="route-map__return" onClick={() => {
      showNearStop();
      fullRouteButton.current?.focus({ preventScroll: true });
    }}><Icon name="pin" />Back to my stop</button>}

      <div ref={container} className="route-map__canvas" aria-label={`Map of ${direction.headsign}; selected stop ${stop.name}`} />
      {mapNotice && <p className="route-map__notice">{mapNotice}</p>}
      {tilesUnavailable && <p className="route-map__tile-error" role="status">Street tiles could not load. Route lines and stop details remain available.</p>}
    </div>
    {realtime.enabled && <div className="bus-tracking-controls" aria-label="Live bus tracking">
      {followed ? <div className="bus-tracking-controls__status"><strong>Following bus {followed.id}</strong><span>Position updated {Math.max(0, Math.floor((realtime.now - followed.reportedAt) / 1000))} seconds ago</span></div>
        : <div><button disabled={!liveBuses.length} onClick={showLiveBuses}>{liveBuses.length ? `Show live buses · ${liveBuses.length}` : realtime.feed && currentReport(realtime.feed.vehiclesAt, realtime.now) ? 'No buses reporting' : 'Bus positions unavailable'}</button>{followNotice && <span role="status">{followNotice}</span>}</div>}
      {(stopOffscreen || followed) && <button onClick={showNearStop}>Your stop</button>}
      {followed && <button onClick={() => setFollowId(null)}>Stop following</button>}
    </div>}
    {reviewEnabled && reviewMap && <BusReview onExplore={() => { setFollowId(null); setFollowNotice(''); }} map={reviewMap} feed={realtime.feed} now={realtime.now} direction={direction} candidate={useTrace && trace ? [trace.path] : showFocusedAgency ? focused?.alert.geometry ?? [] : []} candidateLabel={focused ? `${focused.alert.title} (${pathView})` : ''} />}
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
          <p>Lines show routes. Small circles mark scheduled stops; dashed circles mean unconfirmed impact. Tap an orange dashed path to read its alert.</p>
          {realtime.enabled && <p>{currentReport(realtime.feed?.vehiclesAt ?? null, realtime.now)
            ? 'Bus icons show recent SEPTA positions for this direction. Tap a bus for upcoming stop estimates. Missing icons do not mean no buses are running.'
            : 'Live bus positions are currently unavailable.'}</p>}
          {trace?.kind === 'interpreted' && <div className="path-view" role="group" aria-label="Detour path source">
            <button aria-pressed={pathView === 'directions'} onClick={() => setAgencyChoice(null)}>Written directions</button>
            <button aria-pressed={pathView === 'agency'} onClick={() => setAgencyChoice(agencyViewKey)}>{disputedAgencyPath ? 'Show SEPTA’s reported detour' : 'Agency geometry'}</button>
          </div>}
          {focused && <p className="path-explanation">{!hasPublishedPath ? 'This notice has no published detour path. The map shows its listed stop when available; nearby route lines do not establish an alternative boarding point.'
            : interpreted ? 'The illustrated path follows the written turns. The agency map disagrees, so this is not a verified bus trace.'
            : focused.alert.geometryIssues.length ? 'The agency’s published path needs review; its points do not establish boarding locations.' : 'This path comes from the agency. It does not establish where passengers can board.'}
            {focused.timing === 'uncertain' ? ' When this applies is also unconfirmed.' : ''}</p>}
          {focused && [...focused.alert.geometryIssues, ...focused.alert.sourceIssues].length > 0 && <ul className="route-map__issues">
            {[...focused.alert.geometryIssues, ...focused.alert.sourceIssues].map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
          </ul>}
          <p>Hollow blue circles are scheduled stops, not verified boarding locations; the dark outline marks your selection. A question mark means the illustrated path may bypass that stop, but its closure is unconfirmed. A cross means an agency notice lists it as skipped; select it to check current impact.</p>
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
