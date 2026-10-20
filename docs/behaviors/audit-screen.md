# The audit screen (example 3, step 18)

An invented screen, ours, that puts every Phase 3 feature on one grid fed by a
server: the journal of who did what, when, to which record. It is what the
step-18 checks run on (permutations, axe, screenshots) and what the K.8 size
profile measures. The owner's own audit-logs screen comes at step 24.

## What the user does
- Opens the journal: seven columns, newest event first, 50 rows a page.
- Types a name in the floating filter of "Acteur", a duration in the popup of
  "Durée", ticks a few resources in the value list of "Ressource" and applies,
  sorts by the time of the event, types in the search field above the grid.
- Pages with the footer (first, previous, next; 25, 50 or 100 rows a page),
  ticks "Select all N" in the footer, refreshes, retries after a failure.
- Does all of it quickly, on a slow or failing server, in French or in Arabic,
  right to left, light or dark, and switches the palette while the page is open.

## What they observe
- The grid always ends on what they asked last, whatever order the server
  answers in; an older answer never shows, not even for a frame.
- While a request runs: the rows already shown stay, dimmed, the grid is busy
  for a screen reader; nothing moves under the pointer.
- A failure shows the error with "Réessayer"; Retry asks the same thing again.
- Typing in the search field is never undone by an answer arriving; the focus
  stays on the control they used.
- One sentence per result: "Filtré. 312 lignes", "Page 2. 51 à 100"; nothing
  said with a count that no longer holds; no count said when the server does
  not know it.
- The two configurations of the same screen (below) show the same rows for the
  same gestures.

## What DzGrid does (the screen)
- **Columns:** `occurredAt` (an instant, Algiers time; its popup's *between*
  loads the date kit lazily), `day` (the Algiers day of the event), `actor`
  (free text, 97 names, every seventh in Arabic), `action` (an enum of 12
  values, French or Arabic labels, no value-list button: owner Q2 of step 15),
  `resource` (`filter: { kind: 'set' }`, about 2 000 values asked from the
  server's `values`), `outcome` (yes/no), `durationMs` (a number).
- **Features:** `filters({ floating: true, popup: true })`, `quickSearch()`
  bound to a labelled field `#q` above the grid, `pagination()` with sizes 25,
  50 and 100, selection with boxes and "Select all N"; the base, filter and
  pagination texts of the language. No export, no spans.
- **One `DataSource`, two settings** (`docs/phase-3-plugins.md` B2, example 3):
  - **A, fetched** (`?config=fetched`): `operations: { filter: 'server', quick:
    'server', sort: 'server', page: 'client' }`. The server filters, searches and
    sorts; the browser pages the set it got (fewer rows than `maxRows`). A page
    change asks nothing.
  - **B, server** (`?config=server`): `operations: 'server'`, pages by offset,
    `hasNext`, no total (one seed in five, and `?total=1`, with a total). Only
    `occurredAt` sorts (by arithmetic on the index); the other columns say
    `sortable: false`, as a server that cannot sort them would.
- **The fake server** (`perf/fake-server.ts`) computes row *i* from *i*: the
  time falls with *i* (so the newest first is the index order), actor
  `i mod 97`, action `(i·7) mod 12`. It never holds the rows. 10⁷ rows in the
  playground and the browser, 2 000 in jsdom (A and B on the same universe; A
  gets 20 000 in the browser, under `maxRows`). A filtered query looks at the
  newest `scanCap` events only (200 000 by default), as a real journal limits a
  search. It honours `req.signal` (rejects with `signal.reason`). Two modes:
  `timers` (latency, jitter and a failure rate from the URL) and `hold` (each
  request waits until a test releases or fails it). It logs every request:
  number, channel, key, abort reason, how and when it settled.

## Checks (step 18)
- **Permutations** (`perf/permutation.ts`): a seed makes a script of 8 to 14
  gestures (pager, size, sort, the floating text filter typed through its pause,
  the number popup, the value list opened, ticked and applied or dropped, the
  search typed character by character with and without pauses, clear all,
  refresh, Retry, select all), the same for A and B, and an order of answers
  (first in first out, last first, random, bursts) with about 8 % failures. The
  oracle reads the gestures, never the grid: the rows a query should show,
  computed over the universe on its own.
- **Invariants**, after every answer and when everything has settled:
  I1 no stale rows (a stale answer changes nothing, the current one shows its
  rows; at rest, the oracle's page); I2 superseded requests aborted, the gate's
  counts agree with the server's log, nothing applied after destroy; I3
  `aria-busy` exactly while the current request runs, stale styling while old
  rows are kept, count sentences only for the answer applied, none when the
  count is unknown; I4 the footer's count, pager and "Select all N" agree with
  the page; I5 the search field never rewritten by an answer, the focus kept on
  the control used; I6 one request per typing pause, the search sent trimmed, a
  page change in A asks nothing, at most a page of rows held in B; I7 A and B
  show the same rows at rest.
- **Tier 1** (jsdom, fake timers, hold server): `packages/dom/test/audit-permutations.test.ts`,
  1 000 seeds per configuration (`PERMS`), `PERM_SEED=n` replays one.
- **Tier 2** (Chrome, `npm run test:audit`): the same scripts driven by real DOM
  events in the page, 100 + 10 by default, `--full` 1 000 per configuration
  plus 30 typed with the keyboard on real timers; axe on every state; the value
  list's size stable from loading to loaded; `aria-busy` and stale styling
  within 100 ms of "next"; the palette switched live; reference screenshots
  (`--update-shots` writes `docs/screenshots/step18/`).

## Where we differ on purpose
- A pointer down outside the filter popup closes it (owner decision Q4 of step
  18, revising step 13's O7): the typed filter is kept in the browser, an
  unapplied draft is dropped on a server, the focus goes where the user clicked.
- Count sentences wait for the answer and never carry a count the server did
  not give.

## Tests
- `packages/dom/test/fake-server.test.ts` (the server's rows, filters, values, modes, log).
- `packages/dom/test/audit-permutations.test.ts` (tier 1), `scripts/audit-browser.mjs` (tier 2, axe, screenshots).
- `perf/test/audit-profile.test.ts` (the K.8 profile names every library import of the screen).

## Results (step 18, 2026-10-20)
- Tier 1: 1 000 seeds per configuration pass (I1–I7), about 107 s on one worker: `npm run test:perm`.
- Tier 2, `npm run test:audit -- --full`: 1 000 seeds on A and on B with real DOM events, 30 + 30 typed on the keyboard with real timers; axe 0 on 54 states; the value list stable (≤ 1 px); `aria-busy` and stale styling 15-16 ms after "next"; the palette switched live; 12 reference screenshots in `docs/screenshots/step18/`.
- Found and fixed (tests first): the sort sentence on a server (`sort.md`), one sentence for a clear-all (`quick-search-box.md`), the fetched set's page after a query changed and back (`server-pagination.md`, to confirm with the owner), the value list's status line (`filter-set.md`).
- By ear: `docs/a11y-protocol.md` §14 (to do, the owner).
