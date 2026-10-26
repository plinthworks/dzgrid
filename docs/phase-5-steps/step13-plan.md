# Phase 5, step 13 — the close: 0.3.0 prepared locally, never published (architect, 2026-10-26)

Sources, which win in this order: `decisions.md` (Q2, Q16 « reset to measure + 10 % at the close, never above these
grants », S9-Q5, S9-Q6, S12-Q10 and every grant), `partB-plan.md` §3 step 13 and §5 (PB1–PB13), `phase-5-plan.md` §5,
`step09-plan.md` §6 (the Part A gate G1–G17, the model of the table below), `step12-plan.md` Done / Review, the Phase 4
close `docs/phase-4-steps/step13-plan.md` (the order: sizes → version → gate → docs → commit), `scripts/rebudget.mjs`,
`size-budget.json`, `gsap-license.md`. Steps 1–12 committed (last `a21428b`); the working tree is clean.

**No feature code in this step.** Only: pinned budget tests and `rebudget.mjs`'s ceilings / comment (tests first),
`size-budget.json` (`--write` on the owner's word), the version (tests first), docs. Any red in the gate is fixed tests
first and reported; it never becomes a budget raise without a written decision.

## Order
1. Sizes: tests first, dry run, the owner reads the table (§3 below), `--write`.
2. Version 0.3.0: tests first, then the manifests (§4).
3. The final gate (§2), one command at a time.
4. `pack:local` and the tarball inspection (§4).
5. Docs (§5). 6. The commit « release: 0.3.0 prepared », by the lead after the owner reads the gate; tag per Q-C1;
   push `main` only; **never `npm publish`**.

## 1. Part B exit criteria (`partB-plan.md` §5; phase-5-plan §5 Part B items inside) — each and how it is checked
| # | Criterion | Check |
|---|---|---|
| PB1 | Sheets before code | `git log --diff-filter=A --format=%h -- docs/behaviors/{range-selection,clipboard,fill}.md` before the first `core/range` code (`7156ec0` carries both: sheets first in its diff order, as step 10 « Done » records); grep: every `range-*`, `clipboard*`, `fill*` test file names its sheet |
| PB2 | Full range keyboard, ltr / rtl, Mac Cmd; never from a field, widget, popup, filter input, nested grid | `range-keys.test.ts` (owners ignored, nested grid), `range-fill-keys.test.ts`; browser `--only range` keys in the three engines (full run) |
| PB3 | Range and fill handle right in RTL | jsdom `range-paint`, `range-fill` (rtl); browser `--only fill` (handle bottom-left, drag toward the logical end, ar Midnight) Chrome / Firefox / WebKit; TSV logical order in `range-copy` |
| PB4 | One paste / cut / Delete / fill / bulk = one gesture = one request = one undo | recording-`save` tests in `range-paste`, `range-cut`, `range-fill`, `range-bulk`; the walk `range-walk`; property `range-fill-property` (300 in the suite, **3 000 seeds once at the gate**) |
| PB5 | Refused cells skipped and counted; mounted ones blink; S3-O2 partial refusals | `range-paste` (refused codes, partial server refusal), `range-bulk` (refused counted) |
| PB6 | Details, fillers, loading rows never pasted, filled, bulk-edited, cleared, copied (criterion 5 complete) | conformance `paste-plan/*`, `fill-plan/*`, `range-box/*` non-data cases; `edit-detail.test.ts` re-pinned paste; fill onto a detail = disarm (`fill.md` 14) |
| PB7 | Ctrl/Cmd+C/X/V/A/D/R/Z/Enter inside a field are the field's (but Ctrl+Enter's bulk, QB5) | `editors-paste-pin` on the real handler, `editors-review` re-pinned « Ctrl+Enter », `range-fill-keys` (field open) |
| PB8 | Excel interop cases of `clipboard.md`, each a hand-written test | `range-copy`, `range-paste`, `paste-text` conformance (fr / en / ar numbers, days, instants, quotes, newlines, Arabic, RTL order, guard read back); real Excel / Sheets / Safari: **owner, non-blocking** (§6) |
| PB9 | Pasted HTML never live, no script, nothing fetched | `range-html-safety.test.ts` (MutationObserver 0 nodes, 5 MB); browser CDP network log empty (full run) |
| PB10 | a11y: axe 0 with a range fr light / ar dark / forced colours; `aria-selected`, `aria-multiselectable`; sentences; contrast | browser `--only range`, `--only fill` (axe with the mode on, forced colours); `check:contrast` (954 pairs at step 12, 0 below) |
| PB11 | Trees, nested grids, spans, server pages | their range / fill tests (B13 list in `partB-plan.md`), `--only playground` (`?tree=1`, `?paged=1`) |
| PB12 | Dataset B bulk ≤ 30 ms one request; paste 1 000 ≤ 40 ms | « one request » asserted in vitest (`range-bulk`); timings **indicative** (step 12: 17.7 / 18.7 ms, load 5–6), quiet-machine run pending (Q17d) — stated as such, not « met » |
| PB13 | Budgets by written decision; `core/edit`, `dom/edit` unchanged; gate; docs; 0.3.0 prepared unpublished; listening §20 and Excel captures scheduled | §3 table with each ceiling's decision; `check:size` 0 over; `git diff v0.2.0..` shows no `npm publish`; STATUS « Ce qui attend le propriétaire » |

Also restated from the Part A gate (`step09-plan.md` G1–G17, green at `7ba1020`): rerun as part of the gate (every test
named there is in `test:ci` / `test:perm` / the full browser run). **Part A stays open on 124a–b only** (S9-Q5): the
close is « close techniquement », as Phase 4.

## 2. The final gate (`caffeinate -i`; one command at a time; vitest ≤ 2 workers; one headless browser at a time,
closed in `finally`; never stop vite or port 4700; `ps` at the end: no vitest worker, no browser of ours left)
1. `npm run build` (manifests, `repository`, peers `^0.3.0`, maps checked).
2. `npm run typecheck` (core lib ES2023, dom, tests, Angular templates by ngc).
3. `npm run test:ci` (step 12: 404 files / 6 321 tests; record the count; one timeout under load → rerun once, both
   results written).
4. `npm run test:perm` (5 files / 10 tests); then `range-fill-property` at **3 000 seeds** once.
5. `npm run test:tz` (Auckland, Los Angeles, each `--maxWorkers=2`).
6. `npm run check:size` (0 over, after §3's `--write`; Angular line after the build).
7. `npm run check:contrast` (pairs of the base theme, Midnight, Clinic, `contrast.css`; hue pairs ≥ 60°).
8. `npm run test:browser` full (Chrome; the Firefox and WebKit groups: `edit-undo`, `range`, `fill`, clipboard keys;
   `--only playground` on the running 4700 server, never restarted). Step 12: 967 / 967.
9. `npm run test:audit -- --full` (42 checks, 1 000 permutations, export 100 000 × 30 without long task).
10. `node packages/angular/browser/run.mjs` (fixture, 90 / 90 at step 12; `--only edit` inside).
11. `npm run example:build` (packs the **0.3.0** tarballs, installs them as copies; default, zone, baseline builds).
12. `npm run example:bytes` (audit initial load ≤ **92 500**, S12-Q10; the stock chunk measured apart; K.8 83 500).
13. `npm run example:csv` (10 tests, `out/audit-ar.csv` with BOM).
14. `npm run example:ssr` (fr, ar: host only, 0 rows, no timer, no error).
15. `npm run example:browser` (8 / 8: fr / ar, zoneless and zone.js; the stock screen's drag and Ctrl+Enter).
16. `npm run pack:local` (§4 inspection).
No bench (Q17d): `bench`, `bench:browser` not run; time budgets unchanged.

## 3. The rebudget at the close
Tests first (`scripts/test/rebudget.test.ts`, `rebudget-review.test.ts`): `SIZE_COMMENT` names the Phase 5 rule
(Q16: measure + 10 %, rounded up to 50, never above the owner's grants; pointer to ROADMAP « Final budgets (Phase 5) »
and `docs/phase-5-steps/decisions.md`); the old `$comment` copied word for word into ROADMAP first; ceilings per §3's
owner answers (Q-C2). Then the pinned tests that follow the new numbers: `core/test/layering.test.ts` (seam guard
28 916), `dom/test/rules.test.ts` (core/rules), `dom/test/parts-guards.test.ts` (parts 700, theme 2 500),
`dom/test/motion-seam.test.ts` (run 3 500), `theme/test/skins.test.ts`, `theme/test/bridges.test.ts` (650 / 500).
Then `npm run build` and `node scripts/rebudget.mjs sizes` (**dry run**, measuring itself); read; owner; `--write`;
`check:size`.

**Dry run already read** (from the step-12 gate's saved `check:size`, scratchpad `s12-g-size.txt`, nothing written;
the close remeasures after its own build — figures may move by a few bytes):

| Entry | Now | Measure | Dry run | Grant / ceiling (decision) |
|---|---|---|---|---|
| `@dzgrid/core` | 29 000 | 28 916 | 29 000 | 29 000 (Q16) — **capped** |
| `core/server` | 6 100 | 6 088 | 6 100 | 6 100 (S2-O4) — **capped** |
| `core/spans` | 3 850 | 3 438 | 3 800 lower | ARCH §5.2 |
| `core/csv` | 2 000 | 1 868 | 2 000 | 2 000 (Q7) — **capped** |
| `core/rules` | 550 | 512 | **600 raise** | none (rule only) |
| `core/tree` | 3 500 | 3 410 | 3 500 | 3 500 — **capped** |
| `core/tree-lazy` | 1 500 | 1 457 | 1 500 | 1 500 — **capped** |
| `core/detail` | 1 050 | 999 | 1 050 | 1 050 (S2-O5) — **capped** |
| `core/edit` | 3 100 | 3 098 | 3 100 | 3 100 (S3-O4) — **capped** |
| `core/range` | 4 000 | 2 897 | 3 200 lower | 4 000 (Q16) |
| locales base / filters / pagination / export / parts / rules / tree / detail (24) | — | — | all same | 2 000 each (ARCH) |
| `en/fr/ar-edit` | 560 / 630 / 900 | 517 / 598 / 895 | 560 / 630 / 900 | S4-O4, S8-O1 — **all three capped** |
| `en/fr/ar-editors` | 450 / 500 / 620 | 383 / 434 / 533 | 450 / 500 / 600 (ar lower) | S5-O3 |
| `en/fr/ar-range` | 350 / 400 / 500 | 319 / 366 / 500 | 350 / 400 / 500 | Part B budgets — **all three capped** (ar at 0 B margin) |
| `en/fr/ar-fill` | 250 / 300 / 380 | 231 / 278 / 299 | 250 / 300 / 350 (ar lower) | S12-Q4 — **en, fr capped** |
| `@dzgrid/theme` | 2 500 | 2 494 | **2 750 raise** | script 3 050 (T7) vs S4-O2 « base kept ≤ 2 500 » — Q-C2 |
| `midnight.css` / `clinic.css` | 650 / 650 | 446 / 472 | 500 / 550 lower | T7 |
| `tailwind` / `tailwind3` / `bootstrap.css` | 500 each | 325 / 325 / 293 | 400 / 400 / 350 lower | T7 |
| `edit.css` | 2 200 | 2 197 | 2 200 | S7-O1 — **capped** |
| `range.css` | 500 | 479 | 500 | Part B — **capped** |
| `fill.css` | 460 | 450 | 460 | S12-Q9 — **capped** |
| `@dzgrid/dom` | 21 700 | 21 565 | **21 980 raise** | 21 980 (T7) — **capped**, within the grant |
| `dom/popup`, `spans`, `slots`, `search`, `pagination`, `export`, `export: run`, `rules`, `motion-gsap` | — | — | all same | ARCH |
| `dom/parts` | 700 | 689 | **800 raise** | none (rule only) |
| `dom/tree` | 3 800 | 3 795 | 3 800 | S8-O1 — **capped** |
| `dom/tree-lazy` | 1 000 | 938 | 1 000 | — **capped** |
| `dom/detail` | 4 150 | 4 092 | 4 150 | S8-O7 — **capped** |
| `dom/edit` | 4 150 | 4 146 | 4 150 | S8-O6 — **capped** |
| `dom/editors` | 6 720 | 6 669 | 6 720 | QB5 — **capped** |
| `editors: calendar (lazy)` | 1 500 | 1 494 | 1 500 | S6-O6 — **capped** |
| `dom/editors-list` | 1 400 | 1 234 | 1 400 | S6-O7 |
| `dom/range` | 4 800 | 4 768 | 4 800 | S11b-Q3 — **capped** |
| `range: html (lazy)` | 600 | 506 | 600 | S11b-Q5 |
| `dom/fill` | 3 000 | 2 781 | 3 000 | S12-Q9 — **capped** |
| `motion-gsap: run (lazy)` | 3 500 | 3 382 | 3 500 | Q16 — **capped** |
| `dom/internal` | 1 234 | 1 184 | **1 250 raise** | S6-O6 « measure + 50, up to 1 250 » — Q-C2 |
| `dom/filters` | 10 000 | 9 673 | 10 000 | — **capped** |
| `filters: set` / `date adapters (lazy)` | 4 200 / 2 600 | 3 807 / 2 321 | same | ARCH |
| profile K.8 | 83 500 | 82 986 | 83 500 | Q16 — **capped** |
| `@dzgrid/angular` | 6 863 | 6 813 | **7 000 raise** | S9-Q6 « measure + 50, at most 7 000 » — Q-C2 |
| real example (not in the script) | 92 500 | 92 059 | unchanged | S12-Q10, `scripts/example.mjs` |

**Entries where measure + 10 % exceeds the grant (the rule caps them):** core (84 B left), core/server (12), core/csv
(132), core/tree (90), core/tree-lazy (43), core/detail (51), **core/edit (2)**, en/fr/ar-edit (43 / 32 / **5**),
en/fr/ar-range (31 / 34 / **0**), en/fr-fill (19 / 22), **edit.css (3)**, range.css (21), fill.css (10), dom (415),
**dom/tree (5)**, dom/tree-lazy (62), dom/detail (58), **dom/edit (4)**, dom/editors (51), **calendar (6)**, dom/range (32),
dom/fill (219), motion run (118), dom/internal (66 to 1 250), dom/filters (327), K.8 (514), angular (187 to 7 000).
Raises the rule would make where no grant names the entry: `core/rules` 600, `dom/parts` 800 (Q-C3). Rule conflicts:
theme, `dom/internal`, angular (Q-C2). Lowers (by rule, no decision needed): spans, core/range, ar-editors, ar-fill,
the skins and bridges. Time budgets: untouched (Q17d).

## 4. Version 0.3.0, `pack:local`, tarballs
Tests first (as at the 0.2.0 close; red runs saved as scratchpad `a13-red-*.txt`): `scripts/test/release.test.ts`
(the four at 0.3.0; source peers exact `0.3.0`, built `^0.3.0`; `DZGRID_ANGULAR_VERSION`), `release-review.test.ts`
(packed tarball names `-0.3.0.tgz`; every Phase 5 subpath in the built `exports`: `core/edit`, `core/range`,
`dom/edit`, `editors`, `editors-list`, `range`, `fill`, `locales/{en,fr,ar}-{edit,editors,range,fill}`; theme
`edit.css`, `range.css`, `fill.css`, `midnight.css`, `clinic.css`, the three bridges and every `.unlayered.css`; the
lazy chunks the entries import present), `perf/test/example-bytes.test.ts` if it names the version. Then
`packages/{core,dom,angular,theme}/package.json` 0.3.0, peers, `packages/angular/src/version.ts`, the example's four
`file:` tarballs `-0.3.0.tgz`, the comment in `scripts/example.mjs`; `scripts/build.mjs` `PACKAGES` only if a subpath
is missing.
Inspection of `packed/dzgrid-{core,dom,angular,theme}-0.3.0.tgz` (`tar -tzf`, sizes and file counts written beside
0.2.0's 369 700 / 465 671 / 38 082 / 11 568 B): no tests, playground, screenshots, `results/`, scratch (`a13-`, `s12-`),
`spikes/`, `perf/`; no `.d.ts.map`; 0 map problems; gsap and `@tzslot/*` not bundled (peers, optional for gsap);
no runtime `dependencies`; licence and README in each; `repository` set.

## 5. Docs
- **CHANGELOG**: `[Unreleased]` → `[0.3.0] - unreleased`, by area (core, dom, theme, angular), with a **Changed /
  breaking** list checked against `git diff v0.2.0..HEAD` of the public types: `editors({ enterMoves })` default
  `'stay'`; the CSS in `@layer dzgrid` by default (an unlayered app rule now wins; `.unlayered.css` copies; layer
  order layout < theme < skin < bridge < contrast, T1/T9); `aria-readonly` per cell instead of the viewport's fixed
  attribute; `SaveOrigin` gains `cut` (exhaustive switches); `FilterKind.test` / `wire` get the app context as an
  extra argument; Space on a yes/no cell toggles it, not the row (O8); with `range()`, Shift+click and Ctrl+A make a
  block, not a row selection (QB1); the base theme's focus ring, cell and row tints (S12-Q8 bis, a visual change); the
  tzslot loader moved to `@dzgrid/dom/internal`. A fresh empty `[Unreleased]` above.
- **README**: status (Phase 5 closed technically, 0.3.0 prepared, unpublished), the new entries with sizes from §3,
  editing / ranges / fill in a few lines, the owner's open items not hidden (GSAP licence).
- **ARCHITECTURE**: « Index des décisions de la Phase 5 » completed (steps 11a, 11b, 12; S11-Q1–Q6, S11b-Q1–Q5,
  S12-Q1–Q10; the close's Q-C answers), « Ajustements après la Phase 5 », §5.2 sizes (new subpaths), §6 Phase 5 marked
  closed technically, the order Phase 6 → docs site → 7…
- **ROADMAP**: « Phase 5 — close techniquement, 2026-10-xx » (steps with commits, exit criteria table A G1–G17 + B
  PB1–PB13 with « met / indicatif / owner »), « Reporté (Phase 5) », « Final budgets (Phase 5) » (§3 table, the old
  `$comment` word for word).
- **STATUS**: rewritten for a lost session (where we are, Phase 5 steps and commits, the owner's list §6, commands,
  rules); the current text moved word for word to **`docs/phase-5-steps/status-log.md`** (Phase 4's stays in
  `docs/phase-4-steps/status-log.md`).
- **CLAUDE.md** pointer: « Phase 5 closed technically, 0.3.0 local; Phase 6 next »; the step plans in
  `docs/phase-5-steps/`. Also `phase-5-plan.md` §5 « fermé le », `partB-plan.md` Done (steps 11a–13), this plan's Done.

## 6. Open owner items to carry (STATUS « Ce qui attend le propriétaire », none blocks the close)
1. **124a–b** (the last point that keeps Part A open, S9-Q5): Japanese and pinyin IMEs, French dead keys; iOS /
   Android touch, double tap, bubble above the keyboard, VoiceOver / TalkBack, on `orders-edit.html`.
2. **Excel** (Windows, macOS) and **Google Sheets**, fr and ar, both ways (numbers, dates, `'=1+1`, `0123`, newlines in
   a cell, column A in Arabic: risk K1); the Arabic CSV in Excel (`audit-ar.csv`, column order).
3. **Safari real** (S11b-Q2): Cmd+C / V / X on `orders-edit.html` with no text selected; a workaround only if it fails.
4. **Listening** §16–§18 (tree, detail, filter row), §19 (edit: 119, 124c–g), §20 (ranges, clipboard, fill: 125–142).
   Never « validé » before.
5. **Arabic reviews**: `ar-tree`, `ar-detail`, `ar-filters`, `ar-edit`, `ar-editors`, `ar-range` (shortened texts),
   `ar-fill`.
6. **GSAP licence** re-read (https://gsap.com/standard-license once online: competing products, redistribution);
   before any publication.
7. **npm publication** (`@dzgrid` scope, GitHub Actions OIDC), on his word only; 0.1.0 and 0.2.0 never published.
8. **tzslot** requests T1–T11 (`docs/tzslot-requests.md`).
9. **Palettes** `sehhaty.json` and the step-24 spec (`docs/sehhaty-track.md`); the `pharma/stock` sheet (Q19).
10. **Quiet-machine bench** (Q17d): the 17 old Node lines, « toggle near the end », and the dataset B lines (bulk,
    paste, fill) then the Q17c rule.
11. **Ctrl/Cmd+D bookmark** and **Ctrl/Cmd+R reload** in real headed browsers (§20 132, 138): headless engines only
    prove the keydown is prevented.
12. Visual looks: the Clinic violet block edge, the orange border inside the blue ring.

## 7. Risks
Measures moving between the step-12 file and the close's build (the dry run is redone, never trusted from the table);
0–6 B margins (ar-range 0, core/edit 2, edit.css 3, dom/edit 4, dom/tree 5, ar-edit 5, calendar 6): any doc-comment or
version-string change in shipped code can tip one — the version string is the same length; `rebudget.mjs` ceilings
that silently raise (theme 2 750, angular 7 000, internal 1 250, rules, parts) if `--write` is run before Q-C2/C3;
pinned budget tests forgotten (seven files); `example:build` uses the network and the new tarballs (npm may keep an old
copy: example.mjs removes it); tests timing out under load (record, rerun once, never raise a timeout to hide it);
a breaking change missed in the CHANGELOG (check the type diff, not memory); Part A still open on 124a–b — the words
« close techniquement », never « closed »; GSAP licence unconfirmed; bench indicative only.

## 8. Questions au propriétaire (★ = recommandé)
**Q-C1. L'étiquette `v0.3.0`.** Les précédentes (`v0.1.0`, `v0.2.0`) sont restées sur ce Mac.
A ★ Créer `v0.3.0` en local seulement, pousser `main` sans l'étiquette (comme avant). B Créer et pousser l'étiquette
sur GitHub. C Pas d'étiquette avant la vraie publication.

**Q-C2. Trois tailles où deux règles se contredisent.** La règle générale (mesure + 10 %) donne : thème 2 750,
Angular 7 000, `dom/internal` 1 250. Vos règles propres donnent : thème ≤ 2 500 (S4-O2), Angular mesure + 50 = 6 863
(S9-Q6), `internal` mesure + 50 = 1 234 (S6-O6).
A ★ Vos règles propres gagnent (2 500, 6 863, 1 234). B La règle générale partout. C Mélange (dites lesquelles).

**Q-C3. Deux hausses sans accord écrit** (par la règle seule) : `core/rules` 550 → 600 (mesure 512), `dom/parts` 700 →
800 (mesure 689).
A ★ Accepter, comme à la clôture de la Phase 4 (la règle, pas de code ajouté). B Garder 550 et 700.

**Q-C4. Le nom de la clôture.** 124a–b ne sont pas faits.
A ★ « Phase 5 close techniquement », la partie A ouverte sur 124a–b seulement (S9-Q5), on passe à la Phase 6.
B Attendre 124a–b avant d'écrire la clôture.

## Done (2026-10-26, not committed; owner Q-C1–Q-C4)

**1. Sizes.** Fresh `npm run build`, then `node scripts/rebudget.mjs sizes` dry run: the same figures as §3's table (step 12's
file), byte for byte; a second dry run after the script change identical. Tests first (red saved as scratchpad
`s13-red-budgets.txt`: 18 failed): `rebudget.test.ts` (Q-C2 / Q-C3 ceilings, the close's measures, the Phase 5
`SIZE_COMMENT`; the T7 and step-11a pins found red after the script change and corrected), `layering` (core/range 3 200;
seam guard 28 916 kept), `rules`, `parts-guards`, `motion-seam`, `skins`, `bridges`. `rebudget.mjs`: theme ceiling 2 750
(Q-C2), `core/rules` 600 and `dom/parts` 800 (Q-C3), the comment pointing at ROADMAP « Final budgets (Phase 5) » and
`docs/phase-5-steps/decisions.md`. The old `$comment` copied word for word into ROADMAP first, then `--write`. Raises:
core/rules 600, theme 2 750, dom 21 980, dom/parts 800, dom/internal 1 250, angular 7 000; lowers: core/spans 3 800,
core/range 3 200, ar-editors 600, ar-fill 350, midnight 500, clinic 550, tailwind / tailwind3 400, bootstrap 350.
At its cap: `ar-range` 500 / 500. `check:size` 0 over.

**2. Version 0.3.0.** Tests first (red `s13-red-release.txt`, 8 failed): `release.test.ts` (four at 0.3.0, source peers
`0.3.0`, `DZGRID_ANGULAR_VERSION`), `release-review.test.ts` (peers `^0.3.0`, tarball names; new: every Phase 5 subpath,
the skins, bridges and `.unlayered.css`; every relative import of a shipped module, lazy chunks included, in its
tarball; no scratch / spike / perf file, LICENSE and README, no runtime dependency but ng-packagr's `tslib` for Angular
(allowed by `manifest.mjs`), gsap and tzslot peers only and not bundled; the tarballs unpacked once in a temp folder,
removed after). Then the four manifests, peers, `version.ts`, the example's `file:` tarballs, the comments in
`example.mjs` and `example-lib.mjs`. `scripts/build.mjs` unchanged (no subpath missing).

**3. Tarballs** (`pack:local` at the end of the gate): core 422 356 B / 288 files, dom 634 791 / 528, angular 43 772 / 6,
theme 28 600 / 24 (0.2.0: 369 700 / 465 671 / 38 082 / 11 568). No test, playground, screenshot, result, scratch,
spike or perf file; no `.ts` source but `.d.ts`; no `.d.ts.map`; 0 map problems; LICENSE and README in each;
`repository` set; no runtime dependency (Angular: `tslib`).

**4. The gate** — see ROADMAP « Phase 5 — close techniquement »: all green on the first run, no rerun.

**5. Docs.** CHANGELOG `[0.3.0] - unreleased` (by area, breaking list checked on the v0.2.0 source diff: the
`enterMoves` default, `SaveOrigin` `cut`, Space on yes/no, the `FilterKind` context argument and the loader move are new
in 0.3.0, not breaking against 0.2.0; `aria-readonly` is per cell only once a column is editable), README, ARCHITECTURE
(index, « Ajustements après la Phase 5 », §5.2, §6), ROADMAP, STATUS rewritten (old text word for word in
`docs/phase-5-steps/status-log.md`), CLAUDE.md, `phase-5-plan.md` §5, `partB-plan.md` Done. Three test headers given
their sheet (PB1). The commit « release: 0.3.0 prepared » and the local tag `v0.3.0` (Q-C1): the lead's.
