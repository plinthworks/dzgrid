# Benchmark — DzGrid compared with two open-source grids

Phase 11, lot L8 (owner Q4 B). Numbers anyone can rerun, honest about where DzGrid is slower. Run 2026-11-09.
Raw numbers: [`results.json`](results.json). Licences checked first: [`licences.md`](licences.md).

## Results (median of 3, milliseconds to the next frame after the expected rows are in the page)

| Scenario | Set | DzGrid 1.7.0 | AG Grid Community 36.3.0 | Tabulator 6.7.1 |
|---|---|---:|---:|---:|
| First render | A 100 000 × 20 | 35 | 70 | 69 |
| | B 1 000 000 × 10 | 258 | 415 | 175 |
| Jump to the last row | A | 29 | 8 | 15 |
| | B | 24 | 9 | 14 |
| Sort a number column | A | 33 | 99 | 124 |
| | B | 242 | 1 049 | 1 294 |
| Text filter « contains » (on the sorted rows) | A | 22 | 47 | 47 |
| | B | 109 | 353 | 271 |
| Update 1 000 rows | A | 24 | 43 | 625 |
| | B | 28 | 341 | 3 535 |
| JS heap after load (MB, the rows excluded) | A | 3.1 | 24.0 | 17.2 |
| | B | 24.4 | 210.9 | 162.3 |
| Bundle, gzip (JS + CSS, bytes) | — | 51 132 + 2 931 | 329 833 + 0 | 106 080 + 3 867 |

Where DzGrid is slower: **jumping to a row** (it draws on the next animation frame, ≈ one frame more than the
others) and **first render of a million rows** (Tabulator is faster there). The three runs of each scenario were within about
10 % of each other, except the jump (one frame of difference either way).

## Method

- **Folder.** `~/Dev/dzgrid-bench/` on the owner's machine, outside this repository, its own `package.json` and git
  (not pushed). It holds one page per grid, one harness-only page, the shared data and timing code
  (`pages/common.js`) and the runner (`harness/run.mjs`). The other grids live only there.
- **Pages.** Each grid's page uses only the calls its public documentation shows (getting started, sorting, filter
  API, updates). DzGrid is installed from npm (1.7.0) like any application and used as its README shows. Each page is
  a Vite 6.4.4 production build (minified), one grid per build.
- **Data.** Made up and seeded (the same rows for every grid): an id, two text columns (syllables; five category
  words), a number column that is a shuffle of 0…n−1, the rest random integers. Set A 100 000 rows × 20 columns, set B
  1 000 000 × 10. Generated in the page before the clock starts.
- **Browser.** Chrome 157 (`channel: 'chrome'`, headless) through `playwright-core` 1.64.1, window 1 280 × 720, no CPU
  throttling. One browser per grid, closed in a `finally`; a fresh context per run; 3 runs per set; median kept.
- **Scenarios**, in this order in one page: first render → jump to the last row → back to the first (not reported) →
  sort the shuffled number column ascending → text filter « contains `zor` » on the first text column → update 1 000
  rows (the visible top row plus 999 spread over the set; a text column set to a marker).
- **When a step is done.** The page knows, from the data alone, which text must appear: the first row's id, the last
  row's id, the id of the row holding 0, the top row of the filtered sorted view, the marker. A `MutationObserver`
  (with a frame-by-frame check as backup) records when that text is in the grid's host (`dom` in `results.json`);
  the reported time is the next animation frame after it (`frame`) — what a user waits for. Each grid's own
  « done » event or promise is not used, so every grid is judged the same way.
- **Memory.** `HeapProfiler.collectGarbage` then the JS heap used, before the grid is created (the rows already built)
  and after first render; the difference is the grid's own cost.
- **Bundle.** gzip −9 of each page's JS and CSS, minus the harness-only page.
- **Machine.** Apple M4 Max, 64 GB, macOS 26.2, Node 24.22.1. Not idle: the owner's usual applications ran;
  the 1-minute load average was 2.9–3.3 when each grid started (16 cores). Runs on one day only.

## Fairness notes and limits

- **Defaults differ.** Each grid ran at its documented defaults plus what its getting-started page asks for: AG Grid
  with `AllCommunityModule` registered, its built-in theme, `getRowId` and `filter: true` on every column (its filter
  page's examples do this); Tabulator as `TabulatorFull` with a height (its virtual DOM needs one) and its CSS; DzGrid
  with its theme and the host `display: flex; flex-direction: column` its guide shows. AG Grid and Tabulator load
  every feature (sorting, filtering, editing, menus…); DzGrid's page loads only its core and DOM entry — no filter UI
  (the filter is set through the API). That is DzGrid's design (each feature its own entry) but it favours DzGrid on
  bundle size and maybe on first render.
- **Rows.** DzGrid reads the application's rows in place; AG Grid and Tabulator wrap each row in an object of their
  own — that is most of their heap. A grid that copies rows pays at load and gains elsewhere; the table shows both.
- **Jump, not scroll.** « Jump to the last row » uses each grid's « make this row visible » call. Frame rates while
  scrolling were not measured (a later run: CDP frame timings while the wheel moves).
- **Not measured here** (the plan's longer list): 4× CPU throttling, cold versus warm, group opening, create/destroy
  leaks, a second day, a second person's run, Firefox and WebKit. The plan's check « two runs on two days within
  10 % » is still to do.
- **Headless Chrome** paints without a screen; `frame` is the next animation frame, not a measured paint.
- **One machine, one browser.** A fast Apple chip hides differences that a slower machine shows.
- **Found on the way (DzGrid).** With a host that has a height but not the documented flex layout, DzGrid 1.7.0 drew
  **every** row (20 001 row elements for 20 000 rows): no virtual scrolling and no `Problem` saying so; a sort of 100 000
  rows then took 37 s to the next frame. The numbers above use the documented host. Fixed in 1.8.0 (Phase 11 L9): such
  a view is held to the window's height and told once (`unbounded-viewport`); 100 000 rows draw 24 rows and sort in
  32 ms in Chrome.

## For other maintainers — how to correct our setup

If a page misuses your grid, the fix is a few lines in `pages/<grid>.js` of the bench folder. The rule we follow: only
what your public documentation shows for a default setup with virtual scrolling. Tell us which documented option we
missed and we rerun all grids the same day.
