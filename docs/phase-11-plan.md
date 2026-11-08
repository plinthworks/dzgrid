# Phase 11 plan: hardening and ecosystem (architect, 2026-11-08)

Status: **draft, owner's answers awaited** (§5, French). Once answered, `docs/phase-11-steps/questions.md` (French) and
`decisions.md` (the lead's decisions and measures) win over this plan, as in Phases 7–10. Read at `064ed69` (server
pivot committed, **1.8.0 unreleased**; 1.7.0 is the last published). Read only: no build, no browser, no measure was run
for this plan — **every byte, millisecond and session figure below is an estimate**.

ARCHITECTURE §6, Phase 11 « durcissement et écosystème » — deliverables: performance passes (4× slower profile),
accessibility (ACR WCAG 2.2 AA draft, the full screen-reader protocol), print, documentation, `llms.txt`, one more
wrapper (React, Vue or Web Component), a public benchmark, `CHANGELOG`. Depends on every phase. **The docs website is
out of this plan** (owner, 2026-10-26: it comes after Phase 11).

## 1. Facts that shape the plan

1. **K.8 has no room.** Audit profile 89 978 / 90 000 (22 B). Any edit to `kernel.ts` moves it ±1 B (the chunk's content
   hash in the split build's file names, phase-9 decisions). Every base byte (core or DOM) and every Angular byte lands
   in K.8. Two known leftovers need base bytes (the key cache, the frame cancel; §3 L1). The owner's rule today: new
   entry = measure + 10 %, existing line +2 % at most, **K.8 never grows**; the owner also said (step 16) « pourquoi tu
   te casses la tête sur la taille ».
2. **No human has listened yet.** `docs/a11y-protocol.md` has 29 sections and ≈ 200 numbered steps (§2–§29); the S4
   spike checked structure only (axe, the macOS AX tree); ROADMAP marks §7–§29 as « the owner's, non-blocking ». No
   file exists in `spikes/s4-a11y/results/manual-*.md`. The protocol's couples: A NVDA + Firefox (Windows 11), B JAWS +
   Chrome (Windows 11), C VoiceOver + Safari (macOS), D TalkBack + Chrome (Android); each section in French then
   Arabic, ≈ 15–20 min per couple per language per section. The full protocol is several days of listening.
3. **The 4× profile is planned, not built.** ARCHITECTURE §5.4: CDP `Emulation.setCPUThrottlingRate` 4, thresholds ×3,
   no frame over 100 ms. `scripts/perf-browser.mjs` has no throttle today; `perf/browser-budgets.json` holds the 1×
   lines (median of three + 35 %). Lines reported « not measured » since Phase 3 (ARCHITECTURE « Non mesuré,
   reporté »): response to painted rows, typing in the floating filter, scrolling a 20 000-value list, `<dz-grid>` with 3
   templated columns while dragging the scrollbar (and ×4), paged-model memory, `csv one chunk`, `paged settle`.
4. **Print exists** (`@dzgrid/dom/print`, 1 642 / 1 664): `preparePrint` / `print`, 5 000 rows, pinned rows, tree,
   spans, groups, pivot bands. Left out: the `matchMedia('print')` fallback (line held at 1 600 then). The browser's own
   Ctrl+P (no `print()` call) prints whatever the virtual window shows.
5. **Docs in the repo**: `README.md` (195 lines), one README per package, `docs/behaviors/*` (the sheets),
   `docs/theme-in-3-lines.md`, `docs/recipes/time-slots.md`, `docs/llm/fiche-dzgrid.md` (386 lines, a code-generation
   reference sheet — the seed of `llms-full.txt`), `api/*.api.txt` (the public surface, checked by `check:api`).
   ARCHITECTURE §5.2 is stale (still says K.8 ≤ 85 kB). No `docs:api` script exists although §8 lists one.
6. **Sister wrappers** (own code, reusable conventions): tzslot has `react`; DzCalendar has `react`, `vue` and `element`
   (`<dz-calendar>`, options as attributes and properties, callbacks as DOM events), plus `site/llms.txt` and
   `llms-full.txt`, and `bench-public/` (DzCalendar against FullCalendar 6 and 7). ARCHITECTURE §7.2 had React / Vue /
   Web Components « later ».
7. **Clean room and a public benchmark**: CLEANROOM.md forbids reading any grid's code or minified bundle; ARCHITECTURE
   §7.1 adds « ni code ni CSS de bibliothèque tierce dans le dépôt, y compris dans `node_modules` du playground ». A
   comparison against other grids can only run their **published packages as black boxes, outside this repo**, timed
   from the outside, never opened.
8. **Still open features** (STATUS « Reste ») that are **not** Phase 11 deliverables: the typed advanced filter with
   suggestions (Q-F4 « later ») and the dock's floating window (V3). Q1 asks where they go.

## 2. Known leftovers (read from `docs/phase-*-steps/decisions.md`; each « Left, noted »)

| # | Leftover | Where | Bytes |
|---|---|---|---|
| R1 | `planPaste` called by a host on a block list walks the rows not loaded to the end (the DOM already refuses via `boxHeld`) | `core/range` 3 260 / 3 264 | +20–40 (line +2 % → 3 329) |
| R2 | `*` (open the siblings) in `dom/grouping` walks every row of the open groups, loading leaves included | `dom/grouping` 4 973 | +10–30 |
| R3 | The batch's frame cannot be cancelled (`ModelEnv.frame` returns nothing): a timer win lets the frame flush an early batch | core base (server models) | +10–20, **K.8** |
| R4 | The base key cache is keyed by the column object; `setDefs` makes new objects, so keys are read again (pivot: 48 created columns) | core base | +30–60, **K.8** |
| R5 | Dock: `destroy` does not close an open « Place » menu; a throwing panel cleanup stops the next ones; a `dock` state restored before the dock exists reports in an event, not `setState`'s return; `state()` before the first paint may omit panels | `dom/dock` | +20–50 |
| R6 | `aria-setsize` −1 tested in the core only; DOM permutations (`perf/permutation.ts`) have no scroll gestures | tests | 0 |
| R7 | A refresh answering `hasNext` without a total after a total keeps the older length; a level whose end was found does not grow again on a later full block without a total | `core/infinite`, `core/server-side` | doc or +10–30 |
| R8 | A text grouping value patched into a collation-equal one (« Alger » → « alger ») is not a sort move | `core/grouping` | doc (keep) |
| R9 | Angular `(rowMove)` / `ctl.rowDrag()` left out (+43 B in K.8) | `@dzgrid/angular` | **K.8**, owner |
| R10 | `missing-feature` for a `status` part without `statusBar()` left out (base +2 B) | DOM base | **K.8** |
| R11 | Doc debts: ARCHITECTURE §5.2 table stale; §8 `docs:api` never built; `test-casts-baseline.json` to lower where cheap | docs, tests | 0 |

## 3. Lots (each: sheet or note first where behaviour changes, a test that fails first, then the fix; the tests
concerned while working; `gate:step` once per lot; Chrome only where the screen changes; review only for new code)

**L1 — Leftovers and small debts.** *Goal: close R1–R11 that cost no K.8 byte, and document the ones kept.*
- Contains: R1 (`planPaste` bounded by `boxHeld`, or refused with `rows-not-loaded`), R2 (`*` opens loaded siblings
  only, never walks loading leaves), R5 (dock destroy and cleanup order, the restore's problems in `setState`'s
  return), R6 (DOM `aria-setsize` test, scroll gestures in the DOM permutations), R7 / R8 (sheet lines: kept on
  purpose, or fixed if a test shows a user-visible wrong count), R11. R3, R4, R9, R10 wait for L2.
- Owner: nothing (R9 is Q2's).
- Effort: 1.5 sessions. Order: first. Depends on: nothing.
- Checked by: one failing test per item, mutants on R1 / R2 by hand, `gate:step`.
- Size: `core/range` +2 % (3 329), `dom/grouping`, `dom/dock` within +2 %; bases and K.8 untouched.

**L2 — Room under K.8 (golf).** *Goal: free room in the audit profile so R3, R4 and Phase 11's base fixes can land.*
- Contains: measure each chunk of the split build (`scripts/size-split.mjs`) and list the base's heaviest parts; then,
  without any behaviour change: repeated strings and messages, shared helpers between core and DOM, code that only runs
  for an opt-in feature moved behind its entry (or a lazy chunk), minifier settings checked on the real build (never on
  unminified code). Then R3, R4, R10 on top, and R9 if Q2 says so. Target (Q2 A): free ≥ 1 000 B (K.8 ≤ 89 000) in
  one bounded session; what is gained is kept as room, never re-spent silently.
- Owner: Q2 (golf or raise the line).
- Effort: 1–1.5 sessions (golf bounded), +0.5 for R3 / R4 / R10. Order: second. Depends on: L1.
- Checked by: `check:size` (every line, not only K.8), `check:api` unchanged, the full suite, `example:bytes`,
  `test:real-app` screenshots unchanged (a golf must not move a pixel).
- Size: K.8 down by the golf, then up by R3 / R4 / R10 (≈ +50–90 B); bases may go down.

**L3 — Performance under a 4× slower CPU.** *Goal: numbers for a low-end PC, and the worst three hot spots fixed.*
- Contains: (a) tooling — `bench:browser -- --cpu 4` (CDP `Emulation.setCPUThrottlingRate`), a separate
  `perf/browser-budgets-4x.json` set by the §5.4 rule (1× targets ×3, no frame over 100 ms), the same pages and data
  set A / B / C; (b) the lines « not measured » since Phase 3 (fact 3) at 1× and 4×, plus the later features at 4×:
  grouping 2 columns + 3 aggregations, opening a 10 000-row group, the pivot (100 000 rows, two pivot keys), the
  infinite and server-side scroll, print of 5 000 rows, the set list of 20 000 values, `<dz-grid>` with templated
  cells; (c) a profile of the three worst lines and their fixes, each with a Node or browser line that fails first.
- Owner: one quiet-machine window per run (his Mac heats: one engine, one run at a time, the agent never loops);
  Q6 if the targets are missed by far.
- Effort: 0.5 tooling + 1 measuring + 1–2 fixing = 2.5–3.5 sessions. Order: third. Depends on: L2 (fixes may need
  base bytes).
- Checked by: the new budget file in `bench:browser`, `bench` (Node) unchanged or better, a table in `decisions.md`
  (median of three, machine, Chrome version, 1× and 4×), never asserted without a run.
- Size: tooling 0 (scripts and pages); fixes aim at 0 B, any base byte from L2's room.

**L4 — Accessibility: automated checks, the ACR draft, the listening scheduled.** *Goal: an honest WCAG 2.2 AA
conformance report and the owner's sessions booked with a protocol he can finish.*
- L4a, automated (no owner): axe on every playground and demo page in Chrome, Firefox, WebKit, French and Arabic, light
  and dark (most exist; list the gaps); forced colours (`forced-colors: active`) screenshots; 400 % zoom / 320 px reflow
  (1.4.10 — a data table may scroll in two directions, said in the ACR); text spacing (1.4.12, the four values injected,
  no clipped text); target size (2.5.8, every control measured ≥ 24 × 24 or spaced); focus not obscured (2.4.11, pinned
  rows, dock, sticky parents); reduced motion; status messages (4.1.3) in each live region. A failing check is fixed
  before the ACR is written.
- L4b, the ACR draft `docs/a11y/acr-wcag22-aa.md`: the VPAT 2.5 « WCAG edition » layout in our own words — every
  WCAG 2.2 A and AA criterion, « Supports / Partially supports / Does not support / Not applicable », a remark per
  line naming the sheet or test; the evaluation methods (automated list, browsers, versions); **every line resting on
  a screen reader says « not yet verified by listening »** until L4c's results arrive. French and English (Q8 decides
  only `llms.txt`; the ACR is for buyers: English first, French beside).
- L4c, listening: a condensed **§30 « parcours essentiel »** (≈ 30 steps taken from §2–§29: entering the grid, moving,
  the 10 001-row end, sort, filter popup, set list, edit and refusal, block and paste, tree, group, detail, pinned rows,
  menu ⋮, dock, pivot headers, the live region), ≈ 45 min per couple per language; the full protocol stays the
  reference for a later pass (Q5). Results in `spikes/s4-a11y/results/manual-<reader>-<lang>.md`; then one lot of
  fixes (each a failing test where testable, the protocol line otherwise).
- Owner: VoiceOver + Safari on his Mac (fr, ar: ≈ 1 h 30); NVDA + Firefox on Windows (Q6; fr, ar: ≈ 1 h 30); JAWS and
  TalkBack optional (JAWS runs 40 min without a licence). The Arabic listening needs an Arabic reader (him or the
  Arabic reviewer of `docs/sehhaty-track.md`).
- Effort: L4a 1 session, L4b 1 session, L4c protocol 0.5 + fixes 1–2 sessions after the owner's results. Order:
  fourth (after L3, so perf fixes do not change what was listened); L4c's fixes may come after L5–L8.
- Checked by: the automated script's report (0 violations listed per page), the ACR reviewed by the architect against
  the sheets, the listening results files.
- Size: fixes only; each by the +2 % rule; K.8 from L2's room.

**L5 — Print polish.** *Goal: what a user gets on paper is right in three engines, also from the browser's own menu.*
- Contains: the browser's own Ctrl+P / menu (no `print()` called) — a `beforeprint` path (or a print-only note
  « use Print » when the build cannot finish in time; the sheet, written first, picks the smaller of the two);
  `break-inside: avoid` on rows, `thead` repeated in WebKit, column widths that fit the page, long text wrapped, a dark
  theme printed light, Arabic page order; grouped, pivot and server-held prints checked as PDF text
  (`scripts/pdf-text.py`) in Chrome, Firefox, WebKit; 5 000 rows timed at 4× (from L3).
- Owner: one look at three PDFs (fr, ar, pivot).
- Effort: 1 session. Order: fifth. Depends on: L3 (the 4× timing).
- Checked by: `browser-print.mjs` extended, PDF text compared to hand-written expectations.
- Size: `dom/print` 1 664 → 1 697 at most (+2 %), `print.css` +2 %.

**L6 — Documentation in the repo and `llms.txt`.** *Goal: someone (or a model) can use every entry without reading
our code.*
- Contains: `README.md` rewritten as a map (install, three-line start, the entry table: name, what it does, size,
  sheet), each package README checked against `api/*.api.txt`; a short guide per feature family under `docs/guides/`
  (reading, server, filters, editing, columns, grouping / pivot, export / print, theming, Angular, the new wrapper),
  examples taken from tested demo code; ARCHITECTURE §5.2 and §8 brought up to date (R11); `llms.txt` (an index:
  what DzGrid is, the packages, links to the guides and the sheet) and `llms-full.txt` (from
  `docs/llm/fiche-dzgrid.md`, brought to 1.8.0); **a test** that every name in `llms-full.txt` and in the guides'
  code blocks exists in `api/*.api.txt` (no invented option can creep in); `CHANGELOG` checked from 1.0.0.
- Owner: Q8 (where `llms.txt` lives); a read of the README.
- Effort: 1.5–2 sessions. Order: seventh (after the wrapper, so it is documented once). Depends on: L7.
- Checked by: the names test, links checked by a script, `gate:step`.
- Size: 0 B in the bundles (text files; in the tarball if Q8 A).

**L7 — A second wrapper.** *Goal: DzGrid usable outside Angular with the same features.* Comparison:

| | Web Component (`@dzgrid/element`) | React (`@dzgrid/react`) | Vue (`@dzgrid/vue`) |
|---|---|---|---|
| Who it serves | plain HTML, CMS, and every framework (React 19 passes properties to custom elements, Vue and Svelte do) | React apps, the largest audience | Vue apps |
| Cells in framework components | no — `definePart` functions only (as the DOM layer) | yes, through portals and a view pool (S6's lesson) | yes, through `h()` and a pool |
| Precedent in our projects | DzCalendar `element` | tzslot `react`, DzCalendar `react` | DzCalendar `vue` |
| Traps | attributes vs properties, events named `dzg-*`, SSR none | StrictMode double effects, controlled `state`, portals in a virtual body | reactivity proxies on rows (must pass raw), `v-model` for state |
| Estimate | 1.5–2.5 kB gz, 3 sessions | 2.5–3.5 kB, 4–5 sessions | 2–3 kB, 4 sessions |

  **Recommendation: the Web Component first** — one wrapper reaches every framework at the lowest cost, it follows
  DzCalendar's `element`, and it holds no framework runtime; React next only when an app asks for components in cells.
- Contains: sheet `docs/behaviors/element.md` first (attributes, properties, events, `features`, `parts`, state,
  `dir` / `lang`, destroy on disconnect), the package, unit tests in jsdom, a browser check in three engines, a demo
  page, a React 19 and a Vue 3 smoke page that use the element (frameworks, not grids: CLEANROOM allows them), build and `check:api` baseline for the new package.
- Owner: Q3 (which wrapper); the npm name and its trusted publisher at release.
- Effort: 3 sessions (Web Component). Order: sixth. Depends on: L1–L3 (a stable base).
- Checked by: tests, three engines, axe on the demo, review (new code), `check:api` baseline.
- Size: a new line at measure + 10 %; K.8 untouched (Angular's profile).

**L8 — A public benchmark.** *Goal: numbers anyone can rerun, honest about where DzGrid is slower.*
- Contains: a separate folder **outside this repo** (as DzCalendar's `bench-public`, but out of the tree because of
  fact 7), the data sets A, B, C, the same 1 280 × 720 window, minified production builds, each library at its
  documented defaults for virtual scrolling, 1× and 4×, median of N runs, cold and warm; measures: bundle gzip, load,
  first render, scroll frames, numeric and text sort, text filter, 1 000-row group open, memory, create / destroy leak;
  raw JSON, scripts, machine and versions published; a « how to correct our setup » note for other maintainers. Before
  any other grid is installed: their licence checked for a benchmark-publication clause (owner).
- Owner: Q4 (alone or compared, which grids); the licence check; where it is published.
- Effort: 2–3 sessions (1 if DzGrid alone). Order: eighth. Depends on: L3 (tooling and numbers).
- Checked by: two runs on two days within 10 %; a second person's run if possible.
- Size: 0.

**L9 — Close and release.** *Goal: Phase 11 checked against ARCHITECTURE and released as one minor.*
- Contains: the architect agent against ARCHITECTURE Phase 11, code review of new code (L7, L3 fixes), the findings
  fixed; budgets reset by the owner's rule; `CHANGELOG` « Unreleased — 1.8.0 » completed (the server pivot plus Phase
  11), `docs/release-1.8.0.md`, ROADMAP « Phase 11 — close », STATUS; `test:real-app`, `release:check`, `publish:dry`.
- Owner: publishes (`npm run publish:latest -- --otp=CODE`), the new package's first publish and its trusted publisher.
- Effort: 1 session. Order: last. Depends on: all (L4c's fixes may follow in a patch if the listening is late).
- Checked by: `gate:step`, the review lists every place that recomputes the same thing (screen, export, print,
  clipboard, server wire) for any rule changed in Phase 11.
- Size: the reset table in `decisions.md`.

**Order in short**: L1 → L2 → L3 → L4a/b (L4c booked) → L5 → L7 → L6 → L8 → (L4c fixes) → L9. **Total ≈ 17–21
sessions**, of which the owner's own time is ≈ 4–5 h (listening, PDFs, README, publish).

## 4. Sizes (owner's rule: new entry = measure + 10 %; existing line +2 % at most; K.8 never grows)

| Line | Today | Phase 11 estimate |
|---|---|---|
| K.8 audit profile | 89 978 / 90 000 | ≤ 89 100 after L2 (Q2 A), then +50–150 for R3 / R4 / R10 / L4 fixes |
| core base | ≈ 29 258 / 29 300 | ± golf, +40–80 (R3, R4) |
| DOM base | ≈ 23 650 / 23 660 | ± golf, a11y fixes |
| `core/range` | 3 260 / 3 264 | 3 329 (+2 %, R1) |
| `dom/print` | 1 642 / 1 664 | ≤ 1 697 (L5) |
| `@dzgrid/element` (new) | — | measure + 10 % (≈ 1.7–2.8 kB) |
| everything else | — | unchanged, or +2 % with the reason in `decisions.md` |

## 5. Owner questions (French; recommended ★)

- **Q1 — Le filtre avancé « tapé » et la fenêtre flottante du dock.** A. Avant la Phase 11. B. Après la Phase 11,
  avant le site. C. Seulement si un écran en a besoin. ★
- **Q2 — K.8 (22 o de marge).** A. Une séance de « golf », bornée : on garde ce qu'on gagne, puis on relève la ligne
  s'il manque encore. ★ B. On relève tout de suite la ligne à 92 000, sans golf. C. Un golf long, jusqu'à 2 kB gagnés.
- **Q3 — Le deuxième wrapper.** A. Web Component (`<dz-grid>` pour tout le monde, comme DzCalendar). ★ B. React.
  C. Vue.
- **Q4 — Le benchmark public.** A. DzGrid seul : nos chiffres, refaisables par tous. B. Comparé à d'autres grilles
  (ag-Grid Community, TanStack, Tabulator…), dans un dossier hors du dépôt, sans jamais lire leur code, licences
  vérifiées d'abord. ★ C. Pas de benchmark public pour l'instant.
- **Q5 — L'écoute aux lecteurs d'écran.** A. Un « parcours essentiel » (≈ 30 étapes, ≈ 45 min par lecteur et par
  langue). ★ B. Le protocole complet (≈ 200 étapes, plusieurs jours). C. VoiceOver seulement.
- **Q6 — Windows pour NVDA.** A. Un vrai PC Windows. ★ B. Windows dans une machine virtuelle sur le Mac. C. Pas de
  Windows : le rapport dit « non vérifié avec NVDA / JAWS ».
- **Q7 — Publication.** A. Une seule 1.8.0 à la fin de la Phase 11 (le pivot serveur avec). ★ B. 1.8.0 maintenant
  (pivot serveur), puis 1.9.0 à la fin. C. Une version après chaque lot.
- **Q8 — Où mettre `llms.txt`.** A. À la racine du dépôt et dans le paquet `@dzgrid/dom` (lisible dans
  `node_modules`). ★ B. À la racine seulement ; le site le servira plus tard.

## 6. Exit criteria

- R1–R11 fixed or written down as kept on purpose (a sheet line each).
- K.8 ≤ its line with room left for the next phase (Q2's answer), `check:size` 0 over.
- 4× budget file in place, every line measured at 1× and 4×, the §5.3 targets met at 1× and ×3 at 4× with no frame
  over 100 ms — or each miss written with its cause and the owner's decision.
- Automated accessibility list green in three engines; ACR draft complete for every WCAG 2.2 A / AA criterion; the
  owner's listening done for at least VoiceOver (fr, ar) and NVDA if Q6 ≠ C, its « perdu » lines fixed.
- Print checked as PDF text in three engines, the browser's own menu covered.
- README, guides, `llms.txt`, `llms-full.txt` up to date; the names test green.
- The second wrapper built, tested in three engines, documented.
- The benchmark published with its scripts (if Q4 ≠ C).
- Architect check + code review done, findings fixed; `gate:step` green; 1.8.0 prepared, the owner publishes.

## 7. Risks

| Risk | Answer |
|---|---|
| Golf breaks behaviour silently | No behaviour change allowed in L2; full suite, `test:real-app` screenshots, `check:api` unchanged. |
| 4× runs heat the owner's Mac and give noisy numbers | One engine, one run at a time, median of three, the machine named; never in a loop; owner picks the window. |
| The listening never happens and the ACR stays « not verified » | Condensed path (Q5 A), sessions booked in L4, the ACR says so plainly — never « validated » before it is. |
| A public benchmark looks unfair or breaks a licence | Out of repo, defaults documented, raw data published, maintainers invited to correct; licences checked first. |
| Clean room around the benchmark | Other grids only installed in the outside folder, run and timed, never opened (CLEANROOM.md). |
| A second wrapper doubles maintenance | Web Component first (thin, no framework runtime); React only on a real request. |
| Phase 11 grows without end | Each lot bounded in sessions; what does not fit is written in `decisions.md` for after the site. |
