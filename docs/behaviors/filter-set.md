# Ticking values in the filter popup (the set filter)

## What the user does
Opens the filter popup of a column that asks for a value list, types a few letters in its search
box, ticks and unticks values (or "select all"), presses Apply or Escape.

## What they observe
- A search box, a short status line ("120 values"), a "select all" box, then a scrolling list of
  the column's values, each with a box, its label as the cell shows it, and how many rows hold it.
  The list scrolls smoothly whatever its length (2 000 values at most; past that a line says only
  the first ones are shown and asks to refine the search).
- A "blanks" entry first when some rows have no value.
- Typing narrows the list (never the counts, never the filter); "select all" becomes "select all
  shown" and ticks only what is shown.
- In the browser a tick applies after a short pause (several quick ticks give one change); on a
  server nothing is sent before Apply or Enter, and closing without Apply drops the ticks.
- While a server's list loads, the old one stays, dimmed; if it fails, a message and Retry.
- Untick everything: no row is kept (the "no matches" screen shows; Clear brings everything back).

## What DzGrid does
- **Which columns** (owner decision Q2, step 15): only a column that says `filter: { kind: 'set' }`
  (any type) gets the popup (the header button, Alt+ArrowDown, the floating summary as a button).
  An enum column's kind is `set` by default, but **implicitly**: it keeps the behaviour it had (no
  button, no popup; a set filter stored by the host shows "Filter active" and Clear in the floating
  row). A host's own `filter.set` part still resolves for any set column, implicit or explicit.
- **Part:** `filter.set` (a host's part of the same name replaces it). The floating row keeps the
  summary ("Filter active", owner decision Q4: no count of the values ticked).
- **Loaded on first use:** the list is a lazy chunk of `@dzgrid/dom/filters` (owner decision Q3),
  fetched with `import()` the first time a set popup opens, and prefetched when the pointer goes
  over such a column's filter button or the focus onto its header. Meanwhile the popup shows
  `grid.loading` (`role="status"`, `aria-busy`); Clear and Apply already work (Apply keeps the
  filter in force). A chunk that fails: `filter.set.failed` (`role="alert"`) and Retry
  (`grid.retry`), the error reported. `filters({ loadSet })` replaces the `import()` (tests, a host
  serving its chunks its own way).
- **Values:** from the core (`value-list.md`): the part's context gives `values(o?)`, the column's
  `kernel.values` handle, created when the popup opens and closed when it closes (a host's own
  handle on the same column is closed by it: one handle per column). Labels, order (the column's
  sort order, Arabic by the collator), counts and the ticked values with no row all come from it.
  A source without `values` (`available: false`): the column's `enumOptions` as the list, no
  counts, searched locally on their labels (folded); a column without options shows `0 values`.
- **Layout** (one tab stop per control): the search box (`filter.set.search`, `type="text"`,
  `dir="auto"`, no placeholder, no autocomplete); a status line (`role="status"`, polite):
  `filter.set.count {n}` (plural) or `filter.set.truncated {n}`, its first text written before it
  is shown, so opening says nothing; a native check box `filter.set.all` ("Select all"), or
  `filter.set.allShown` ("Select all shown") while a search is typed, checked, unchecked or mixed;
  the list; the footer (Clear, Apply). Tab order: search, select all, list, Clear, Apply.
- **The list:** a `role="listbox"` with `aria-multiselectable="true"`, named `filter.popupLabel
  {column}`, about ten rows high (fixed: loading, an empty list or an error never resizes the
  popup), `aria-busy` while a request is out. Each row is a `role="option"` with `aria-selected`,
  `aria-posinset` and `aria-setsize` (the whole list), named `filter.set.option {label, rows}`
  (`rows` = `announce.rows {n}`), or its label alone when the count is unknown. A row shows a box
  (drawn in CSS, a check mark that stays in forced colours) at the inline start, the label in its
  own direction (`dir="auto"`, cut with an ellipsis, the full text as `title`), the count in the
  grid's digits at the inline end, drawn by CSS from `data-n` (so the row's visible text is its label,
  held whole in its name: label in name, WCAG 2.5.3, axe's `label-content-name-mismatch`). Counts
  are hidden when none is known.
- **Always windowed** (lead decision): one code path for 1 or 2 000 values. Rows have a fixed
  height (1.75rem, at least 24 px, measured from the first row drawn, again on a locale change);
  only the rows in view plus six above and below are in the page (about 25), absolutely placed over
  a spacer of the list's full height. The row holding the focus is never recycled, even scrolled
  far away. Screen readers in browse mode see the rows drawn only (the grid's known limit,
  `a11y-protocol.md` §2 step 6d); `aria-setsize` gives the size.
- **Keys** on the list (roving focus: the active row has `tabindex="0"`, starting on the first
  ticked row, else the first): ArrowDown / ArrowUp (no wrap), Home / End (with or without Ctrl),
  PageDown / PageUp by a view less one row, Space and Enter tick or untick (Enter never applies
  here), a typed letter goes to the next label starting with what was typed in the last 500 ms
  (both folded as the quick search folds them, whatever the grid's locale: no case, no accents, a
  decomposed `é` as a composed one, no Arabic short vowels or tatweel, `أ` / `إ` / `آ` as `ا`; then
  a prefix test: `e` finds `É`, `ec` finds `école`, `مح` finds `مُحمد`, `ا` finds `أحمد` and `آمال`
  under an English, French or Arabic UI). Typing that folds to nothing (a lone vowel mark) moves
  nowhere. A click ticks and focuses.
  In the search box ArrowDown goes to the list (not inside an input method's composition), Enter applies and closes (the popup's rule), Escape
  closes. Up and Down are not mirrored in right-to-left. Ctrl+A and Shift ranges: Phase 6. If the
  focused row leaves the list (a search, a new answer), the focus goes to the nearest row left, or
  the search box when none is left, never to the page.
- **Blanks:** the first row, `filter.set.blanks`, when the list says some rows are blank (a count
  above 0, or unknown on a server), or when the draft ticks them in an `include` (or unticks them in
  an `exclude`), so they can be undone; hidden during a search. "Select all" without a search
  includes them, shown or not (a hidden row at 0 now: unticking everything is `include: []`); "select all shown" never touches them.
- **What "a search" means for select all and its label: the list shown, not the box.** On a server
  the search goes after the pause: a search box just cleared still shows the older searched list
  until then, so the box stays "Select all shown" and acts on those rows only, never on the
  blanks it did not show; it becomes "Select all" when the whole list is asked.
- **The draft** (a pure module): a mode (`include` or `exclude`), a set of values, and whether
  blanks are kept. What it writes: `{type: 'set', include: [...]}` (sorted by code unit), plus
  `blanks: 'include'` when blanks are ticked; or `{type: 'set', exclude: [...]}`, plus
  `blanks: 'exclude'` when they are not. An `exclude` of nothing with blanks kept is no filter
  (null). Unticking everything is `include: []` (owner decision Q1), a filter that keeps nothing,
  not an inactive draft. The mode changes only on a complete list (no search, not truncated, the
  list available and settled: an older searched list still shown while the whole one loads is not complete; without a list
  from the server, the column's options unsearched are complete: unticking all there is `include: []` too): more than half the values ticked turns it into `exclude`, fewer than half into
  `include`, a tie keeps it. A search or a truncated list never turns a draft into `exclude`; one
  already in `exclude` stays so (unticking a found value adds it to the excluded ones).
- **What it edits:** no filter, or a set filter with exactly one of `include` / `exclude` (lists of
  text) and a valid `blanks`. Anything else (combined, both lists) shows "Filter active" and Clear.
- **Apply** (O3): in the browser ticks apply after the pause (`debounceMs`, 150 ms: several ticks,
  a key held or "select all" give one change and one announcement), Apply, Enter and closing apply
  at once; on a server the ticks are a draft until Apply or Enter (one request), and closing drops
  them. A tick that brings the draft back to the filter in force sends nothing, and so does Apply
  on a draft equal to it (compared in its canonical form: a host's `include: ['Oran', 'Alger']`
  reads back as written, not re-sorted into a new request). The list is drawn
  from the draft, never from the stored filter; a filter set from elsewhere rewrites a draft
  nobody is editing.
- **Search:** in the browser each keystroke narrows the list at once (the core searches the
  labels and values, folded). On a server the text goes to the server after the pause
  (`debounceMs`, 300 ms), never during an input method's composition (at its end); the server owns
  the list and its cap. The status line says the new count once the list settles.
- **Loading and errors of the list:** a server's list loading with nothing yet: `grid.loading`
  inside the list's frame, `aria-busy`. Loading with an older list: the older one stays, in the
  muted colour, `aria-busy`. A failure: `filter.set.failed` (`role="alert"`) and Retry
  (`grid.retry`), the older list kept; Retry puts the focus in the search box, then asks again.
- **Announcements:** `announce.filtered {rows}` once per applied change (on a server once the
  answer is in), `filter.set.count` after a search settles; no announcement per tick (the screen
  reader says "selected" / "not selected" from `aria-selected`; one is added only if the by-ear test
  of `a11y-protocol.md` §11 finds a reader silent).
- **Direction, locale, zone:** the handle follows them (labels and order again); the static texts
  and names are rewritten only when they change; a change of direction closes the popup (O9);
  logical sides only.
- **Texts** (8 required keys, breaking: `filters()` throws naming any missing one):
  `filter.set.search`, `filter.set.all`, `filter.set.allShown`, `filter.set.blanks`,
  `filter.set.option`, `filter.set.count`, `filter.set.truncated`, `filter.set.failed`; reused:
  `grid.loading`, `grid.retry`, `filter.clear`, `filter.apply`, `filter.popupLabel`,
  `announce.rows`.
- **Sizes:** the eager proxy (loading, failure, Retry, the editable check) in `@dzgrid/dom/filters`;
  the draft, the windowed list, the search, select all, blanks and the chunk's own layout CSS in
  the lazy line "set (lazy)" (budget 3 800 B gz). The eager part injects the chunk's sheet when it
  loads (once per document or shadow root, `data-dzgrid-set`, with the grid's nonce; not with
  `injectStyles: false`) and hands the chunk its loading / failure helper.

## Tests
- `packages/dom/test/filters-set-draft.test.ts` (the pure draft: ticks, canonical output, sorted
  `include`, default blanks, the half rule and its tie, no `exclude` on a searched or truncated list,
  select all in both modes, `include: []`, seeded runs against the core's own filter).
- `packages/dom/test/filters-set.test.ts` (labels, counts, blanks, select all's three states, live
  pause and flush, a server's draft, close drops, loading / stale / error and Retry, the enum
  fallback, truncated, locale, direction, echo, uneditable, the chunk's loading and failure, the
  handle closed, implicit enum columns without a popup).
- `packages/dom/test/filters-set-keys.test.ts` (2 000 values: rows drawn, posinset and setsize,
  every key, type-ahead in en / fr / ar, Tab order, Enter on a row vs in the search, the focused row
  kept and moved).
- `packages/dom/test/filters-set-server.test.ts` (a source's `values` delayed, failing, superseded;
  search after the pause; input method).
- `packages/dom/test/filters-set-walk.test.ts` (a seeded random walk, in the browser and on a server); `structure.test.ts` (`filters/set/` reached only
  through `import()`).
- Browser: `scripts/browser.mjs` (`filters=1&popup=1&sets=1`, fr light, ar right to left dark);
  perf lines "set filter: …" (`scripts/perf-browser.mjs`, `perf/browser-budgets.json`).
- By ear: `docs/a11y-protocol.md` §11.

## Decisions (step 18, 2026-10-20)
- **The size stays put from loading to loaded:** the status line keeps one line's height while empty (the first load on a server), so the list no longer moves down 32 px when the values arrive. Checked in Chrome on the audit screen, left to right and right to left, first load and a narrower search (`scripts/audit-browser.mjs`, ≤ 1 px).

## The option row's part (feedback pass C, 2026-10-27)
An app paints the rows of the value list with a part of slot `filterOption`, named by the column:
`filter: { kind: 'set', optionPart: 'pill' }` and `parts: { pill: definePart('filterOption', { mount(host, c) { … } }) }`.
The part is told `value` (null for the blanks' row), `label` (the grid's), `count` (a number or null) and `countText`
(in the grid's digits, '' when not shown), `selected`, `blank`, `column`, `toggle()`, and what every part gets. The
grid keeps the row: `role=option`, `aria-selected`, its name « label, count », the roving focus and the keys, the click
(anywhere on the row toggles it; a control of the part's own that calls `toggle()` stops its click), the window over
10 000 values: only the rows drawn have a part, one per row, updated when its tick or text changes, destroyed when the
row leaves the window or the popup closes. The grid's own content steps aside (`data-part` on the row); the part's host
is `aria-hidden` (an option's children are presentational). Its visible text must stay inside the name (WCAG 2.5.3,
axe `label-content-name-mismatch`): draw the count as the grid does, from an attribute by CSS
(`content: attr(data-n)`), or not at all. A part that throws is reported and that row drawn by the grid; an unknown
name is `unknown-part` (error, `columns.<id>.filter.optionPart`, said at each opening) and the default rows; a
`filterOption` part without `filters()` is `missing-feature`. Its data: `ui.data` (parts.md). The playground's
« Retours d'usage » page draws pills. Tests: `packages/dom/test/filters-set-option.test.ts`; Chrome: pills, two
unticked, Apply, scrolled to the end of 2 000 values, axe (`--only filters`).
