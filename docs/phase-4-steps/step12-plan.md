# Step 12 plan: the live floating filter row toggle (lead, 2026-10-22)

Plan: `docs/phase-4-plan.md` Part C step 12. Decision: `decisions.md` Q8 (owner, « Oui aux deux »). Sheet:
`docs/behaviors/floating-toggle.md` (step 1). The row itself: `docs/phase-3-steps/step12-floating-blueprint.md`
and `step12-decisions.md` (O3 « fixed at creation » is what this step lifts).

## Findings (read before the plan)
- The base already supports a header row coming and going: `HeaderRenderer.#syncRows` keeps rows by spec
  identity and removes the rest; `aria-rowcount` (viewport), every header `aria-rowindex` (`#frame`) and every
  body `aria-rowindex` (`rows.ts`, written at each paint for each mounted row) are computed from
  `g.headerRows` in the same paint; the keys (`router.ts`: `extras`, Down from level 0), the spans label
  (`--dzg-header-h`) and the tree's pinned layer (re-appended last in the header at each paint) read it live.
  `g.headerRows` is a plain field of the context. So **no base change** is planned: the feature swaps its
  spec in and out of `g.headerRows` and asks for a paint.
- A cell leaving the header is swept by the row's `afterRows` (`sweep`: its pending edit applied, its part
  destroyed). A cell coming back is mounted fresh: its part reads the filter in force (`commit.edits`), it
  dispatches nothing — the « restore without emitting » is the existing mount path.
- The geometry (`box.block = viewport − header height`) is read before the paint that changes the header:
  one follow-up paint after a toggle reads the right height (the window, `viewBlock`, the pinned layer).
- A popup anchored to a floating cell closes at the paint where its cell leaves (`menu.paint`), and its
  fallback is `g.restoreFocus()`, i.e. the kernel's focus.
- The header's filtered mark (`data-dzg-filtered`, the name « …, filtré ») is the popup's `decorate`,
  independent of the row: it stays while the row is hidden.
- Sizes: `/filters` 9 241 (10 000); filter bundles en 707 / fr 831 / ar 941 (800 / 950 / 1 050); dom 20 648
  (21 300); angular **6 176 (6 200: 24 B of room)**; theme 2 268 (2 500).

## API
```ts
// @dzgrid/dom/filters
interface FiltersFeature { readonly floating: FloatingToggle; … }
interface FloatingToggle {
  get(): boolean;               // the row shown (before the grid: what it will start with)
  set(on: boolean): void;       // no-op when equal; works before the grid exists (taken at setup)
  bind(button: HTMLElement): () => void;  // a click toggles (source user, announced); returns the unbind
}
```
- Start state: `set()` made before setup, else `filters({ floating: true })` or a column's `filter.floating: true`.
- Which columns get a field when shown: as before (`filter.floating`, else `filters({ floating })`); when no
  column and no option asks (the row starts hidden), every filterable column (otherwise `set(true)` would show
  an empty row).
- `bind`: `aria-pressed` follows every change (API, Angular, another bound button); `aria-controls` = the grid
  (`role=grid` element, given an id `dzg-g<n>` when it has none); an icon button (no text of its own) gets
  `aria-label` from the bundle (`filter.floatingToggle`), kept in step with the language at each paint; a button
  with its own text keeps it (WCAG 2.5.3). Bound before the grid: synced at setup. Unbind removes the listener
  and `aria-pressed`.
- `openFilter`'s rule applies: one feature object, the last grid it was set up on.

## Behaviour
- Hide: a kernel focus on the row (header level ≥ 1) moved to the same column's header (level 0), source
  `user` for a bound button, `api` for `set`; then the spec leaves `g.headerRows`: one paint (header rows,
  aria-rowcount, rowindex; its sweep applies the row's pending edits, timers cancelled; a DOM focus lost with
  the row goes to the grid's focus), one follow-up paint (the view's height). As planned first: an explicit
  flush and `g.restoreFocus` — removed, see Results.
  Filters stay in the query (never cleared).
- Show: the spec goes back at the end of `g.headerRows`; the cells mount from the filters in force; no
  `filterChanged`, no « Filtré » sentence.
- Announcement on the user's toggle only (a bound button): `announce.floatingHidden` « Ligne de filtres
  masquée » / `announce.floatingShown` « Ligne de filtres affichée ». Not for `set()` nor Angular's input.
- No kernel event (a core change): the host knows the state from its own calls and the button.

## Angular
`[floatingFilters]` (input, live): `undefined` leaves the feature's state; a value is `set()` on the
`filters` feature among the features (by id, duck-typed: the wrapper never imports `@dzgrid/dom/filters`),
only when the input changes (a user's toggle is never overwritten by an unrelated change: echo-free).
One-way: the sheet's « two-way » would need a change listener and an output; with 24 B of room it cannot fit
(measure first; if even the input does not fit, report and stop as the owner asked).

**Measured: it did not fit; owner decision Q16 (budget 6 250): added as below, measured 6 236.** With the effect below, `@dzgrid/angular` is **6 236** B gz (6 200); as a plain
settings key (`'floatingFilters'` in `KEYS`, read by the feature) **6 220**: the input declaration alone costs
about 40 B. Not added; the owner decides (a budget of 6 250, or nothing: an Angular host already holds the feature
object and can call `floating.set` / `bind`). Tests: `packages/angular/test/floating-filters.test.ts` (5 tests;
3 failing without the input, 5 passing with it), and the code:
```ts
readonly floatingFilters = input<boolean>();
// in the constructor:
effect(() => {
  const on = this.floatingFilters();
  if (on !== undefined) for (const f of (this.features() ?? this._defaults['features'] ?? []) as { floating?: { set(on: boolean): void } }[]) f.floating?.set(on);
});
```

## Texts
`filter.floatingToggle` (« Ligne de filtres » / « Filter row » / « صف عوامل التصفية »), `announce.floatingHidden`,
`announce.floatingShown` in `locales/{en,fr,ar}-filters` (required by `filters()`, FILTER_KEYS). Arabic checked
by bytes (no stray marks).

## Tests first (`packages/dom/test/floating-toggle.test.ts`, then Angular, browser)
API get/set/bind (before and after creation, unbind, aria-pressed, label, language change), hide/show counts
(aria-rowcount, header and body rowindex, with spans bands), filters stay active and marked, pending edit
flushed (fake timers mid-flight), focus in the input / on the cell → header same column, kernel focus on the row
without DOM focus, popup open from the row, show restores inputs without event or sentence, announcements, RTL,
column moves and horizontal scroll while hidden, a seeded walk mixing toggles, typing, timers, popup, moves and
scroll (invariants: header rows = 1 + shown, rowcount, rowindex, no lost edit, focus never on a removed node).
Angular: `[floatingFilters]` live, echo-free. Browser (`--only filters`): fr light and ar RTL dark, both states
axe 0, focus moved, rowindex, pinned columns and tree layer aligned (top of the first body row = header bottom).

## Results (2026-10-22)
- Code: `filters/toggle.ts` (new: the state, `bind`, the marks), `filters/index.ts` (wiring: the spec in or out of
  `g.headerRows`, the sentences, a follow-up paint), `filters/floating.ts` (always built; `leave()` moves the
  grid's focus), `filters/resolve.ts` (every column when none asks), `messages.ts` and the three filter bundles.
  No base change.
- Simpler than planned (two mutants survived, the code was redundant): the paint that removes the row already
  applies its pending edits (`sweep`) and gives a lost DOM focus back to the grid's focus (`held`), so `leave()`
  only moves the grid's focus.
- Tests: `floating-toggle.test.ts` 30 (28 / 28 failing first); browser `--only filters` 12 / 12 (fr icon button,
  ar RTL groups pins box, tree pinned parents fr / ar); mutants 18, 16 killed, 2 removed as redundant.
- Sizes: `/filters` 9 728 (+487; the plan said +150–250: `bind`'s marks, `aria-controls` id, unbind, the
  language follow), bundles 745 / 876 / 997, dom 20 648, angular 6 236 (6 250, Q16), K.8 profile 80 102.
- After Q16: `test:ci` 301 files / 4 803 tests green; Angular fixture 54 / 54; real Angular example 86 848 B gz (87 000).
