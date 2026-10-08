/** Runs in GitHub Actions because SEPTA's legacy service-notice endpoint disallows browser CORS. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeFeed, SOURCES, type RawFeed, type SourceKey, type SourceResult } from './normalize';
import { normalizeSnapshot } from './snapshot';

async function requestSource(key: SourceKey): Promise<SourceResult> {
  let error = 'Source request failed.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(SOURCES[key], { signal: AbortSignal.timeout(20_000), headers: { Accept: key === 'detours' || key === 'legacy' ? 'application/json' : 'application/xml, text/xml, */*' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value: unknown = key === 'detours' || key === 'legacy' ? await response.json() : await response.text();
      return { value, fetchedAt: new Date().toISOString() };
    } catch (failure) { error = failure instanceof Error ? failure.message : error; }
  }
  return { error, fetchedAt: null };
}

const outputDirectory = resolve('public/data');
const { route } = normalizeSnapshot(JSON.parse(await readFile(resolve(outputDirectory, 'route9-snapshot.json'), 'utf8')) as unknown);
const keys = Object.keys(SOURCES) as SourceKey[];
const results = await Promise.all(keys.map(async key => [key, await requestSource(key)] as const));
const feed = normalizeFeed(Object.fromEntries(results) as RawFeed, route);
await mkdir(outputDirectory, { recursive: true });
const destination = resolve(outputDirectory, 'current-alerts.json');
const temporary = `${destination}.tmp`;
await writeFile(temporary, `${JSON.stringify(feed, null, 2)}\n`);
await rename(temporary, destination);
console.log(JSON.stringify({ fetchedAt: feed.fetchedAt, complete: feed.complete, alertCount: feed.alerts.length, sources: feed.sources.map(source => ({ name: source.name, ok: source.ok, error: source.error })) }, null, 2));
// Publish failures too: their explicit incomplete state must replace any previously "fresh" success.
