import gtfs from 'gtfs-realtime-bindings';
import { normalizeRealtime } from './normalize';
const base = 'https://www3.septa.org/gtfsrt/septa-pa-us/';
export async function getRealtime() {
  async function read(path: string) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`SEPTA ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 8_000_000) throw new Error('Oversized SEPTA feed');
    return gtfs.transit_realtime.FeedMessage.toObject(gtfs.transit_realtime.FeedMessage.decode(bytes), { longs: Number, enums: String });
  }
  const results = await Promise.allSettled([read('Vehicle/rtVehiclePosition.pb'), read('Trip/rtTripUpdates.pb')]);
  return normalizeRealtime(results[0].status === 'fulfilled' ? results[0].value : null, results[1].status === 'fulfilled' ? results[1].value : null, Date.now());
}
