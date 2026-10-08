import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlertFeed } from '../domain/types';
import { fetchLiveFeed, selectLatestFeed } from './client';
import { validateLiveFeed } from './validate';

const PRIMARY = 'https://raw.githubusercontent.com/wasifsarwar/route9DetourMap/live-data/current-alerts.json';
function feed(time: string, overrides: Partial<AlertFeed> = {}): AlertFeed {
  return { routeId: '9', mode: 'live', fetchedAt: time, collectedAt: time, complete: true, alerts: [], warnings: [],
    sources: [{ name: 'SEPTA detours', url: 'https://www3.septa.org/api/v2/detours/?route=9', fetchedAt: time, ok: true }], ...overrides };
}
const older = () => feed('2026-10-08T02:00:00.000Z');
const newer = () => feed('2026-10-08T02:05:00.000Z');
const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('independent feed refresh', () => {
  it('uses the configured primary with a shared minute cache key and omits credentials', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T02:06:12Z'));
    vi.stubEnv('VITE_LIVE_FEED_URL', PRIMARY);
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(newer()));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchLiveFeed();
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(`${PRIMARY}?v=${Math.floor(Date.now() / 60_000)}`);
    expect(options).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.fetchedAt).toBe('2026-10-08T02:05:00.000Z');
    expect(result.sources).toEqual(newer().sources);
  });

  it('loads and validates the dated Pages fallback when the primary is malformed', async () => {
    const original = older();
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ invalid: true })).mockResolvedValueOnce(jsonResponse(original));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchLiveFeed({ liveFeedUrl: PRIMARY });
    expect(fetcher.mock.calls[1][0]).toMatch(/data\/current-alerts\.json$/);
    expect(result.fetchedAt).toBe(original.fetchedAt);
    expect(result.collectedAt).toBe(original.collectedAt);
    expect(result.sources).toEqual(original.sources);
    expect(result.warnings.join(' ')).toContain('original source times');
    expect(original.warnings).toEqual([]);
  });

  it('rejects a malformed Pages copy too, leaving the hook to retain its existing feed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce(jsonResponse({ alerts: [] })));
    await expect(fetchLiveFeed({ liveFeedUrl: PRIMARY, previousFeed: newer() })).rejects.toThrow('validation');
  });

  it('never regresses to an older Pages publication and does not accumulate fallback warnings', async () => {
    const previous = newer();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('Primary offline')).mockResolvedValueOnce(jsonResponse(older()))
      .mockRejectedValueOnce(new Error('Primary offline')).mockResolvedValueOnce(jsonResponse(older()));
    vi.stubGlobal('fetch', fetcher);
    const first = await fetchLiveFeed({ liveFeedUrl: PRIMARY, previousFeed: previous });
    const second = await fetchLiveFeed({ liveFeedUrl: PRIMARY, previousFeed: first });
    expect(second.collectedAt).toBe(previous.collectedAt);
    expect(second.fetchedAt).toBe(previous.fetchedAt);
    expect(second.warnings).toHaveLength(1);
    expect(previous.warnings).toEqual([]);
  });

  it('accepts newer known collection failures without hiding them behind older successful data', async () => {
    const failed = feed('1970-01-01T00:00:00.000Z', {
      collectedAt: '2026-10-08T02:10:00.000Z', complete: false,
      sources: [{ name: 'SEPTA detours', url: 'https://www3.septa.org/api/v2/detours/?route=9', fetchedAt: null, ok: false, error: 'Upstream timeout' }],
    });
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(failed)).mockResolvedValueOnce(jsonResponse(older()));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchLiveFeed({ liveFeedUrl: PRIMARY, previousFeed: newer() });
    expect(result).toEqual(failed);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.fetchedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('finds a newer bundled collection when the independent primary has grown stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T02:30:00Z'));
    const bundle = feed('2026-10-08T02:28:00.000Z');
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(older())).mockResolvedValueOnce(jsonResponse(bundle));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchLiveFeed({ liveFeedUrl: PRIMARY })).toEqual(bundle);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retains valid stale primary evidence if checking the bundle also fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T02:30:00Z'));
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(older())).mockRejectedValueOnce(new Error('Pages offline'));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchLiveFeed({ liveFeedUrl: PRIMARY })).toEqual(older());
  });

  it('does not start a fallback when the caller cancels the primary request', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const result = fetchLiveFeed({ liveFeedUrl: PRIMARY, signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('times out a stuck primary then recovers through Pages', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    })).mockResolvedValueOnce(jsonResponse(older()));
    vi.stubGlobal('fetch', fetcher);
    const pending = fetchLiveFeed({ liveFeedUrl: PRIMARY });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(result.fetchedAt).toBe(older().fetchedAt);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supports Pages-only builds without inventing a source timestamp', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(older())));
    expect(await fetchLiveFeed({ liveFeedUrl: '' })).toEqual(older());
  });
});

describe('publication ordering and compatibility', () => {
  it('uses collection order but never changes the older upstream retrieval time', () => {
    const latestPartial = feed('2026-10-08T01:55:00.000Z', { collectedAt: '2026-10-08T02:06:00.000Z', complete: false });
    expect(selectLatestFeed(newer(), latestPartial)).toBe(latestPartial);
    expect(latestPartial.fetchedAt).toBe('2026-10-08T01:55:00.000Z');
    expect(selectLatestFeed(newer(), older()).fetchedAt).toBe(newer().fetchedAt);
  });

  it('supports old bundles without collection metadata and rejects invalid metadata', () => {
    const legacy = older();
    delete legacy.collectedAt;
    expect(validateLiveFeed(legacy)).toEqual(legacy);
    expect(selectLatestFeed(legacy, newer()).collectedAt).toBe(newer().collectedAt);
    expect(() => validateLiveFeed({ ...legacy, collectedAt: 'not-a-time' })).toThrow();
    expect(() => validateLiveFeed({ ...legacy, collectedAt: null })).toThrow();
    expect(() => validateLiveFeed({ ...legacy, collectedAt: '2026-02-30T02:00:00.000Z' })).toThrow();
    expect(() => validateLiveFeed({ ...legacy, collectedAt: '2026-10-08T24:00:00.000Z' })).toThrow();
  });
});
