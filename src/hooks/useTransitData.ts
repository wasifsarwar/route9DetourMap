import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLiveFeed, loadSnapshot } from '../data/client';
import type { AlertFeed, RouteData } from '../domain/types';

export function useTransitData() {
  const [snapshot, setSnapshot] = useState<{ route: RouteData; feed: AlertFeed } | null>(null);
  const [liveFeed, setLiveFeed] = useState<AlertFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const feed = await fetchLiveFeed({ signal: controller.signal });
      if (!controller.signal.aborted) {
        setLiveFeed(feed);
        setRefreshError(null);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setRefreshError(error instanceof Error ? error.message : 'The latest feed could not be loaded.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSnapshot({ signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setSnapshot(result); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setRouteError(error instanceof Error ? error.message : 'Route data could not be loaded.');
      });
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      controller.abort();
      pending.current?.abort();
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { snapshot, liveFeed, loading, refreshError, routeError, refresh };
}
