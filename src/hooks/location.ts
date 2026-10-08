import type { LocationFix } from '../domain/nearbyStops';

/** On-demand location only. No tracking, persistence, or coordinate uploads. */
export function requestLocation(geolocation: Pick<Geolocation, 'getCurrentPosition'> | undefined, signal?: AbortSignal): Promise<LocationFix> {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new Error('Location is unavailable in this browser. Search for your stop instead.')); return; }
    let finished = false;
    const finish = (fix?: LocationFix, error?: Error) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      if (fix) resolve(fix); else reject(error);
    };
    const abort = () => finish(undefined, new Error('Location request cancelled.'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    const attempt = (precise: boolean) => {
      if (finished) return;
      try {
        geolocation.getCurrentPosition(position => {
          if (finished) return;
          if (!precise && position.coords.accuracy > 1000) { attempt(true); return; }
          finish({ lat: position.coords.latitude, lon: position.coords.longitude,
            accuracy: position.coords.accuracy, timestamp: position.timestamp });
        }, error => {
          if (finished) return;
          if (!precise && error.code !== 1) { attempt(true); return; }
          finish(undefined, new Error(error.code === 1
            ? 'Location access is off. Allow it in your browser settings, or search for your stop.'
            : 'Your browser couldn’t determine your location. Check device Location Services or try your phone. You can still search Philadelphia stops.'));
        }, { enableHighAccuracy: precise, timeout: precise ? 12000 : 8000, maximumAge: precise ? 0 : 60000 });
      } catch { finish(undefined, new Error('Location is unavailable in this browser. Search for your stop instead.')); }
    };
    attempt(false);
  });
}
