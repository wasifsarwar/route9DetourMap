# Reroute — Route 9 stop-impact pilot

[Open the app](https://wasifsarwar.github.io/route9DetourMap/)

Choose your direction and usual stop to see whether SEPTA reports it affected by a detour. The app combines applicable alerts, shows normal and reported paths, and keeps missing or conflicting information visible. An orange line is never treated as proof of a boarding location.

The default screen shows destination buttons, a combined stop-search/location bar, a short stop-status result, and a full-bleed map. Desktop keeps the controls and result in the sidebar. Phones use a viewport-sized workspace with a two-position result sheet: stop, direction, status, uncertainty, and an expand action stay visible without page scrolling. Expanding reveals boarding guidance and scrollable service details; on short screens it uses the map space, and “Show more map” restores it. A permanent label identifies the selected stop, and muted base tiles keep the route and orange detour prominent. The last direction and stop are remembered on this browser. The map follows that stop and any nearby relevant detour; other detours remain available for manual inspection. **Service details** contains the result explanation, alert cards, source timestamps, and recorded-example controls. **Map key & details** contains the geometry comparison and extended map key. Stale-data, replay, and unconfirmed-boarding labels remain visible without opening either section.

## Stack

React 19, strict TypeScript, Vite, Leaflet, and Vitest. A Node.js collector retrieves public SEPTA data in GitHub Actions. GitHub Pages serves the app; a separate `live-data` branch publishes current JSON without rebuilding the website. There is no API key or application server. Dependencies are pinned by `package-lock.json`.

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

`.github/workflows/pages.yml` installs dependencies, checks types, runs tests, retrieves a fallback feed, builds the app, and publishes `dist/` to GitHub Pages. Pushes to `main` and manual runs trigger deployment. Pull requests run checks and build without publishing or retrieving external data. Pages must use **GitHub Actions** as its source.

`.github/workflows/refresh-data.yml` independently collects, validates, and publishes alerts to `live-data/current-alerts.json`. It runs on collector changes, manual dispatch, and every five minutes starting at minute 2. It has its own concurrency group and never waits for a Pages deployment. A source failure is published as incomplete before the workflow reports failure, so failures are visible both to riders and in Actions. The branch is dedicated to generated public data; no application code or credentials are published there.

The deployed build sets `VITE_LIVE_FEED_URL` to the public raw GitHub URL. The browser checks it once per minute while visible and online, and immediately when the tab becomes visible or connectivity returns. Requests are single-flight and timeout-bound. If the primary endpoint fails or is stale, the app also checks the dated Pages copy and uses the newest valid publication available, including the one it already holds. A new incomplete publication supersedes an older successful one; missing sources are never silently hidden by an older fallback. The optional `collectedAt` field orders publications, while freshness still uses the original upstream retrieval timestamps. A minute-bucket query parameter avoids reusing an older raw-GitHub CDN object between polling intervals. Local development uses the same-origin feed unless `VITE_LIVE_FEED_URL` is set.

GitHub scheduled runs can be delayed or dropped; this is **not a guaranteed five-minute data service**. Source data older than 15 minutes cannot confirm current stop impact, even if it was just downloaded. Check the **Refresh SEPTA data** workflow and manually dispatch it if needed. These changes remove deployment delays and improve recovery; a service with a freshness SLA would still need a monitored collector outside GitHub's best-effort scheduler.

`public/data/current-alerts.json` and `dist/` are generated and ignored by Git. Relative asset URLs support the `/route9DetourMap/` Pages path. `.openai/hosting.json` is historical metadata for the original preview and is not used in deployment.

## Project structure

- `src/App.tsx`, `src/components/`, `src/styles.css`: journey selection, status, source details, and map UI.
- `src/hooks/`: independent route loading, resilient polling, and browser-local journey preferences.
- `src/domain/`: pure stop-impact and Philadelphia time rules, with consequential edge-case tests.
- `src/data/`: upstream collection, normalization, runtime validation, recorded snapshot adapter, and fixture tests.
- `public/data/route9-snapshot.json`: recorded baseline and alerts, with original provenance and source warnings.

Keep policy decisions in the domain layer, source-specific interpretation in the data layer, and display logic in components. Add a regression test for changes that could incorrectly declare a stop usable or recommend boarding.

## Data and interpretation

The collector combines SEPTA's [detour feed](https://www3.septa.org/api/v2/detours/?route=9), [legacy service notices](https://www3.septa.org/api/Alerts/get_alert_data.php?route_id=bus_route_9), and directional KML. Legacy notices are collected in Actions because that endpoint does not permit browser cross-origin access. Matching records with materially conflicting text or schedules remain unresolved. The published feed is validated before rendering.

The baseline represents two full-length Route 9 GTFS patterns, valid September 27, 2026 through February 20, 2027. Short trips and other variants are not represented. Replace the baseline with a reviewed GTFS snapshot when service changes; after its validity window the app cannot confirm stop status.

An explicit skipped-stop entry can establish that a stop is affected. A partial list cannot establish that unlisted stops are served. Missing stop lists, conflicting schedules, incomplete feeds, and stale data cannot produce an all-clear result. Unverified paths remain marked, and separate overlapping paths are not merged into a supposedly verified route.

Alert cards expand direction and turn shorthand into ordered instructions while keeping the unchanged source wording in a separate disclosure. The sinkhole notice shown in Transit and SEPTA's original raw message have the same direction, date, and turns; SEPTA's legacy feed already includes expanded Left/Right wording. Text formatting never resolves conflicting dates or changes stop status.

The map automatically chooses a relevant alert for the selected stop. A named stop closure takes priority even when no detour geometry is available. Otherwise a nearby, connected illustration may provide visual context; this does not establish that the stop is closed. The automatic viewport stays near the stop. Use the detour selector to inspect another detour, or **Your stop** to return. Changing stops or direction clears manual inspection.

“Explore route alerts” opens a route-wide notice without changing the selected stop or its assessment. Disputed agency geometry is hidden, including background paths, until “Show agency map—unverified” is selected for that alert. Opt-in resets when the selection, inspection request, or agency geometry/conflict evidence changes, and when the exploration is closed. Reviewed written-direction illustrations remain explicitly unconfirmed. On short phones the pinned sheet identifies the selected stop; redundant map context is reduced to keep controls usable.


Circular dots follow the displayed path; square stop markers represent physical boarding locations. The reviewed sinkhole illustration follows 4th → Spruce → 9th → Walnut and replaces the bypassed normal segment visually. It is reused only when the current notice matches the reviewed text and direction. **Agency geometry** remains available for comparison with the published loop. Geometric bypass detection marks Walnut/5th, Walnut/7th and Walnut/8th as possibly skipped, without changing their closure assessment or inventing relocated stops. Current feeds contain no exact temporary-stop coordinates; intersection coordinates identify turns, not boarding points.

The current legacy notice explicitly closes northbound Schuylkill Av & JFK Blvd (stop 30576). It describes replacement boarding only as an area on Schuylkill between Walnut and Chestnut. The UI quotes that instruction with its source; it does not invent a replacement stop ID, map pin, or walking route. An exact alternative requires separate agency evidence and must pass every applicable alert check.

Recorded-example mode uses the October 7, 2026 snapshot and a Philadelphia-time replay control. It is clearly historical and never supplies live alternative-boarding guidance. Candidate paths in that snapshot are interpretations, not field observations.

## Validation

Automated tests cover alert overlap, partial stop lists, stale/incomplete data, source contradictions, malformed feeds, direction, DST and overnight windows, and restrictions on alternative boarding. For a browser smoke test:

1. Refresh agency data and choose northbound Schuylkill Av & JFK Blvd. While the explicit closure remains current, expect affected plus area-only agency instructions.
2. Choose a different stop or direction. Missing stop coverage must remain unconfirmed.
3. Open the relevant alerts and original sources; all applicable alerts should be available together.
4. Open **Service details → Try a recorded example**, switch modes, and change the Philadelphia time; the historical label and **Back to current** button must remain visible even after closing the details.
5. Inspect the map, select a stop, and try Full route / Your stop. Check phone-width layout.
6. With the current feed missing or older than 15 minutes, expect unable to confirm, not an all-clear.
7. Choose **Show → Sink Hole → View**, and open **Map key & details** to compare Written directions with Agency geometry. Path dots should follow the selected path; potential bypass markers must say unconfirmed, and the original alert must remain unchanged.
8. Change the direction and stop, then reload. The journey should be restored; recorded-example mode and manual detour inspection should not persist.
9. Select Schuylkill/JFK, then Walnut/7th. The map should first stay with the reported stop closure and then show the nearby sinkhole path. Inspect a different detour manually, then select another stop to return to automatic focus.
10. Return to the app after it was hidden or offline. Check that it resumes fetching without overlapping requests and never substitutes browser retrieval time for source age.

The next product test is with five Route 9 riders: compare comprehension and decision time against the original agency alert. Separately verify a sample of detours and boarding locations with the agency or field observation. Usability results alone do not establish boarding accuracy.

No arrivals, bus tracking, accounts, payments, automatic GTFS refresh, or field verification are implemented. Public feed access does not establish commercial reuse rights. Maps include OpenStreetMap attribution; review data and tile-service terms before scaling or monetization. Leaflet's license is included in its npm package.

Stop search accepts partial street names, intersections in either order (for example, `7 Walnut`), and expanded street types. Use arrow keys and Enter to choose, or Escape to cancel. Choosing on a phone dismisses the search keyboard. Nearby results open over the map; Cancel/Clear/Escape return focus to the location button. Escape also collapses the expanded result sheet. Results are limited to the selected direction. Selecting a stop updates one result: in the sidebar on desktop, or in the persistent two-position sheet on phones. The phone sheet keeps the stop name, direction, service assessment, and boarding uncertainty together, and updates immediately when selecting a stop. Resizing moves the result between layouts without duplicating it.

**Near me** requests a browser location only when tapped (standard accuracy first, then one precise retry if needed), then lists up to three stops within one mile for the selected direction. Distances are straight-line estimates, not walking routes. Each result uses the same live stop-impact assessment as the main card. The app does not persist or transmit coordinates, and does not track movement. Clear/cancel ignores pending callbacks and prevents retries; results expire after five minutes. Imprecise fixes (over 1 km), permission denial, unavailable location, and timeouts retain the search fallback. Location is unavailable in recorded-example mode. Requires HTTPS and browser location permission; actual accuracy depends on the device ([browser geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition)).

Stop scope is classified separately from alert timing: a reliable nonempty complete agency stop list can identify an alert as elsewhere on the route; partial lists, unmapped stop IDs, and source conflicts cannot. Selected-stop notices appear first, followed by unknown scope and elsewhere notices. “Detour elsewhere on this route” is shown only when the overall assessment is resolved with no reported impact at the selected stop. Timing conflicts elsewhere remain visible and still prevent confirming current service. Stale/incomplete feeds and map geometry never establish an all-clear.
