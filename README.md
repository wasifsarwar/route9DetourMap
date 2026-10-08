# Reroute

**Know where to catch your bus when the route changes.**

Reroute helps Philadelphia riders understand SEPTA detours without decoding service notices or guessing from an unchanged route map. We’re starting with **Route 9**, with one goal: make it easy to answer **“Is my stop affected, and what should I do next?”**

[Try Reroute](https://wasifsarwar.github.io/route9DetourMap/)

## What you can do today

- **Find your stop.** Search by street or intersection, use your location, or tap a northbound or southbound stop directly on the map.
- **Understand the disruption.** See reported stop impacts, readable alerts, and detour paths that follow SEPTA’s applicable dates and service hours.
- **See buses approaching.** Track recent bus positions for your direction, follow a bus, and view SEPTA arrival estimates when available.
- **Find the next useful action.** Get agency boarding instructions when supported, with the original notice available for context.

The mobile layout keeps the map usable while service details expand below it. Nearby stops include approximate walking times; these are estimates from straight-line distance, not walking directions.

## Accuracy comes first

Reroute is an independent pilot, not an official SEPTA app. It currently covers two full-length Route 9 patterns, not every trip variant.

Missing, stale, or conflicting data stays **unconfirmed**. A detour line or a bus passing a location does not prove you can board there. Stop markers use SEPTA’s published coordinates, and uncertain replacement boarding points are never invented. Live positions and arrival estimates depend on available SEPTA reports.

## What we’re working toward

1. More precise matching between detours and individual stops.
2. One complete, verified detour with dependable boarding guidance.
3. Testing with Route 9 riders to see whether they can find their stop, understand its status, and decide what to do faster than with the original notice.

We’ll expand coverage after proving accuracy and usefulness on Route 9. AI interpretation is only worth adding if it solves a recurring problem and improves accuracy against reviewed examples.

## Run locally

Use Node.js 24 LTS and npm.

```sh
npm ci
npm run refresh:data
npm run dev
```

Open http://127.0.0.1:5173/. Refreshing data requires network access.

```sh
npm test
npm run build
```

Built with React, TypeScript, Vite, and Leaflet. GitHub Pages hosts the app; a Netlify relay supplies live bus data. GitHub Actions refreshes service alerts.

For testing: [recorded demo](https://wasifsarwar.github.io/route9DetourMap/?demo=1) · [bus-path review tool](https://wasifsarwar.github.io/route9DetourMap/?review=1). Historical examples and observed bus paths do not establish current boarding guidance.
