import { useEffect, useMemo, useState } from 'react';
import { useTransitData } from './hooks/useTransitData';
import { useSavedJourney } from './hooks/useSavedJourney';
import { assessStop } from './domain/impact';
import { parseWallTime } from './domain/time';
import { StopSearch } from './components/StopSearch';
import { Icon } from './components/Icon';
import { RouteMap } from './components/RouteMap';
import { ImpactCard } from './components/ImpactCard';
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
  const { snapshot, liveFeed, loading, refreshError, routeError, refresh } = useTransitData();
  const { direction, stop, selectDirection, selectStop } = useSavedJourney(snapshot?.route);
  const [mode, setMode] = useState<'current' | 'replay'>('current');
  const [replayTime, setReplayTime] = useState('2026-10-07T21:54');
  const [clock, setClock] = useState(() => new Date());
  const [inspectedAlertId, setInspectedAlertId] = useState('');
  const [inspectionRequest, setInspectionRequest] = useState(0);

  function inspectAlert(id: string) {
    setInspectedAlertId(id);
    setInspectionRequest((request) => request + 1);
  }
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
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
      : historicalFallback ? 'Current updates unavailable'
        : !feed ? 'Loading route…'
          : !fresh ? 'Updates are out of date'
            : !feed.complete ? 'Some updates unavailable' : ageText(feed.fetchedAt, clock);

  return <>
    <header className="app-header"><a className="brand" href="./"><span aria-hidden="true">↳</span>reroute<span className="brand-city">Philadelphia</span></a><span className="pilot-label">Bus detours <span>Route 9</span></span></header>
    <div className={`freshness-bar ${mode === 'replay' ? 'replay' : fresh ? 'fresh' : 'stale'}`} aria-live="polite">
      <span className="freshness-label"><span className="freshness-dot" aria-hidden="true" />{freshnessText}</span>
      {mode === 'current' ? <button onClick={() => { void refresh(); }} disabled={loading}><Icon name="refresh" />{loading ? 'Checking…' : 'Refresh'}</button>
        : <button onClick={() => setMode('current')}>Back to current</button>}
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
            <StopSearch key={direction.id} stops={direction.stops} stop={stop} onSelect={selectStop} />
          </div>
          {time.error ? <p className="inline-error" role="alert">{time.error}</p> : <ImpactCard assessment={assessment} stop={stop} replay={mode === 'replay'} />}
        </div>
        <div className="journey-evidence">
          <details className="more-details">
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
            <details className="replay-panel"><summary>Try a recorded example</summary>
              <div className="mode-switch" role="group" aria-label="Data mode"><button aria-pressed={mode === 'current'} onClick={() => setMode('current')}>Current conditions</button><button aria-pressed={mode === 'replay'} onClick={() => setMode('replay')}>Recorded example</button></div>
              {mode === 'replay' && <div className="replay-controls"><label htmlFor="replay-time">Replay time · Philadelphia</label><input id="replay-time" type="datetime-local" value={replayTime} onChange={(event) => setReplayTime(event.target.value)} /><p>Uses the October 7 snapshot. Not current travel information.</p></div>}
            </details>
          </details>
          <footer className="journey-footer">Independent Route 9 pilot</footer>
        </div>
      </aside>
      <section className="map-area" aria-label="Map of your stop and reported detours">
        {!time.error && <RouteMap direction={direction} stop={stop} assessment={assessment} onSelectStop={selectStop} replay={mode === 'replay'}
          reviewedAlerts={snapshot?.feed.alerts ?? []} inspectedAlertId={inspectedAlertId}
          inspectionRequest={inspectionRequest} onInspectAlert={inspectAlert} />}
      </section>
    </main>}
  </>;
}
