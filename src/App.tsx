import { useEffect, useMemo, useState } from 'react';
import { useTransitData } from './hooks/useTransitData';
import { assessStop } from './domain/impact';
import { parseWallTime } from './domain/time';
import type { DirectionId } from './domain/types';
import { RouteMap } from './components/RouteMap';
import { ImpactCard } from './components/ImpactCard';
import { AlertDetails } from './components/AlertDetails';

const MAX_AGE_MS = 15 * 60_000;
const easternTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

function ageText(fetchedAt: string, now: Date) {
  const minutes = Math.floor((now.getTime() - Date.parse(fetchedAt)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < -1) return 'Check time unavailable';
  if (minutes <= 0) return 'Checked less than a minute ago';
  if (minutes < 60) return `Checked ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  if (minutes < 1440) return `Checked ${Math.floor(minutes / 60)} hours ago`;
  return `Checked ${Math.floor(minutes / 1440)} days ago`;
}

export default function App() {
  const { snapshot, liveFeed, loading, refreshError, routeError, refresh } = useTransitData();
  const [directionId, setDirectionId] = useState<DirectionId>('1');
  const [stopId, setStopId] = useState('30576');
  const [mode, setMode] = useState<'current' | 'replay'>('current');
  const [replayTime, setReplayTime] = useState('2026-10-07T21:54');
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { setClock(new Date()); }, [liveFeed]);

  const route = snapshot?.route;
  const direction = route?.directions.find((item) => item.id === directionId) ?? route?.directions[0];
  const stop = direction?.stops.find((item) => item.id === stopId) ?? direction?.stops[0];
  const feed = mode === 'replay' ? snapshot?.feed : liveFeed ?? snapshot?.feed;
  const time = useMemo(() => {
    if (mode === 'current') return { now: clock, error: null };
    try { return { now: new Date(parseWallTime(replayTime)), error: null }; }
    catch { return { now: clock, error: 'Choose a valid Philadelphia date and time.' }; }
  }, [mode, replayTime, clock]);
  const assessment = useMemo(() => route && direction && stop && feed ? assessStop({
    route, feed, directionId: direction.id, stopId: stop.id, now: time.now, maxAgeMs: MAX_AGE_MS, replay: mode === 'replay', boarding: [],
  }) : null, [route, direction, stop, feed, time.now, mode]);

  function changeDirection(value: DirectionId) {
    setDirectionId(value);
    const next = route?.directions.find((item) => item.id === value);
    setStopId(next?.stops.find((item) => item.id === '30576')?.id ?? next?.stops[0]?.id ?? '');
  }

  const waitingForCurrent = mode === 'current' && loading && !liveFeed;
  const historicalFallback = mode === 'current' && feed?.mode === 'snapshot';
  const fresh = mode === 'current' && assessment?.fresh && !historicalFallback;

  return <>
    <header className="app-header"><a className="brand" href="./"><span aria-hidden="true">↳</span>reroute<span className="brand-city">PHILADELPHIA</span></a><span className="pilot-label">Route 9 pilot</span></header>
    <div className={`freshness-bar ${mode === 'replay' ? 'replay' : fresh ? 'fresh' : 'stale'}`} aria-live="polite">
      <div><span className="freshness-label">{mode === 'replay' ? 'RECORDED EXAMPLE' : waitingForCurrent ? 'CHECKING FEEDS' : historicalFallback ? 'CURRENT DATA UNAVAILABLE' : fresh ? 'LATEST AGENCY FEED' : 'FRESH CHECK NEEDED'}</span>
        <span>{mode === 'replay' ? 'Historical data for testing. Not current travel information.' : waitingForCurrent ? 'Loading the most recent published agency information…' : feed ? `${ageText(feed.fetchedAt, clock)}${feed.complete ? '' : ' · Some sources are unavailable'}` : 'Loading route data…'}</span></div>
      {mode === 'current' && <button onClick={() => { void refresh(); }} disabled={loading}>{loading ? 'Checking…' : 'Check for update'}</button>}
    </div>

    {!route || !direction || !stop || !feed || !assessment ? <main className="loading-surface" aria-live="polite">
      <h1>{routeError ? 'Route data could not be loaded' : 'Getting Route 9 ready…'}</h1>
      <p>{routeError ?? 'Loading the route, stops, and latest available alerts.'}</p>
      {routeError && <button onClick={() => window.location.reload()}>Try again</button>}
    </main> : <main className="app-workspace">
      <aside className="journey-panel">
        <div className="journey-main">
        <div className="journey-heading"><span className="route-number">9</span><div><p className="eyebrow">YOUR EVERYDAY JOURNEY</p><h1>Is my stop affected?</h1><p>Check the stop you normally use.</p></div></div>
        <div className="journey-fields">
          <label htmlFor="route">Route</label><select id="route" value="9" aria-describedby="route-scope" onChange={() => {}}><option value="9">9 · Andorra to 4th & Walnut</option></select>
          <p className="field-hint" id="route-scope">This pilot covers Route 9’s full-length trips.</p>
          <label htmlFor="direction">Direction</label><select id="direction" value={direction.id} onChange={(event) => changeDirection(event.target.value as DirectionId)}>{route.directions.map((item) => <option value={item.id} key={item.id}>{item.label} · {item.headsign}</option>)}</select>
          <label htmlFor="stop">Your usual stop</label><select id="stop" value={stop.id} onChange={(event) => setStopId(event.target.value)}>{direction.stops.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
          <p className="field-hint">Stop {stop.id} · You can also select a stop on the map.</p>
        </div>

        <div className="mode-switch" role="group" aria-label="Data mode"><button aria-pressed={mode === 'current'} onClick={() => setMode('current')}>Current conditions</button><button aria-pressed={mode === 'replay'} onClick={() => setMode('replay')}>Recorded example</button></div>
        {mode === 'replay' && <div className="replay-controls"><label htmlFor="replay-time">Replay time · Philadelphia</label><input id="replay-time" type="datetime-local" value={replayTime} onChange={(event) => setReplayTime(event.target.value)} /><p>Uses the October 7 snapshot and checks all of its relevant alerts together.</p></div>}
        {time.error ? <p className="inline-error" role="alert">{time.error}</p> : <>
          <ImpactCard assessment={assessment} stop={stop} replay={mode === 'replay'} />
        </>}
        </div>
        <div className="journey-evidence">
        {!time.error && <AlertDetails items={assessment.relevantAlerts} />}
        <details className="sources-panel"><summary>Data freshness & sources</summary>
          <p>Agency data was retrieved {easternTime.format(new Date(feed.fetchedAt))}. The app checks for a newly published feed every minute.</p>
          <p>Collection is scheduled every five minutes, but updates can be delayed. After 15 minutes, current stop impact is shown as unable to confirm.</p>
          {refreshError && mode === 'current' && <p className="source-error">The latest update could not be loaded. {refreshError}</p>}
          <ul>{feed.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> · {source.ok ? 'Retrieved' : 'Unavailable'}{source.error && <span> — {source.error}</span>}</li>)}</ul>
          {feed.warnings.length > 0 && <ul>{feed.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          <p>Scheduled route pattern: {route.feedVersion}. Valid through {route.validThrough}. <a href={route.sourceUrl} target="_blank" rel="noreferrer">Route source</a>.</p>
          <p>Reported paths are shown separately when alerts overlap. Their combination is not a verified driving route. Bus arrival times and field-verified boarding points are outside this pilot.</p>
        </details>
        <footer className="journey-footer">Independent pilot · Not affiliated with SEPTA</footer>
        </div>
      </aside>
      <section className="map-area" aria-label="Map of your stop and reported detours">
        <div className="map-heading"><div><p className="eyebrow">{direction.label.toUpperCase()} · ROUTE 9</p><h2>{stop.name}</h2></div><span className={`map-status status-${assessment.status}`}>{time.error ? 'Invalid replay time' : assessment.status === 'affected' ? 'Stop affected' : assessment.status === 'unaffected' ? 'No reported impact' : 'Unconfirmed'}</span></div>
        {!time.error && <RouteMap direction={direction} stop={stop} assessment={assessment} onSelectStop={setStopId} />}
      </section>
    </main>}
  </>;
}
