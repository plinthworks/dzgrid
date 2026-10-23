# Showcase demos — plan (showcase-plan.md items 2 and 3)

Architect's plan, 2026-10-23, after the showcase themes (`8ccb6b0`, `01b07ae`). Plan only: nothing coded.
Clean room: the HR demo is described from what a person sees on another grid's public demo page (a
screenshot); no code, CSS, data, image or icon of it is read or copied. Every name, figure and drawing is
ours and invented.

## 0. What already exists (no library code needed)

| Need | Already in DzGrid |
|---|---|
| a nested grid per master | `detail({ part: nestedGrid({ settings }) })`, `@dzgrid/dom/detail` |
| independent sort / filters per grid | each nested grid has its own kernel and query (master-detail.md) |
| org tree, parent column, sticky parents | `tree({ parentId, sticky: 3 })`, `@dzgrid/dom/tree` |
| pinned first column | `ColumnDef.pinned: 'start'` (right edge in Arabic) |
| status pills | `badge({ tones, classes })` (glyph + colour, tone never in the name) |
| avatar, department pill, flag, contact links | `definePart('cell', …)`, cell widgets (`focus()` true → Enter goes in, Escape out) |
| row / header / cell classes | `rowClass`, `ui.headerClass`, `ui.cellClass` |
| dates and amounts by locale | `type: 'day'`; `type: 'number'` + `numberFormat: { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }` |
| themes | `midnight.css`, `clinic.css`, area by `data-dzg-skin` |

**Conclusion: both demos are host code only.** One owner question on row height (§5).

## 1. Files

New (playground only, never packed):
- `playground/demos/seed.ts` — a tiny seeded generator (mulberry32 on an integer seed; `pick`, `int`,
  `day`): deterministic, same data on every machine and run. No `Math.random`, no clock.
- `playground/demos/orders.ts` — data + `mountOrders(host, { locale, skin })`.
- `playground/demos/hr.ts` — data + parts + `mountHr(host, { locale, skin })`.
- `playground/demos/flags.ts` — inline SVG flags, our own drawing, 8 real countries (DZ, FR, MA, TN, SN, ES, DE, CA), simple geometric shapes.
- `playground/demos/demos.css` — avatar disc, department pill, contact link styles; colours only from
  `--tz-*` (and `color-mix()` / `light-dark()` of them), logical sides only.
- `playground/orders.html`, `playground/hr.html` — pages (back link, title, short note, controls:
  language, theme, skin), calling the mount functions.
- `packages/dom/test/browser/demos.html` + `demos.ts` — the browser suite's page, importing the same
  `playground/demos/*.ts` modules (the suite's server does not run Vite; so the modules import no CSS:
  pages link `demos.css` and the theme files).

Modified:
- `playground/index.html` — Démos menu: 4 entries (below).
- `vite.config.ts` — inputs `orders`, `hr`.
- `scripts/browser.mjs` — `demosChecks`, `-- --only demos`, also in the full run.
- `docs/STATUS.md`, `ROADMAP.md` — one line each when done.

Menu entries:
- `./orders.html` « Maître/détail, mêmes colonnes (commandes) » — fr, light, Clinic
- `./orders.html?locale=ar-DZ&theme=dark&skin=midnight` « … (arabe, sombre) »
- `./hr.html` « Ressources humaines (organigramme) » — fr, light, Clinic
- `./hr.html?locale=ar-DZ&theme=dark&skin=midnight` « … (arabe, sombre) »
Each page keeps a skin switch (aucun / midnight / clinic) and a theme switch.

## 2. Demo 1 — orders and sub-orders, same columns

- **Data** (`seed 2026`): 200 orders `O-0001…`, each 0–8 sub-orders `O-0001-1…` of the same shape
  `{ id, ref, client, day, status, qty, amount }`; an order's qty and amount are the sum of its
  sub-orders (0 sub-orders: its own values). ~200 + ~800 rows.
- **One column array** `orderColumns: ColumnDef<Line>[]` used by the master and by `nestedGrid`'s
  `settings` (same object). Status by `badge` (En attente / Préparée / Expédiée / Livrée / Annulée).
  Filters and sort on both, each grid its own query (nothing shared).
- **Alignment with indent**: the master's first column holds the chevron (24 px + margin). The panel
  content gets `padding-inline-start: var(--demo-indent)` (= chevron width + `--dzg-line`), and the inner
  grid's first column is `width − indent`: every other column edge lines up under the master's. Inner
  columns `resizable: false`; a master `columnResized` is replayed (`column.resize`) on each live inner grid
  (kept from `onGrid`, dropped when its element left the document) and stored for grids made later.
- **Known limit, written in the page note**: under a horizontal scroll of the master the panel stays at
  the view's start (master-detail.md); widths are chosen to fit 1 100 px, so no scroll at desktop width.
- `detail.height`: function of the sub-order count (header + n rows, capped at 8), no inner scroll.

## 3. Demo 2 — HR

- **Data** (`seed 1962`): 500 people, `parentId` = manager: 1 director general → 6 department heads →
  ~30 managers → ~90 team leads → staff; depth 5. Invented first and last names from short lists (Latin
  in both languages, as the other demos, so the listening protocol names stay stable), job titles in fr
  and ar, department (6), country (8), hire `day`, monthly salary DZD, health-flavoured status
  (`À jour` success, `Visite due` warning, `En arrêt` danger, `Mi-temps thérapeutique` info), e-mail
  `prenom.nom@example.org` (RFC 2606), phone in a fictitious range.
- **Columns**: Employé (pinned start, tree chevron, part: avatar + name + title, two lines) · Département
  (pill part) · Pays (flag + name) · Embauche (day) · Salaire (currency, `headerClass` aligns end) ·
  Statut (`badge`) · Contact (part). `rowClass`: `hr-lead` on people who have reports (name in bold).
- **Avatar**: initials on a disc, colour from a hash of the id among 6 `light-dark()` pairs; `aria-hidden`
  (decorative: the name is next to it). No image, no network.
- **Flag**: inline SVG `aria-hidden="true" focusable="false"`; the country name is the text, from
  `Intl.DisplayNames(locale, { type: 'region' })` (localised, Arabic included); flags are not mirrored in RTL.
  No emoji (regional indicators show letters on Windows).
- **Contact**: two links styled as icon buttons, `mailto:` and `tel:`, 24 px targets, names
  « Écrire à Amina Haddad » / « Appeler Amina Haddad » (ar likewise), icons inline SVG `aria-hidden`.
  Part `focus()` → first link; Left/Right (swapped in RTL) move between the two; Escape back to the cell.
- **Two lines in a row**: `density: 'spacious'` = 40 px; 28 px disc, name 13 px / title 11.5 px, line
  height 1.2: fits. See §5.
- Tree `sticky: 3`, `initial: 2` (director and heads open).

## 4. Browser checks (`-- --only demos`, Chrome; RTL ones also in Firefox and WebKit with `--all`)

1. axe 0 on each of the 4 pages (fr Clinic light, ar Midnight dark), a panel open / tree open, and with
   the focus inside a nested grid and on a contact link.
2. Orders: the inner grid's header texts and column ids equal the master's, in order; for columns 2…n the
   inline-start edges within 1 px of the master's (fr and ar); first column ends aligned; after a master
   resize, the inner widths follow.
3. Orders: a sort and a filter in one inner grid leave the master and another panel unchanged, and the
   reverse.
4. HR keyboard: from the Employé cell, Right ×6 reaches Contact; Enter focuses « Écrire à … »; Right (Left
   in ar) the phone link; Escape back to the cell; Tab leaves the grid (no trap). Accessible names checked.
5. HR sticky: scroll to a staff row deep in the tree; the copies of its 3 nearest ancestors are visible
   under the header, in the pinned column too, fr and ar.
6. HR RTL: pinned column on the right edge, flags not mirrored, amounts and dates in `ar-DZ` form (Latin
   digits by default), header tracking 0.
7. No page error, no `problems` event, no network request but the page's own files.
8. Determinism: two loads give the same first 20 row ids and figures.

## 5. Size and owner questions

- **Budgets: no impact.** `npm run check:size` bundles only the entries of `size-budget.json`, all under
  `packages/*/src` (none names `playground/`); `release-review.test.ts` refuses `playground/` and `test/`
  in the packed archives. The demos change no file under `packages/*/src`.
- **Owner question D1 (optional, library)**: rows taller than 40 px. The reference look has roomier
  two-line rows; ours fit in `spacious` (40 px) but are tight. Option: a numeric `rowHeight` setting
  (dom base, ~40–60 B gzip, a test first) or a fourth density `'roomy'` (52 px, ~15 B). Default plan: no
  change, 40 px.
- **Owner question D2**: department pills drawn by the demo (6 colours, not tones), since `badge` tones carry
  meaning (✕ on « Finance » would mislead). OK?

## 6. rowHeight blueprint (step architect, 2026-10-23, after D1)

Owner D1: a numeric `rowHeight` (px, chosen by the app) that overrides the density's row height, live.

**Where the row height is read today.** One function, `g.rowHeight()` (`packages/dom/src/grid.ts`):
`round(ROW_HEIGHT[density] × remPx / 16)` — the density's height at 16 px text, scaled with the
reader's text size. Every reader goes through it, so the override is made there and nowhere else:

| Reader | File | What it does with `h` |
|---|---|---|
| row layout (uniform, or a feature's `layoutFor(d, h, was)`) | `render/viewport.ts` `rowLayout` | rebuilt when `h` changes (`g.laid`) |
| scroll math, scaled scrolling past the browser's height cap | `render/viewport.ts` paint | `scrollMapper(layout.total, MAX_PHYSICAL, block)` re-made on a new total; the top row kept at the same fraction (`keep`) |
| header rows, `--dzg-row-height` (cell line height, spans' header) | `render/viewport.ts`, `spans/body.ts`, `spans/index.ts` | header rows are one row high (ARCH §3.7): they follow |
| overscan by speed | `render/viewport.ts` | rows per distance |
| PageUp / PageDown | `keys/router.ts` | page = ⌊block / h⌋ − 1 rows; over variable rows, a distance `page × h` |
| wheel above the cap | `interact/scrolling.ts` | line and page deltas |
| sticky parents' stack and the room above a row | `tree/index.ts` (`stickyStack`, `insetFor`) | copies' heights from the layout, cap half the view by `h` |
| detail / sparse layouts | `detail/index.ts` `layoutFor` | data rows `h`, panels their own (measured heights carried over by `was`) |
| tree | through the layout and the stack only | — |
| motion FLIP | `motion-gsap` | reads element boxes, not `h`: nothing to do |
| Angular | `packages/angular/src/grid.ts` | no input yet |

**Design.**
- `GridSettings.rowHeight?: number`, live (`UPDATE_POLICY`). Valid: a finite number from 24 (WCAG 2.5.8's
  target size) to 1 000. Like a density's height it is CSS px at 16 px text and scales with the reader's
  text size (WCAG 1.4.4): `round(rowHeight × remPx / 16)`.
- Invalid (NaN, a string, < 24, > 1 000): a **warning** problem `invalid-setting` (new core code, path
  `settings.rowHeight`, detail the raw value), at creation and on an `update` that brings it; the density's
  height is used.
- Header rows follow (one height for the grid, as with densities); a separate header height is not part of D1.
- A live change (row height or density) keeps the top row at the same fraction (existing) **and** the
  focused row in view if it was in view before (WCAG 2.4.11): `ensureVisible` after the new mapper, the
  stack's room scaled to the new height.

**Files.** `packages/core/src/problems.ts` (code); `packages/dom/src/{settings,update,grid,context}.ts`,
`render/viewport.ts` (focus kept); `packages/angular/src/grid.ts` (input, if the 6 300 budget holds);
tests `packages/dom/test/row-height.test.ts` (+ `update-policy` expectations, Angular `inputs.test.ts`);
sheet `docs/behaviors/virtual-scroll.md` (« Row height »).

## Done (2026-10-23, not committed)

**rowHeight (owner D1).** Blueprint §6 followed. Sheet: `docs/behaviors/virtual-scroll.md` « Row height » (also
`theming.md`, `angular-parts.md`). Code: `GridSettings.rowHeight` (live), `rowPx` / `rowHeightProblems`
(`settings.ts`), `g.rowHeight()` reads it (`grid.ts`), the warning at creation (`grid.ts`) and on `update`
(`update.ts`, beside the refused changes), new core code `invalid-setting`; `render/viewport.ts`: a live
row-height change keeps the focused row in view if it was (WCAG 2.4.11), under its pinned parents.
Tests first, `packages/dom/test/row-height.test.ts` (26): 23 failed before the setting existed (scroll
math, header and body, text size, top row kept, PageUp/PageDown, detail heights, 1 M rows past the cap,
the sticky stack, 10 invalid values, the boundaries, live warnings; `null` is no value: passes by design); the 3 focus tests (rows grown, density
changed, tree under pinned parents) failed after the setting and before the viewport change. Deviations to
confirm: header rows follow `rowHeight` (one height for the grid, as with densities); `null` is no value;
the range 24–1 000.
**Angular: not added.** With `[rowHeight]` (and the `defaults` key) `@dzgrid/angular` measured **6 323** B gz
for 6 300: reverted, as the rule says; the owner decides (a grant of ~+50, or no input).
Sizes: dom **21 096** (21 300; +256 over 20 840: the setting, its warning, the focus kept), core 28 932
(29 000; the new code), angular 6 279 (unchanged).

**Demos (playground only, no library budget).** `playground/demos/{seed,flags,orders,hr,page}.ts`,
`demos.css`, `playground/{orders,hr}.html`, four entries in the Démos menu, `vite.config.ts` inputs; the
suite's `packages/dom/test/browser/demos.{html,ts}` imports the same modules; `scripts/browser.mjs`
`demosChecks` (`-- --only demos`, in the full run too; Firefox and WebKit with `--all`: the Arabic page's
checks). Deviations from §2–§3: every order has 1–8 sub-orders (no empty panel); the panel's padding is the
demo's (22 px at the start, none at the end), the panel grid's first column narrower by the measured offset
and its last by what its view lacks (frame, scrollbar gutter kept); the resize grip hidden in panels instead
of `resizable: false` (one column array); HR rows 52 px through `rowHeight` (D1) — the header follows;
pills and discs checked at 4.5:1 in the browser (computed colours), not by `check:contrast`.

**Gate (2026-10-23, once, after the fixes below).** build green; `test:ci` 317 files, **5 050 / 5 050**; `test:perm`
6 / 6; typecheck green; `check:size` 0 over (dom 21 096 / 21 300, core 28 932 / 29 000, angular 6 279 / 6 300,
K.8 81 781 / 83 500); `check:contrast` 570 pairs, 0 under; `test:browser` (full) **620 / 620**; `-- --only demos`
**38 / 38** (twice). Angular unchanged: no fixture run. Fixes found by the first `test:ci` (3 failed): the
conformance case `problems/invalid-setting.json` (every code has one; run through `rowHeightProblems`); the
core seam guard in `layering.test.ts` moved to the measure (28 926 → 28 932, the new code); the detail walk's
density step now expects the top row kept *unless* the focused row, whole in view before, had to be kept in
view (then it sits at the view's edge), and checks that it stays in view. In the browser, a tooltip shown
while axe runs takes the first Escape (WCAG 1.4.13): the HR keys check presses a second one then.

## Done — owner D3–D4 and the review (2026-10-23, not committed)

- **D4, orders:** the nested-grid version is replaced (§2 superseded): one grid, sub-orders as child rows
  (`tree({ parentId, sticky: 1 })`), the same column array, one header; `rowClass` marks them `orders-child`,
  whose background is the app's variable `--orders-child-bg` (demos.css, `color-mix` of `--tz-accent` 8 % in
  `--tz-bg`). No fixed-px panel height or alignment code is left. Browser checks: children right under their
  order at level 2, one header row, no panel; the background differs and follows the variable; 4.5:1 at least
  (13.38 fr, 13.93 ar); RTL edge and indent; a sort and a filter keep each sub-order under its order.
- **D3, Angular:** `[rowHeight]` input and `provideDzGrid` default; budget and rebudget ceiling 6 350; 6 323.
- **Review R1–R7:** R1 `'rowHeight' in patch` and `Object.is` (NaN told once); R2 one helper `g.reveal(i, block)`
  (keys/focus.ts) used by `ensureVisible` and the live change, its top room the larger of the drawn stack and
  the row's own; `rowHeightProblems` moved to update.ts (its `problem` import shared), the conformance case
  through it; dom 21 096 → **21 094** net (the duplicate gone, paid back by R3's probe and floor); R3 the
  default text size read off the live region set to `font-size: medium`, a 24 px floor; the browser suite's
  text-zoom check now sets Chrome's default font size (DevTools protocol) and checks that a page root of 10 px
  leaves rows at 32; R4 demo fonts, discs, links, flags and icons in rem; R5/R6 gone with D4; R7 tests added.
- **Tests that failed first (7):** NaN told twice; 24 px floor (14); a root of 10 px (20); Angular input ×2;
  rebudget ceiling ×2. Pins that passed already: rounding at 18 px, headers live, the stack at 100/40 px, the
  room cap, focus under a growing stack, a focus half under the stack, auto detail heights kept.
- **Gate:** build; test:ci **5 062 / 5 062** (one fix on the way: grid.ts back under 250 lines, the probe set in
  `domGeometry`); test:perm 6 / 6; typecheck; check:size 0 over (dom 21 094, core 28 932, angular 6 323 / 6 350,
  K.8 81 851); check:contrast 570 / 0; test:browser **621 / 621**; `--only demos` 38 / 38; Angular fixture 54 / 54.
