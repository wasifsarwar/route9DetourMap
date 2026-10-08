# Reroute prototype

React 19, strict TypeScript, Vite, Leaflet, Vitest, and plain CSS. UI lives in
`src/App.tsx`, `src/components/`, and `src/styles.css`; hooks in `src/hooks/`;
pure rules in `src/domain/`; collection/validation in `src/data/`.

Keep missing, partial, stale, and conflicting data visibly uncertain. Map paths
never establish boarding locations. Replay stays visibly historical. Preserve
the rider-first phone layout and existing visual language; use the
`frontend-design` skill for substantive UI work. Use the existing browser tools
for focused mobile/desktop checks. Avoid adding a UI framework for styling alone.

## Efficient tool use

- Search before reading. Use Serena file-scoped symbol overviews, definitions,
  and references for code exploration; request bodies only when needed. Start
  with 6,000 or fewer answer characters and narrow oversized queries.
- Use native text tools for CSS, config, and small edits. Do not read a whole
  file and then repeat the same read through Serena.
- Memory MCP holds durable project decisions. Search/open relevant nodes only
  when the current context lacks the facts; verify mutable facts against code.
  Save concise new decisions at milestones. Replace obsolete observations;
  avoid transcripts, logs, secrets, or duplicating facts in Serena memory.
- Use Context7 only for unresolved library/version questions. Ask one focused
  public API question; do not send project source or private data.
- Keep output concise and use subagents only when the benefit justifies their
  usage. Do not repeat successful checks without a relevant change or concern.

Commands: `npm run dev`, `npm run check`, `npm test`, `npm run build`.
Run checks appropriate to the change. Stop-status/boarding changes need regression
coverage; tool success alone does not replace required validation.
Deployment is GitHub Pages; `.openai/hosting.json` is historical metadata.
