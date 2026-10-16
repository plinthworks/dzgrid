# DzGrid — context for Claude Code

A data grid written from scratch in TypeScript: a pure core, a DOM layer, a
theme, then an Angular wrapper. ag-Grid is the reference for **behaviour
only** — read `CLEANROOM.md` before anything else: not one line of ag-Grid's
code, Community or Enterprise, is read or copied. Sister projects: tzslot
(`/Users/nadou/Dev/tzslot`) and DzCalendar (`/Users/nadou/Dev/dzcalendar`),
whose conventions we follow. ngx-sheetgrid (`/Users/nadou/Dev/ngx-sheetgrid`)
is ours too: its *pure* modules may be reused, never the parts that talk to ag-Grid.

## Where things are

- `ARCHITECTURE.md` — the full plan (packages, modules, signatures, phases).
  The owner's validated decisions sit at its top and win over the rest.
- `ROADMAP.md` — what is done, what is next, spike results. Keep it current.
- `packages/core` — `@dzgrid/core`: no DOM, no `Date`, no Temporal, no
  dependency, no clock, no randomness. `test/purity.test.ts` enforces it, and
  tests itself against planted violations. The core builds with lib ES2023 only.
- Calendar days (`Day`, `YYYY-MM-DD`) and instants (`InstantMs`) are distinct
  types and never converted into each other without a zone. An offset-less
  date-time string is `ambiguous-instant`, never guessed.
- Rows are identified by `RowKey` (from `getRowId`, required); positions are
  `DisplayIndex`, valid for one version of the displayed rows only.
- `conformance/` — language-independent JSON cases, expectations written by
  hand, run by vitest in `node`.
- `spikes/` — Phase 0 questions, each with a decision rule; results in `ROADMAP.md`.
- `docs/behaviors/` — one sheet per imitated behaviour, in our own words,
  written **before** the code (clean room).

## Commands

```bash
npm test               # vitest; core and conformance in node
npm run test:ci        # one worker — catches state shared between files
npm run test:tz        # the suite in Auckland and Los Angeles
npm run typecheck      # core (lib ES2023, no DOM) then the tests
npm run build          # packages/*/dist, refuses a manifest pointing at src/ or with runtime deps
npm run spike          # Phase 0 spikes in real browsers, one after another
npm start              # playground on http://localhost:4700 (tzslot 4500, DzCalendar 4600) — don't kill it
```

`npm install` needs `legacy-peer-deps` (set in `.npmrc`): npm 10 crashes on
vitest's optional peers otherwise.

## Working rules

- **Validate structural decisions with the owner before coding.** Talk to the
  owner in French, short and plain.
- Every phase ends with the architect agent checking it against
  `ARCHITECTURE.md` and a code review; findings are fixed before the phase is
  called done. Every change: a test that fails first, then the fix.
- Bad input never throws: it becomes a `Problem` (code + path + raw detail;
  sentences belong to the DOM layer's translated messages). A `Problem` never
  carries row data — rows may be health records.
- Logical sides only (`start`/`end`, `inline-*`), never `left`/`right` outside
  the one direction module. Right-to-left is designed in, not added.
- Colours only as CSS variables (`--tz-*` shared palette, `--dzg-*` own); no
  hex in components; contrast 4.5:1 checked by script.
- Verify before saying done; measure sizes and timings rather than assert them,
  on minified code, on a quiet machine. jsdom checks behaviour, never layout:
  look at it in real Chrome (`playwright-core`, `channel: 'chrome'`), and in
  Firefox and WebKit where the spike says so.
- Test expectations are written by hand, never copied from the output.
