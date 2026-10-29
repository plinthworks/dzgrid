# New rows after a refresh

Written before the code (CLEANROOM). Plan: `docs/phase-6-steps/step16-plan.md` C4 → 16h; owner answer Q16-9 = A
(decisions.md « Step 16 — owner answers »). Behaviour borrowed from what the owner's alarm screen needs: a list refreshed
by the server (an SSE message, then `rows.refresh`) where the operator must see at a glance which rows just came in.
Needs `sameRow` (step 16e, row-identity-transactions.md « Rows compared by value ») for a full reload or a server's
answer: without it such a reload is a reset and has no « added » rows.

## What the user does
Watches a live list. The server says something changed; the grid asks the page again (or the app reloads the rows).
Then reads, scrolls, sorts, filters, turns pages.

## What they observe
- The rows **that were not there before** the refresh are tinted, with a **bar at the row's inline start** (left in
  French, right in Arabic): not colour alone. The rows that were already there look unchanged.
- The mark stays **5 seconds**, then goes. It is still: no fade, no blink, no movement; under reduced motion it is the
  same mark for the same time.
- A screen reader hears **one sentence** for the refresh, polite: « 3 nouvelles lignes » / « 3 new rows » / Arabic,
  with the language's plural forms. Nothing when no row is new.
- Nothing is marked or said:
  - on the **first load** (nothing is new on an empty grid's first rows: the store calls it a reset);
  - when the user turns a **page**, **sorts** or **filters** (a server's new answer for a new page or query: a new
    list, not arrivals);
  - when more than half the rows changed (the store's reset: a new list);
  - for a full reload or a server's answer **without `sameRow`** (always a reset); a server source without `sameRow`
    tells one warning at setup (below).
- A row marked keeps its mark for the rest of its 5 s wherever it is shown: after a sort or a filter that keeps it,
  when the user **scrolls** it into view later (virtual scroll: it was not drawn when it came), when the user turns to
  the page where it landed (the browser's own pages). Past its 5 s it shows unmarked, even if never seen.
- A row element reused for another row (pooled while scrolling) loses the mark at once.

## What DzGrid does
- **API**: a feature of its own, `freshRows({ ms })` from `@dzgrid/dom/fresh-rows` (a grid without it pays nothing):
  `ms` the mark's time, **5000** by default; a finite number from 0 to 60 000. Anything else takes 5000 and tells one
  `invalid-setting` warning (path `freshRows.ms`), never a throw.
- **Texts**: `locales/<lang>-fresh` (`FR_FRESH`, `EN_FRESH`, `AR_FRESH`), key `announce.fresh` (`{n}`), added to the
  grid's messages like the other feature bundles; `freshRows()` throws at setup naming a missing key (as
  `pinnedRows()`): a bundle error, found at once.
- **What counts as new**: the rows a live change of the rows **added** — a client transaction or `update({ rows })`
  read as a delta, or a server's answer for the **same page and query** read as a delta (with `sameRow`) — and that the
  query keeps (shown on some page). The model's change says it (`kind: 'rows'`, transaction `delta`, its `added`);
  the feature never compares rows itself.
- **The mark**: `data-dzg-fresh` on the row element while its time runs, written at each paint on the rows drawn
  (compared first: an unchanged paint writes nothing). Each refresh starts its own 5 s for its rows; a row removed and
  added again starts again. The time is counted by a timer per refresh (no clock read); when it ends the rows are
  repainted.
- **Its look** (`@dzgrid/theme/fresh-rows.css`, loaded with the feature, after dzgrid.css): the row and its pinned
  segments tinted with `--dzg-fresh-color` at 14 % over the background, at the base row's weight (hover, the focused
  row, a selection and stale rows keep theirs); a 3 px bar (`--dzg-fresh-bar`) at the inline start of the start
  segment, sticky with it, above the cells; `Highlight` in forced colours. `--dzg-fresh-color` defaults to the
  palette's **success** (green): a hue apart from the selection (the accent) and from the value flash (the warning);
  a showcase theme whose flash is already success (Bootstrap) takes the warning instead. Checked by `check:contrast`
  in every showcase theme, light and dark: the text on the tint 4.5:1, the bar on the tint and on a selected row 3:1,
  its hue 60° at least from the accent and from the flash.
- **Said**: `announce.fresh` with `n` the rows marked, once per refresh, through the grid's live region.
- **The keys to the app**: `freshRows({ rowsArrived: (keys, source) => … })`, once per refresh, when its rows are taken
  as new (their marks drawn at the paint that follows): the keys only, never row data, and the change's source (`data`
  for a server's answer), so an app can count them; a throw is reported (`window.reportError`), never stops the marks.
  Not a `GridEvent`: a new member of that 1.0.0 union would break an app's exhaustive switch (`check:api`); the owner
  may decide it later.
- **Reach**: the screen only. Never exported, printed or copied; the selection, the focus and the order untouched;
  nothing saved in a `GridState`.
- **Server without `sameRow`**: one `missing-feature` warning at setup (path `freshRows`, detail `sameRow`); the
  feature stays on (a client delta still marks).
- **Destroyed** (`destroy()`, or the feature removed): the timers cancelled, the listeners gone, every mark removed
  from the rows drawn.

## Where DzGrid differs on purpose
- The mark is still and timed, never « until the next click » (owner Q16-9 A over B).
- A refresh that changes more than half the rows marks nothing: it is read as a new list.
- An empty grid's first rows are never marked, even when they arrive by a live change.

## WCAG notes
- 1.4.1: the bar marks the row besides the tint. 1.4.11: the bar 3:1 on its surfaces. 1.4.3: the text 4.5:1 on the
  tint. 4.1.3: the count is told through the polite live region, once. 2.3.3: nothing moves.
