# Reroute — Route 9 stop-impact pilot

[Open the app](https://wasifsarwar.github.io/route9DetourMap/)

Choose your direction and usual stop to see whether SEPTA reports it affected by a detour. The app combines applicable alerts, shows normal and reported paths, and keeps missing or conflicting information visible. An orange line is never treated as proof of a boarding location.

## Stack

React 19, strict TypeScript, Vite, Leaflet, and Vitest. A Node.js collector retrieves public SEPTA data in GitHub Actions; GitHub Pages serves the built app and same-origin JSON. There is no API key or application server. Dependencies are pinned by `package-lock.json`.

## Local development

Use Node.js 24 LTS (minimum 22.12) and npm.

```sh
npm ci
npm run refresh:data
npm run dev
# http://127.0.0.1:5173/
```

The refresh command needs network access. Without a generated current feed, the app clearly reports that current data is unavailable and still offers the recorded example.

```sh
npm run check
npm test
npm run build
npm run preview
# http://127.0.0.1:4173/
```

## Deployment and freshness

`.github/workflows/pages.yml` installs dependencies, checks types, runs tests, retrieves agency feeds, builds the app, and publishes `dist/` to GitHub Pages. Pushes to `main`, manual runs, and a five-minute schedule trigger deployment. Pull requests run checks and build without publishing or retrieving external data. Pages must use **GitHub Actions** as its source.

GitHub scheduled runs can be delayed; this is not a guaranteed five-minute data service. The browser checks the published JSON every minute. Freshness uses the upstream retrieval timestamp, never the browser's fetch time. Data older than 15 minutes cannot confirm current stop impact. A failed source is published as incomplete; the collector does not relabel an old successful result as fresh. Check the Actions tab if the feed becomes stale. A production service should use a monitored collector with dependable scheduling.

`public/data/current-alerts.json` and `dist/` are generated and ignored by Git. Relative asset URLs support the `/route9DetourMap/` Pages path. `.openai/hosting.json` is historical metadata for the original preview and is not used in deployment.

## Project structure

- `src/App.tsx`, `src/components/`, `src/styles.css`: journey selection, status, source details, and map UI.
- `src/hooks/useTransitData.ts`: independent route loading, cancellation, and current-feed polling.
- `src/domain/`: pure stop-impact and Philadelphia time rules, with consequential edge-case tests.
- `src/data/`: upstream collection, normalization, runtime validation, recorded snapshot adapter, and fixture tests.
- `public/data/route9-snapshot.json`: recorded baseline and alerts, with original provenance and source warnings.

Keep policy decisions in the domain layer, source-specific interpretation in the data layer, and display logic in components. Add a regression test for changes that could incorrectly declare a stop usable or recommend boarding.

## Data and interpretation

The collector combines SEPTA's [detour feed](https://www3.septa.org/api/v2/detours/?route=9), [legacy service notices](https://www3.septa.org/api/Alerts/get_alert_data.php?route_id=bus_route_9), and directional KML. Legacy notices are collected in Actions because that endpoint does not permit browser cross-origin access. Matching records with materially conflicting text or schedules remain unresolved. The published feed is validated before rendering.

The baseline represents two full-length Route 9 GTFS patterns, valid September 27, 2026 through February 20, 2027. Short trips and other variants are not represented. Replace the baseline with a reviewed GTFS snapshot when service changes; after its validity window the app cannot confirm stop status.

An explicit skipped-stop entry can establish that a stop is affected. A partial list cannot establish that unlisted stops are served. Missing stop lists, conflicting schedules, incomplete feeds, and stale data cannot produce an all-clear result. Unverified paths remain marked, and separate overlapping paths are not merged into a supposedly verified route.

Alert cards expand direction and turn shorthand into ordered instructions while keeping the unchanged source wording in a separate disclosure. The sinkhole notice shown in Transit and SEPTA's original raw message have the same direction, date, and turns; SEPTA's legacy feed already includes expanded Left/Right wording. Text formatting never resolves conflicting dates or changes stop status.

Use **Detour to inspect → View detour** to compare the path with the normal route. Circular dots follow the displayed path; square stop markers represent physical boarding locations. The reviewed sinkhole illustration follows 4th → Spruce → 9th → Walnut and replaces the bypassed normal segment visually. It is reused only when the current notice matches the reviewed text and direction. **Agency geometry** remains available for comparison with the published loop. Geometric bypass detection marks Walnut/5th, Walnut/7th and Walnut/8th as possibly skipped, without changing their closure assessment or inventing relocated stops. Current feeds contain no exact temporary-stop coordinates; intersection coordinates identify turns, not boarding points.

The current legacy notice explicitly closes northbound Schuylkill Av & JFK Blvd (stop 30576). It describes replacement boarding only as an area on Schuylkill between Walnut and Chestnut. The UI quotes that instruction with its source; it does not invent a replacement stop ID, map pin, or walking route. An exact alternative requires separate agency evidence and must pass every applicable alert check.

Recorded-example mode uses the October 7, 2026 snapshot and a Philadelphia-time replay control. It is clearly historical and never supplies live alternative-boarding guidance. Candidate paths in that snapshot are interpretations, not field observations.

## Validation

Automated tests cover alert overlap, partial stop lists, stale/incomplete data, source contradictions, malformed feeds, direction, DST and overnight windows, and restrictions on alternative boarding. For a browser smoke test:

1. Refresh agency data and choose northbound Schuylkill Av & JFK Blvd. While the explicit closure remains current, expect affected plus area-only agency instructions.
2. Choose a different stop or direction. Missing stop coverage must remain unconfirmed.
3. Open the relevant alerts and original sources; all applicable alerts should be available together.
4. Switch to the recorded example and change the Philadelphia time; the historical label must remain visible.
5. Inspect the map, select a stop, and try Full route / Near stop. Check phone-width layout.
6. With the current feed missing or older than 15 minutes, expect unable to confirm, not an all-clear.
7. Inspect Sink Hole, choose View detour, and compare Written directions with Agency geometry. Path dots should follow the selected path; potential bypass markers must say unconfirmed, and the original alert must remain unchanged.

The next product test is with five Route 9 riders: compare comprehension and decision time against the original agency alert. Separately verify a sample of detours and boarding locations with the agency or field observation. Usability results alone do not establish boarding accuracy.

No arrivals, bus tracking, accounts, payments, automatic GTFS refresh, or field verification are implemented. Public feed access does not establish commercial reuse rights. Maps include OpenStreetMap attribution; review data and tile-service terms before scaling or monetization. Leaflet's license is included in its npm package.
