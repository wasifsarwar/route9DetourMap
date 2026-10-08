import { useEffect, useMemo, useState } from 'react';
import { useMobileLayout } from './hooks/useMobileLayout';
import { useTransitData } from './hooks/useTransitData';
import { useSavedJourney } from './hooks/useSavedJourney';
import { assessStop } from './domain/impact';
import { parseWallTime } from './domain/time';
import { StopPicker } from './components/StopPicker';
import { MobileStopSheet } from './components/MobileStopSheet';
import { Icon } from './components/Icon';
import { RouteMap } from './components/RouteMap';
import { ImpactCard } from './components/ImpactCard';
import { useRealtime } from './realtime/useRealtime';
import { LiveArrivals } from './components/LiveArrivals';
import { AlertDetails } from './components/AlertDetails';

const MAX_AGE_MS = 15 * 60_000;
const easternTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

function ageText(fetchedAt: string, now: Date) {
  const minutes = Math.floor((now.getTime() - Date.parse(fetchedAt)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < -1) return 'Update time unavailable';
  if (minutes <= 0) return 'Checked just now';
  if (minutes < 60) return `Checked ${minutes} min ago`;
  if (minutes < 1440) return `Checked ${Math.floor(minutes / 60)}h ago`;
  return `Checked ${Math.floor(minutes / 1440)}d ago`;
}

export default function App() {
  const mobile = useMobileLayout();
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const { snapshot, liveFeed, loading, refreshError, routeError, refresh } = useTransitData();
  const { direction, stop, selectDirection, selectStop } = useSavedJourney(snapshot?.route);
  const [mode] = useState<'current' | 'replay'>(() => new URLSearchParams(window.location.search).get('demo') === '1' ? 'replay' : 'current');
  const realtime = useRealtime(mode === 'current');
  const [replayTime, setReplayTime] = useState('2026-10-07T21:54');
  const [clock, setClock] = useState(() => new Date());
  const [inspectedAlertId, setInspectedAlertId] = useState('');
  const [inspectionRequest, setInspectionRequest] = useState(0);

  function inspectAlert(id: string) {
    if (mobile) setSheetExpanded(false);
    setInspectedAlertId(id);
    setInspectionRequest((request) => request + 1);
  }
  useEffect(() => {
    let timer: number;
    const tick = () => {
      window.clearTimeout(timer);
      setClock(new Date());
      // Align to wall-clock boundaries so minute-based service windows switch promptly.
      timer = window.setTimeout(tick, 30_000 - Date.now() % 30_000 + 10);
    };
    const resume = () => { if (document.visibilityState === 'visible') tick(); };
    tick();
    document.addEventListener('visibilitychange', resume);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, []);
  useEffect(() => { setClock(new Date()); }, [liveFeed]);

  const route = snapshot?.route;
  const feed = mode === 'replay' ? snapshot?.feed : liveFeed ?? snapshot?.feed;
  const time = useMemo(() => {
    if (mode === 'current') return { now: clock, error: null };
    try { return { now: new Date(parseWallTime(replayTime)), error: null }; }
    catch { return { now: clock, error: 'Choose a valid Philadelphia date and time in Service details.' }; }
  }, [mode, replayTime, clock]);
  const assessment = useMemo(() => route && direction && stop && feed ? assessStop({
    route, feed, directionId: direction.id, stopId: stop.id, now: time.now, maxAgeMs: MAX_AGE_MS, replay: mode === 'replay', boarding: [],
  }) : null, [route, direction, stop, feed, time.now, mode]);

  const waitingForCurrent = mode === 'current' && loading && !liveFeed;
  const historicalFallback = mode === 'current' && feed?.mode === 'snapshot';
  const fresh = mode === 'current' && assessment?.fresh && !historicalFallback;
  const freshnessText = mode === 'replay' ? 'Recorded example · not current service'
    : waitingForCurrent ? 'Checking service updates…'
      : historicalFallback ? 'Current service alerts unavailable'
        : !feed ? 'Loading route…'
          : !fresh ? 'Service alerts out of date'
            : !feed.complete ? 'Some service alerts unavailable' : ageText(feed.fetchedAt, clock);

  const arrivals = realtime.enabled && direction && stop && assessment ? <LiveArrivals feed={realtime.feed} now={realtime.now} error={realtime.error} directionId={direction.id} stopId={stop.id} assessment={assessment} /> : null;
  const evidence = route && direction && stop && feed && assessment ? (
        <div className="journey-evidence">
          <details className="more-details" open={mobile || mode === 'replay'}>
            <summary>Service details<span>{assessment.relevantAlerts.length} {assessment.relevantAlerts.length === 1 ? 'alert' : 'alerts'}</span></summary>
            {!time.error && <>
              <div className="assessment-details"><h2>Why this result</h2><p>{assessment.summary}</p>
                <ul>{assessment.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              </div>
              <AlertDetails items={assessment.relevantAlerts} onInspectAlert={inspectAlert} />
            </>}
            <details className="sources-panel"><summary>Sources & update times</summary>
              <p>Agency data was retrieved {easternTime.format(new Date(feed.fetchedAt))}. The app checks every minute while open and refreshes when you return.</p>
              <p>Collection is scheduled every five minutes, but updates can be delayed. After 15 minutes, current stop impact is shown as unconfirmed.</p>
              {refreshError && mode === 'current' && <p className="source-error">The latest update could not be loaded. {refreshError}</p>}
              <ul>{feed.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> · {source.ok ? 'Retrieved' : 'Unavailable'}{source.error && <span> — {source.error}</span>}</li>)}</ul>
              {feed.warnings.length > 0 && <ul>{feed.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
              <p>Stop {stop.id} · Full-length Route 9 trips only. Short trips are not included.</p>
              <p>Scheduled route pattern: {route.feedVersion}. Valid through {route.validThrough}. <a href={route.sourceUrl} target="_blank" rel="noreferrer">Route source</a>.</p>
              <p>Overlapping paths are displayed separately. Their combination is not a verified driving route. Bus arrivals and field-verified boarding points are outside this pilot.</p>
            </details>
            {mode === 'replay' && <details className="replay-panel" open><summary>Recorded demo controls</summary>
              <div className="replay-controls"><label htmlFor="replay-time">Replay time · Philadelphia</label><input id="replay-time" type="datetime-local" value={replayTime} onChange={(event) => setReplayTime(event.target.value)} /><p>Uses the October 7 snapshot to test alert timing. This does not retrieve what happened at the selected time. Not current travel information.</p></div>
            </details>}
          </details>
          <footer className="journey-footer">Independent Route 9 pilot</footer>
        </div>
  ) : null;

  return <div className={`app-shell ${mobile ? 'app-shell--mobile' : ''}`}>
    <header className="app-header"><a className="brand" href="./"><span aria-hidden="true">↳</span>reroute<span className="brand-city">Philadelphia</span></a><span className="pilot-label">Bus detours <span>Route 9</span></span></header>
    <div className={`freshness-bar ${mode === 'replay' ? 'replay' : fresh ? 'fresh' : 'stale'}`} aria-live="polite">
      <span className="freshness-label"><span className="freshness-dot" aria-hidden="true" />{freshnessText}</span>
      {mode === 'current' ? <button onClick={() => { void refresh(); }} disabled={loading}><Icon name="refresh" />{loading ? 'Checking…' : 'Refresh'}</button>
        : <button onClick={() => window.location.assign(import.meta.env.BASE_URL)}>Back to current</button>}
    </div>

    {!route || !direction || !stop || !feed || !assessment ? <main className="loading-surface" aria-live="polite">
      <h1>{routeError ? 'Route data could not be loaded' : 'Getting Route 9 ready…'}</h1>
      <p>{routeError ?? 'Loading the route and service updates.'}</p>
      {routeError && <button onClick={() => window.location.reload()}>Try again</button>}
    </main> : <main className="app-workspace">
      <aside className="journey-panel">
        <div className="journey-main">
          <div className="journey-heading"><span className="route-number">9</span><div><h1>Check your stop</h1><p>Full-length trips only</p></div></div>
          <div className="journey-fields">
            <fieldset className="direction-picker"><legend>Going toward</legend><div>{route.directions.map((item) => <button type="button" aria-pressed={direction.id === item.id} key={item.id} onClick={() => selectDirection(item.id)}><span>{item.headsign}</span><small>{item.label}</small></button>)}</div></fieldset>
            <StopPicker route={route} direction={direction} stop={stop} feed={feed} now={clock} onSelect={selectStop} replay={mode === 'replay'} />
          </div>
          {time.error ? <p className="inline-error" role="alert">{time.error}</p> : !mobile && <ImpactCard assessment={assessment} stop={stop} replay={mode === 'replay'} />}
          {!mobile && arrivals}
        </div>
        {!mobile && evidence}
      </aside>
      <section className="map-area" aria-label="Map of your stop and reported detours">
        {mobile && time.error && <div className="mobile-replay-error">{evidence}</div>}
        {!time.error && <RouteMap realtime={realtime} direction={direction} stop={stop} assessment={assessment} onSelectStop={selectStop} mobile={mobile}
          result={mobile ? <MobileStopSheet arrivals={arrivals} stop={stop} headsign={direction.headsign} assessment={assessment} replay={mode === 'replay'} expanded={sheetExpanded} onExpandedChange={setSheetExpanded}>{evidence}</MobileStopSheet> : null}
          reviewedAlerts={snapshot?.feed.alerts ?? []} inspectedAlertId={inspectedAlertId}
          inspectionRequest={inspectionRequest} onInspectAlert={inspectAlert} />}
      </section>
    </main>}
  </div>;
}
