# Reroute: efficient, accurate agent workflow

Optimize usage per correctly completed task. Preserve correctness, user intent,
and required validation; economize on repeated exploration, excessive context,
unnecessary reasoning, and duplicate work. These instructions do not override
the user's current request or higher-priority instructions.

## Project essentials

React 19, strict TypeScript, Vite, Leaflet, Vitest, and plain CSS. UI:
`src/App.tsx`, `src/components/`, `src/styles.css`. Polling/preferences:
`src/hooks/`. Pure rules: `src/domain/`. Collection/validation: `src/data/`.
Keep domain rules out of display components. Read relevant README sections
when needed, rather than loading all project documentation on every task.

Missing, partial, stale, or conflicting data must never establish an all-clear.
Map paths never prove boarding locations. Replay must remain visibly historical.
Preserve these constraints even when a simpler implementation would use fewer
tokens. Deployment is GitHub Pages; `.openai/hosting.json` is historical.

## Choose effort before expanding scope

- Default to one agent and the smallest coherent change that satisfies the task.
  Identify the expected behavior, relevant files, and evidence needed to finish.
- Where model selection is supported and authorized, prefer Luna/Low for clear
  lookups or mechanical edits; Sol/Medium for scoped implementation; Astra/Medium
  for ambiguous, cross-cutting work. These are starting points, not guarantees.
- Increase effort for difficult diagnosis or consequential correctness decisions.
  Do not default every task to Ultra. If model switching is unavailable, proceed
  efficiently on the current model; never claim a switch occurred without proof.
- Delegate only when requested or authorized and a bounded independent subtask
  justifies the extra usage. Specify its model/effort, files, question, and short
  deliverable. Avoid full-history copies, overlapping edits, and automatic
  explorer/implementer/reviewer rounds for simple tasks.
- For authorized delegation, explicitly select model and effort rather than
  inheriting Astra/Ultra: code explorer = Luna/Low; frontend implementer =
  Sol/Medium; consequential correctness reviewer = Astra/High. Use supported
  model IDs and dispatch controls; these written defaults do not configure the
  runtime by themselves. Do not silently substitute an expensive fallback.
- Give each delegate a self-contained brief: objective, relevant paths, necessary
  facts, constraints, and completion criteria. Request a result of roughly 200
  words or fewer plus essential evidence; expand only when correctness needs it.

## Retrieve only what resolves the next question

- Search before reading. Use `rg` for paths/text and native tools for CSS,
  config, and small edits. Use Serena for file-scoped symbol overviews,
  definitions, and references; request bodies only when needed.
- Start Serena queries with at most 6,000 answer characters. Narrow oversized
  queries instead of repeatedly requesting truncated output. Do not reread the
  same content through multiple tools without a new reason.
- Exclude dependencies, generated assets, caches, and lockfiles from broad
  exploration. Read a lockfile only for a dependency question.
- Use Context7 for unresolved library/version questions. Check the installed
  version, ask one focused public API question, and reuse verified library IDs.
  Do not send private source or credentials. Prefer primary documentation;
  verify current external facts when the task depends on them.
- Use the `frontend-design` skill for substantive UI work. Preserve the existing
  visual language and rider-first phone layout. Use existing browser tools for
  relevant interaction/visual checks; avoid adding frameworks or MCPs for a
  capability already available.
- If an optional MCP is unavailable, use native tools or official docs. Do not
  repeatedly debug its installation unless it blocks the task or setup is asked for.

## Execute and validate proportionately

- Batch independent reads; sequence dependent operations and edits. Inspect
  failures before retrying. After repeated failure, revise the hypothesis or
  gather new evidence instead of repeating the same attempt.
- Keep logs in files when large. Report exit status and relevant error excerpts;
  expand around failures as needed. Never hide a failure behind truncated output.
- Run test/build commands directly; do not spawn an agent just to run a command.
  Keep successful output to a short status/count summary. On failure, return
  failing test names and relevant diagnostics; retain the full log for inspection
  and preserve the command's exit code when redirecting or filtering output.
- Docs-only changes: inspect the diff and run `git diff --check`.
- Logic changes: run relevant tests, e.g. `npm test -- src/domain/example.test.ts`
  with the actual affected test path. Add regression coverage for stop-status,
  boarding, freshness, and conflicting-data behavior when changed.
- UI changes: check types and inspect the affected flow at phone and desktop
  widths, including applicable loading/error/uncertain states and keyboard use.
- Use `npm run check` for types, `npm test` for the full suite, and `npm run build`
  for integration/build validation. Build already includes type checking; avoid
  a redundant standalone type check on the same code. Run full/required checks
  for broad changes and before delivery when project or CI requirements demand it.
- A successful edit or refactor tool is not validation. After appropriate checks
  pass, repeat them only for a relevant change, failure, or unresolved concern.

## Memory, handoff, and completion

- Search/open relevant Memory MCP nodes only when current context lacks the facts.
  Treat memory as a hint: verify mutable facts against the working tree and tests.
  Never load the entire graph or duplicate it in Serena memories.
- Use Memory MCP as the sole agent-maintained project memory store. Do not add
  overlapping memory systems. Keep required rules and maintained documentation
  in repository files; they remain authoritative, rather than becoming memory copies.
- Save only concise, durable decisions at meaningful milestones. Include source
  paths and dates for time-sensitive facts; replace obsolete observations. Avoid
  transcripts, raw logs, secrets, and routine progress entries.
- Before changing tasks or handing off, provide a compact summary: objective,
  decisions, changed files, exact checks/results, unresolved risks, and next step.
  Do not copy the whole conversation or rewrite a handoff after every small edit.
- Finish when requested behavior is implemented and justified by evidence. Report
  the outcome, validation, and remaining limitations briefly. Distinguish verified
  results from assumptions; never claim tests, deployment, or live-data accuracy
  that were not established. Avoid speculative cleanup outside the task.
