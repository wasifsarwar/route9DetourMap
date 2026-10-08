# Reroute — a testable Route 9 pilot

A small browser prototype answering the first technical question: can a rider understand a detour better when the route, direction, date window, and source uncertainty appear together?

## Run locally

Requires Python 3 and Node.js (no package installation).

```sh
npm start
# Open http://127.0.0.1:4173/
npm test
npm run check
```

## What to test

1. **Sink Hole / Northbound**: choose During, then Before and After. The orange path should disappear outside the published date window.
2. **Wrong direction**: switch Southbound. The selected northbound detour must not apply.
3. **Two paths**: compare Text interpretation and Agency-published path. The latter contains a suspicious loop; the former follows the written street sequence and is explicitly unverified.
4. **PECO**: conflicting text and structured end dates produce an uncertainty state. Changing the clock must not silently resolve that conflict.
5. **Bridge Construction**: five official skipped-stop IDs can be inspected, but their timing remains unconfirmed because weekday text disagrees with the structured schedule.
6. **Missing stop data**: Sink Hole must say unknown, not zero or all stops served.

This is a snapshot captured October 7, 2026 around 10:26 PM Eastern. It never fetches current transit conditions. Only the selected alert is replayed; overlapping detours are not combined. No arrivals, actual bus positions, temporary boarding points, accounts, or payments are implemented. Do not use it for live travel advice.

## Data and provenance

`dist/data/route9-data.json` bundles SEPTA Route 9 GTFS shapes and ordered stops, legacy alert messages, v2 detour records, and v2 KML. Exact source URLs, capture times, raw text, warnings, selected trip IDs, feed version, and candidate-path provenance are in the fixture. It uses `[latitude, longitude]`, not GeoJSON ordering.

Two full-length weekday patterns are represented. Other short-trip variants are documented in `metadata.variantSummary` but are not rendered. No downloaded ZIP or credentials are published.

The sinkhole candidate connects vertices 0 and 11 of the northbound baseline through the published 4th/Spruce and 9th/Spruce intersections. It is an interpretation, not field validation. No skipped stops are inferred from it. Original KML remains available for comparison.

`conflicts` preserves all source problems. `timingConflicts` excludes geometry-only warnings so a route geometry problem cannot be mislabeled a date problem. All-day 00:00–23:59:59 source windows are normalized to the half-open minute interval 00:00–24:00. Recurring conflicts remain unresolved.

Public access does not establish unrestricted commercial reuse. Clarify SEPTA feed terms before monetization. Map tiles use OpenStreetMap with visible attribution; production use needs a suitable tile-service plan/policy review. Leaflet 1.9.4 and its license are bundled under `dist/vendor`. Fonts are optional Google Fonts with local fallbacks.

## Next validation step

Test with five Route 9 riders first. Show the original alert, ask them to explain the route change, then repeat using this prototype. Record completion time, mistaken direction/time assumptions, whether they recognize uncertain boarding information, and which view they prefer. Do not claim boarding accuracy from usability results.

Before live use: confirm a sample of detours and temporary stops with agency information or field observation; implement a server-side refresh/cache with source-age indicators; handle all relevant overlapping alerts and trip variants; add a review process for contradictions. Then test a small live route cohort before expanding or charging.

## Implementation

Static HTML/CSS/JavaScript + Leaflet. `dist/logic.js` contains the deterministic time/direction/uncertainty logic; `tests/logic.test.mjs` covers the consequential edge cases. `dist/app.js` renders the map and controls. Optional WebMCP exposes the same replay controls when supported by the browser.
