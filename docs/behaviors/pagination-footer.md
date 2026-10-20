# The pagination footer (pager, count, selection)

How the pages themselves work (sizes, clamps, cursors, a server's answers) is in
`server-pagination.md`; what "select all" means across pages is in `selection.md` and
`server-selection.md`. This sheet is the strip under the rows (step 17, plan
`docs/phase-3-steps/step17-pagination-blueprint.md`, decisions `step17-decisions.md`).

## What the user does
Moves to the next, previous, first or last page with the buttons under the grid; picks another
number of rows per page; reads where they are ("51 to 100 of 1 234"); ticks every row of a page and
then asks for every row of the query; clears the selection.

## What they observe
- A strip under the rows: on the reading start side, what is selected and where they are; on the
  reading end side, the pager. In Arabic the whole strip is mirrored (first page at the right), the
  arrows point the reading way, the digits are never reversed.
- "51 to 100 of 1 234" (words, not a dash). Filtered: "51 to 100 of 230 (1 234 in all)". A server that
  does not know its total: "51 to 100", and the pager says "Page 3" (no "of …").
- The pager: first, previous, "Page 3 of 25", next, last, and "Rows per page". A button that cannot act
  is dimmed but keeps its place and its focus. A cursor server cannot jump to the end: no "last".
- After a click on Next the focus stays on Next, the rows go back to the top, and the new page is read
  out once: "Page 3 of 25. 101 to 150 of 1 234". On a slow server nothing is said until the answer.
- With every row of the page ticked and more rows matching: "Select all 1 234 rows". Rows ticked on
  other pages: "12 rows selected (some not shown)". "Clear selection" empties it.

## What DzGrid does
- **A feature in its own entry** (`@dzgrid/dom/pagination`): `pagination({ footer? })`. The base has no
  footer: the feature appends `div.dzg-footer` as the last child of the grid's root, outside
  `role="grid"` (never counted in `aria-rowcount`). Its texts come in their own bundles
  (`@dzgrid/dom/locales/<lang>-pagination`, spread into the grid's messages); a missing key throws at
  setup, naming it.
  ```ts
  import { pagination } from '@dzgrid/dom/pagination';
  import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
  createGrid(host, { pagination: { pageSize: 50 }, messages: { ...FR, text: { ...FR.text, ...FR_PAGINATION.text } }, features: [pagination()], … });
  ```
- **Its parts:** `footer.selected`, `footer.count`, `footer.pager`, in that order by default
  (`footer: ['footer.selected', 'footer.count', 'footer.pager']`, fixed at creation). Each is a part of
  the `footer` slot (`parts.md`): a host's part of the same name replaces it; a host's own part (a name
  without a dot) may be listed. A name that is not a `footer` part is skipped and told
  (`unknown-part`, `pagination.footer[i]`). The grid keeps the `<nav>` landmark and its name around
  whatever draws `footer.pager`. Mounts equal destroys; a part that throws is destroyed, its host left
  empty, the error reported, not tried again until its context changes.
- **The landmark:** `<nav aria-label="Pagination, Patients">` (`pager.label`, the grid's `label` or the
  bundle's `grid.label`): two grids with their own names give two distinct landmarks.
- **Without paging, dormant:** `pagination()` on a grid whose rows are not paged draws nothing and is
  told (`invalid-page`, warning, `features.pagination`). Paging on (`pagination` setting, or a
  source's pages) with no `pagination()`: `missing-feature` (warning, `settings.pagination`, detail
  `pagination`), the pages still work through `page.go` and `page.size`.
- **The pager:** native buttons, each at least the target size (24 px): first, previous, the page text,
  next, last; then a native `<select>` labelled "Rows per page" with the model's sizes (the current
  size added when the host's list lacks it; hidden with fewer than two), its digits in the grid's
  numerals. No list of page numbers and no "go to page" box (Phase 5).
  - A button that cannot act has `aria-disabled="true"`, never `disabled`: the focus never falls to the
    page's body; its click does nothing and asks nothing. First and previous on the first page; next
    when there is no next page (`hasNext`); last when on the last page.
  - **Last:** with a known total and pages that can be asked directly (offset, or the browser). Offset
    with an unknown total: shown, never enabled. By cursor: not drawn.
  - Next reads the page at the click: on a server the page asked shows at once (its rows kept, dimmed,
    until the answer); by cursor a second click before the answer does nothing (no next cursor yet).
  - An update changes the texts and `aria-disabled` only: the buttons are the same nodes, the focus
    stays where it is. PageUp and PageDown keep scrolling the rows; the pager has no keys of its own.
- **The count** is plain text, not a live region: `count.range` "{from} to {to} of {total}"; filtered
  with a known total that differs, `count.filtered` "{from} to {to} of {filtered} ({total} in all)";
  unknown total, `count.rangeOpen` "{from} to {to}". No rows: `announce.rows` ("0 rows"). Loading:
  `grid.loading` (and `data-loading` on the count); a failure: `grid.error` (Retry stays in the
  overlay, the pager stays usable).
- **What is selected** (hidden while the selection mode is `none` or nothing is selected):
  `announce.selected` ("12 rows selected"); when some selected rows are not on the page shown,
  `selected.hidden` "{selected} (some not shown)"; every matching row with an unknown count,
  `announce.selectedAll`. Buttons: "Clear selection" (`selected.clear`) whenever something is selected;
  "Select all {n} rows" (`selected.selectAll`, plural on n, the filtered count) when the mode is
  `multi`, the selection is not already every row, every row of the page is ticked, and more rows
  match than the page shows (count known). It selects every row the filters and the search match, on
  every page (`selection.allFiltered`: everything-except, tied to the query). After it the focus goes to
  "Clear selection"; after Clear, back to the grid.
- **The header box on browser pages** (owner decision Q1 of step 17, closing Q2 of step 7): it acts on
  the page shown only. Ticking it adds the page's rows to the selection (rows ticked on other pages
  stay ticked); unticking it, when the page is all ticked, removes the page's rows only. Ctrl+A follows
  the box. Over an all-pages selection (everything-except) the box ticks every unticked row again, as
  before (`selection.md`). On server pages nothing changes: the box selects the whole query.
- **Announcements:** after the user's own page change (a pager button, the size), once the rows are
  settled: `announce.page` "Page {page} of {count}. {range}", unknown total `announce.pageOpen`
  "Page {page}. {range}", through the grid's live region. In the browser at once, on a server once the
  answer is in; a request replaced by a newer one waits for the last answer; nothing on a failure
  (the grid says the error), nothing for a disabled button, nothing for a host's `page.go`. A filter or
  search sending the grid back to page 1 keeps its own sentence.
- **A page change** scrolls the rows back to the top (`modelUpdated` of kind `page`; a refresh keeps
  the scroll). The grid's cell focus keeps its column and takes the row at the same index (the core).
- **Layout:** injected CSS without colour (`:where`, logical properties, wraps on a narrow screen,
  no horizontal scroll at 320 px). The theme gives the colours; disabled buttons in the muted colour
  with a not-allowed cursor; chevrons drawn in CSS and mirrored right to left.
- **The overlay stops above the footer:** the feature measures the footer and sets
  `--dzg-footer-size` on the grid's root; the overlay's `inset-block-end` reads it.

## Tests
`packages/dom/test/pagination.test.ts` (en, fr, ar: client, offset, cursor, unknown total, texts,
digits, focus, announcements, the selection strip, the header box, parts, missing feature, dormant,
overlay variable, structure), `pagination-walk.test.ts` (seeded random walks, `WALK_SEEDS`,
`WALK_SEED`), `conformance/cases/selection-across-pages/box-union-browser-pages.json`; browser checks in
`scripts/browser.mjs` (`paging=client` French light, `paging=cursor` Arabic right to left dark); by
ear: `docs/a11y-protocol.md` §13.
