import type { LocationFix } from '../domain/nearbyStops';

/** A single fix only. Coordinates are never persisted or sent by the app. */
export function requestLocation(geolocation: Pick<Geolocation, 'getCurrentPosition'> | undefined): Promise<LocationFix> {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new Error('Location is unavailable in this browser. Search for your stop instead.')); return; }
    geolocation.getCurrentPosition(position => resolve({
      lat: position.coords.latitude, lon: position.coords.longitude,
      accuracy: position.coords.accuracy, timestamp: position.timestamp,
    }), error => reject(new Error(error.code === 1
      ? 'Location access is off. Allow it in your browser settings, or search for your stop.'
      : error.code === 3 ? 'Location took too long. Try again or search for your stop.'
        : 'Your location could not be found. Try again or search for your stop.')),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}
