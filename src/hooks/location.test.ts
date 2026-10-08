import { expect, it, vi } from 'vitest';
import { requestLocation } from './location';
it('tries a standard-accuracy fix first with a bounded timeout', async () => {
  const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 40, longitude: -75, accuracy: 20 }, timestamp: 1000 } as GeolocationPosition));
  expect(await requestLocation({ getCurrentPosition })).toEqual({ lat: 40, lon: -75, accuracy: 20, timestamp: 1000 });
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(getCurrentPosition.mock.calls[0]).toHaveLength(3);
  expect((getCurrentPosition.mock.calls[0] as unknown[])[2]).toEqual({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
});
it.each([[1, 'Location access is off'], [2, 'couldn’t determine'], [3, 'couldn’t determine']])('handles location failure %s with search fallback', async (code, message) => {
  const getCurrentPosition = (_success: PositionCallback, error?: PositionErrorCallback | null) => error?.({ code } as GeolocationPositionError);
  await expect(requestLocation({ getCurrentPosition })).rejects.toThrow(message);
});
it('handles browsers without geolocation', async () => {
  await expect(requestLocation(undefined)).rejects.toThrow('Search for your stop');
});

it('retries a timeout once with high accuracy', async () => {
  const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>()
    .mockImplementationOnce((_success, error) => error?.({ code: 3 } as GeolocationPositionError))
    .mockImplementationOnce(success => success({ coords: { latitude: 47.4, longitude: -122.2, accuracy: 50 }, timestamp: 1000 } as GeolocationPosition));
  const fix = await requestLocation({ getCurrentPosition });
  expect(fix.lat).toBe(47.4);
  expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  expect(getCurrentPosition.mock.calls[1][2]).toEqual({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
});
it('does not retry permission denial', async () => {
  const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((_success, error) => error?.({ code: 1 } as GeolocationPositionError));
  await expect(requestLocation({ getCurrentPosition })).rejects.toThrow('Location access is off');
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});
it('ignores late callbacks and prevents retries after cancellation', async () => {
  let fail: PositionErrorCallback | null | undefined;
  const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((_success, error) => { fail = error; });
  const controller = new AbortController();
  const result = requestLocation({ getCurrentPosition }, controller.signal);
  controller.abort();
  await expect(result).rejects.toThrow('cancelled');
  fail?.({ code: 3 } as GeolocationPositionError);
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});
