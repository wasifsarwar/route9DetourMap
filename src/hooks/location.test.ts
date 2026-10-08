import { expect, it, vi } from 'vitest';
import { requestLocation } from './location';
it('requests a single fresh fix with a bounded timeout', async () => {
  const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 40, longitude: -75, accuracy: 20 }, timestamp: 1000 } as GeolocationPosition));
  expect(await requestLocation({ getCurrentPosition })).toEqual({ lat: 40, lon: -75, accuracy: 20, timestamp: 1000 });
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(getCurrentPosition.mock.calls[0]).toHaveLength(3);
  expect((getCurrentPosition.mock.calls[0] as unknown[])[2]).toEqual({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
});
it.each([[1, 'Location access is off'], [2, 'could not be found'], [3, 'took too long']])('handles location failure %s with search fallback', async (code, message) => {
  const getCurrentPosition = (_success: PositionCallback, error?: PositionErrorCallback | null) => error?.({ code } as GeolocationPositionError);
  await expect(requestLocation({ getCurrentPosition })).rejects.toThrow(message);
});
it('handles browsers without geolocation', async () => {
  await expect(requestLocation(undefined)).rejects.toThrow('Search for your stop');
});
