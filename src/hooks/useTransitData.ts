import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLiveFeed, loadSnapshot } from '../data/client';
import type { AlertFeed, RouteData } from '../domain/types';

type PendingRequest = { controller: AbortController; promise: Promise<void> };
export interface RefreshEnvironment {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  navigator: Pick<Navigator, 'onLine'>;
}

/** Keep background tabs quiet and recover promptly after returning to the app or reconnecting. */
export function attachRefreshTriggers(refresh: () => Promise<void>, suspend: (offline: boolean) => void, environment: RefreshEnvironment): () => void {
  const available = () => environment.document.visibilityState === 'visible' && environment.navigator.onLine;
  const poll = () => { if (available()) void refresh(); };
  const resumeOrSuspend = () => {
    if (available()) void refresh();
    else suspend(!environment.navigator.onLine);
  };
  const timer = setInterval(poll, 60_000);
  environment.document.addEventListener('visibilitychange', resumeOrSuspend);
  environment.window.addEventListener('online', resumeOrSuspend);
  environment.window.addEventListener('offline', resumeOrSuspend);
  return () => {
    clearInterval(timer);
    environment.document.removeEventListener('visibilitychange', resumeOrSuspend);
    environment.window.removeEventListener('online', resumeOrSuspend);
    environment.window.removeEventListener('offline', resumeOrSuspend);
  };
}

export function useTransitData() {
  const [snapshot, setSnapshot] = useState<{ route: RouteData; feed: AlertFeed } | null>(null);
  const [liveFeed, setLiveFeed] = useState<AlertFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const pending = useRef<PendingRequest | null>(null);
  const routePending = useRef<PendingRequest | null>(null);
  const routeLoaded = useRef(false);
  const latestFeed = useRef<AlertFeed | null>(null);

  const loadRoute = useCallback((): Promise<void> => {
    if (routeLoaded.current) return Promise.resolve();
    if (routePending.current) return routePending.current.promise;
    if (!navigator.onLine) {
      setRouteError('You are offline. Route data will load when your connection returns.');
      return Promise.resolve();
    }
    const controller = new AbortController();
    const promise = (async () => {
      try {
        const result = await loadSnapshot({ signal: controller.signal });
        if (!controller.signal.aborted) {
          routeLoaded.current = true;
          setSnapshot(result);
          setRouteError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) setRouteError(error instanceof Error ? error.message : 'Route data could not be loaded.');
      } finally {
        if (routePending.current?.controller === controller) routePending.current = null;
      }
    })();
    routePending.current = { controller, promise };
    return promise;
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (!navigator.onLine || document.visibilityState !== 'visible') {
      setLoading(false);
      if (!navigator.onLine) setRefreshError('You are offline. Updates will resume when your connection returns.');
      return Promise.resolve();
    }
    // Clicks, resume events and the poll timer share one in-flight request.
    if (pending.current) return pending.current.promise;
    void loadRoute();
    const controller = new AbortController();
    setLoading(true);
    const promise = (async () => {
      try {
        const feed = await fetchLiveFeed({ signal: controller.signal, previousFeed: latestFeed.current });
        if (!controller.signal.aborted) {
          latestFeed.current = feed;
          setLiveFeed(feed);
          setRefreshError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) setRefreshError(error instanceof Error ? error.message : 'The latest feed could not be loaded.');
      } finally {
        if (pending.current?.controller === controller) {
          pending.current = null;
          setLoading(false);
        }
      }
    })();
    pending.current = { controller, promise };
    return promise;
  }, [loadRoute]);

  useEffect(() => {
    void loadRoute();
    void refresh();
    const stopTriggers = attachRefreshTriggers(refresh, (offline) => {
      pending.current?.controller.abort();
      pending.current = null;
      setLoading(false);
      if (offline) setRefreshError('You are offline. Updates will resume when your connection returns.');
    }, { document, window, navigator });
    return () => {
      stopTriggers();
      pending.current?.controller.abort();
      routePending.current?.controller.abort();
      pending.current = null;
      routePending.current = null;
    };
  }, [loadRoute, refresh]);

  return { snapshot, liveFeed, loading, refreshError, routeError, refresh };
}
