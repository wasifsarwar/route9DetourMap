import { useEffect, useState } from 'react';
import { realtimeUrl, validateRealtime } from './client';
import { currentReport, type RealtimeFeed } from './types';
export function useRealtime(enabled: boolean) {
  const [feed, setFeed] = useState<RealtimeFeed | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled || !realtimeUrl) return;
    let disposed = false, controller: AbortController | null = null;
    async function refresh() {
      setNow(Date.now());
      if (document.visibilityState !== 'visible' || !navigator.onLine) { controller?.abort(); controller = null; if (!navigator.onLine) setError(true); return; }
      if (controller) return;
      const request = new AbortController(); controller = request;
      const timeout = setTimeout(() => request.abort(), 12_000);
      try {
        const response = await fetch(realtimeUrl, { signal: request.signal });
        if (!response.ok) throw new Error('Unavailable');
        const data = validateRealtime(await response.json());
        if (!disposed && controller === request && !request.signal.aborted) { setFeed(data); setError(false); setNow(Date.now()); }
      } catch { if (!disposed && controller === request) { setFeed(null); setError(true); } }
      finally { clearTimeout(timeout); if (controller === request) controller = null; }
    }
    void refresh();
    const poll = setInterval(() => { void refresh(); }, 20_000);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
    return () => { disposed = true; controller?.abort(); clearInterval(poll); clearInterval(tick); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); };
  }, [enabled]);
  const visible = enabled && !error && feed && currentReport(feed.fetchedAt, now) ? feed : null;
  return { feed: visible, now, error: error || !!feed && !currentReport(feed.fetchedAt, now), enabled: enabled && !!realtimeUrl };
}
