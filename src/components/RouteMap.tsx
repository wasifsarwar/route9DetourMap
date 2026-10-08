import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinate, RouteDirection, Stop, StopAssessment } from '../domain/types';
import './RouteMap.css';

interface RouteMapProps {
  direction: RouteDirection;
  stop: Stop;
  assessment: StopAssessment;
  onSelectStop: (stopId: string) => void;
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

/** Agency paths are independent overlays; they never establish boarding points. */
export function RouteMap({ direction, stop, assessment, onSelectStop }: RouteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const selectStop = useRef(onSelectStop);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  selectStop.current = onSelectStop;

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([39.99, -75.19], 12);
    map.current = instance;
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    tiles.on('tileerror', () => setTilesUnavailable(true));
    tiles.on('tileload', () => setTilesUnavailable(false));
    tiles.addTo(instance);
    layers.current = L.layerGroup().addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
      layers.current = null;
    };
  }, []);

  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    const shape = validCoordinates(direction.shape);
    if (shape.length > 1) {
      L.polyline(shape, { color: 'white', weight: 9, opacity: 0.85, interactive: false }).addTo(group);
      L.polyline(shape, { color: colors.normal, weight: 5, opacity: 0.75 })
        .bindTooltip(textNode(`Normal scheduled route · ${direction.headsign}`))
        .addTo(group);
    }

    for (const { alert, timing } of assessment.relevantAlerts) {
      if (timing === 'inactive') continue;
      const uncertain = timing === 'uncertain' || !assessment.fresh;
      const disputed = alert.geometryIssues.length > 0 || alert.sourceIssues.length > 0;
      const geometryLabel = `${alert.title} · Agency-reported detour${uncertain ? ' · timing uncertain' : ''}${disputed ? ' · path needs review' : ''}`;
      for (const coordinates of alert.geometry) {
        const path = validCoordinates(coordinates);
        if (path.length < 2) continue;
        L.polyline(path, {
          color: colors.detour,
          weight: 6,
          opacity: uncertain ? 0.7 : 0.95,
          dashArray: uncertain ? '10 9' : disputed ? '4 7' : undefined,
        }).bindTooltip(textNode(geometryLabel)).addTo(group);
      }
      if (alert.candidateGeometry?.length) {
        const path = validCoordinates(alert.candidateGeometry);
        if (path.length > 1) {
          L.polyline(path, { color: colors.detour, weight: 4, opacity: 0.6, dashArray: '3 8' })
            .bindTooltip(textNode(`${alert.title} · Interpreted path, unverified`)).addTo(group);
        }
      }
    }

    for (const routeStop of direction.stops) {
      const listed = assessment.relevantAlerts.filter(({ alert, timing }) => timing !== 'inactive'
        && alert.skippedStopIds.includes(routeStop.id));
      const confirmed = listed.some(({ timing, alert }) => timing === 'active'
        && alert.sourceIssues.length === 0 && alert.stopCoverage !== 'unknown')
        && assessment.fresh && assessment.status !== 'unknown';
      const isSelected = routeStop.id === stop.id;
      const status = listed.length
        ? confirmed ? 'Agency lists this stop as skipped' : 'Listed as skipped; current impact is unconfirmed'
        : 'Scheduled stop; select to check reported impact';
      const marker = L.circleMarker([routeStop.lat, routeStop.lon], {
        radius: isSelected ? 10 : listed.length ? 6 : 4,
        color: isSelected ? colors.selected : listed.length ? colors.detour : colors.normal,
        weight: isSelected ? 4 : 2,
        fillColor: isSelected ? colors.selected : listed.length && confirmed ? colors.detour : '#ffffff',
        fillOpacity: 1,
        dashArray: listed.length && !confirmed ? '3 3' : undefined,
      }).bindTooltip(textNode(`${isSelected ? 'Your stop · ' : ''}${routeStop.name} · ${status}`));
      marker.on('click', () => selectStop.current(routeStop.id));
      marker.on('add', () => {
        const element = marker.getElement();
        if (!element) return;
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `Check ${routeStop.name}. ${status}`);
        element.addEventListener('keydown', (event) => {
          if (!(event instanceof KeyboardEvent)) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectStop.current(routeStop.id);
          }
        });
      });
      marker.addTo(group);
      if (isSelected) marker.bringToFront();
    }

    if (assessment.alternative) {
      const alternative = assessment.alternative.stop;
      L.circleMarker([alternative.lat, alternative.lon], {
        radius: 10, color: 'white', weight: 3, fillColor: colors.alternative, fillOpacity: 1,
      }).bindTooltip(textNode(`Agency-confirmed alternative · ${alternative.name}`), {
        permanent: true, direction: 'top', offset: [0, -12],
      }).addTo(group);
    }

    // Draw the selected-stop halo last so dense stop clusters cannot obscure it.
    L.circleMarker([stop.lat, stop.lon], {
      radius: 16, color: colors.selected, weight: 2, fillOpacity: 0, interactive: false,
    }).addTo(group);
  }, [direction, stop, assessment]);

  useEffect(() => {
    map.current?.setView([stop.lat, stop.lon], 15, { animate: false });
  }, [direction.id, stop.id, stop.lat, stop.lon]);

  function showFullRoute() {
    const coordinates = validCoordinates(direction.shape);
    if (coordinates.length) map.current?.fitBounds(L.latLngBounds(coordinates), { padding: [30, 30], maxZoom: 15, animate: false });
  }

  return (
    <section className="route-map" aria-label="Route map and reported detours">
      <div className="route-map__toolbar">
        <div className="route-map__selection">
          <span className="route-map__selection-dot" aria-hidden="true" />
          <span>Your stop <strong>{stop.name}</strong></span>
        </div>
        <div className="route-map__controls">
          <button type="button" onClick={() => map.current?.setView([stop.lat, stop.lon], 15, { animate: false })}>Near stop</button>
          <button type="button" onClick={showFullRoute}>Full route</button>
        </div>
      </div>
      <div className="route-map__canvas-wrap">
        <div ref={container} className="route-map__canvas" aria-label={`Map of ${direction.headsign}, centered on ${stop.name}`} />
        {tilesUnavailable && (
          <p className="route-map__tile-error" role="status">Street tiles could not load. Route lines and stop details remain available.</p>
        )}
      </div>
      <div className="route-map__footer">
        <ul className="route-map__legend" aria-label="Map legend">
          <li><span className="route-map__line route-map__line--normal" aria-hidden="true" />Normal route</li>
          <li><span className="route-map__line route-map__line--reported" aria-hidden="true" />Reported detour</li>
          <li><span className="route-map__line route-map__line--uncertain" aria-hidden="true" />Timing uncertain</li>
          {assessment.relevantAlerts.some(({ alert }) => alert.geometryIssues.length || alert.sourceIssues.length || alert.candidateGeometry?.length) && (
            <li><span className="route-map__line route-map__line--unverified" aria-hidden="true" />Path unverified</li>
          )}
        </ul>
        <p>Tap a stop to check it. Detour lines alone do not confirm where you can board.</p>
      </div>
    </section>
  );
}

export default RouteMap;
