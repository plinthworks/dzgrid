# An edited row that no longer fits the order

Sources: the public documentation of grids that keep edited rows in place until the user asks (what a
user sees: the row stays put after an edit, the list is put in order on demand), ARCHITECTURE K.14
(rows move only on `reapply()`), WCAG 2.2 (3.2.2 no change of context on input, 4.1.3). Phase 5 plan D3,
D8; owner decisions Q6, Q7.

## What the user does
Edits a value in a sorted or filtered list (puts a stock to 0 in a list filtered « stock > 0 », renames
a patient in a list sorted by name); goes on working; then puts the list back in order.

## What they observe
- The edited row stays where it is. If it no longer passes the filter, it is shown greyed.
- A small mark appears on the sorted or filtered header. A screen reader hears once that the order is
  out of date.
- A click on the mark puts the list in order: the greyed row leaves, the sorted row moves to its place.

## Behaviours
1. An edit (any origin) never moves, hides or shows a row before a reapply (K.14): the displayed rows keep
   their order and set. The value shown is the edited one.
2. The core's `orderStale` becomes true when an edit changes a value read by an active sort, a column
   filter or the quick search, since the last run; false after a reapply, a new sort or filter by anyone,
   a reload.
3. A displayed row that no longer passes the filters is **muted** (`data-dzg-stale` on the row, the same
   look as a tree's context row) and, not by colour alone, carries a small sign at the start of its
   first cell (a hollow funnel with a stroke, a shape, also in forced colours); its row header cell's
   description (`aria-describedby`) says `edit.rowStale`, so a reader hears it on arriving in the row.
   It stays focusable, selectable, editable; a selected row is never unselected by it. A row only out of
   sort order is not muted.
4. While `orderStale`, a **reapply mark** shows on every header with an active sort or filter; with only a
   quick search, on the edited column's header. It is a small button (24 × 24 px target, sign + text in
   its name: `edit.reapply`), drawn after the sort and filter marks.
5. On the header cell, **Enter keeps its meaning: it sorts** (and a sort reapplies, 7). **F2** enters the
   header's controls, the mark among them (as other header controls, `parts.md`); there Enter or Space
   presses it, Escape comes back to the header cell. A pointer click presses it.
6. Pressing it (or `rows.reapply()` / `grid.edit.reapply()` from the app) runs filter and sort again
   once: muted rows leave, rows move (with `motion()`, the usual glide). The focus stays on its row if the
   row is still shown, else goes to the nearest row (the existing fallback); when the focus was in the
   body, its cell is scrolled clear of pinned columns, sticky header rows and sticky parents (WCAG
   2.4.11, `editing.md` 26); when it was on the mark, it stays on the header cell.
7. A new sort or filter by the user, or a reload, reapplies as a side effect (the mark goes). So does any
   rerun while the order is stale (a search typed on, a language or zone change, a column shown): it runs
   whole, with the edits; a column resized runs nothing and keeps the mark. A host update that moves rows
   (a sort key or a filter result changed) puts everything in order, the edited rows too (owner S2-O1);
   one that moves nothing keeps the order and the mark — an update of an edited row included: whether it
   passed is read with the edits on both sides. The host giving its rows again (a load) or a refresh puts
   everything in order.
7a. Server grids (owner S2-O2): a fetched set puts edits in order in the browser (no request). On server
   pages, an edit of a column the server sorts, filters or searches marks the order stale too; the reapply
   asks the server for the current page again (one request, the same key). Any answer (another page, a
   new query, a refresh, the reapply's) clears the mark: it comes in the server's order; a failed request
   keeps it. The flip is told at the answer, with source `data`; the reapply itself is an `order` change
   with the command's source.
8. The header reads « {name}, à remettre en ordre » while the mark is on (`header.withStale`, after
   `header.withSort` and `header.withFilter`).
9. Nested grids: each grid its own `orderStale` and marks.
10. Events: `orderStale { stale }` on each change.

## Announcements
| When | Politeness | Key |
|---|---|---|
| `orderStale` goes from false to true (once until the next reapply) | polite, after the save sentence | `edit.stale` |
| reapply by the user | polite | `edit.reapplied` (count of displayed rows) |
| reapply by the app | — | — |

## Texts
| Key | en | fr | ar |
|---|---|---|---|
| `edit.stale` | List order out of date; the header mark puts it back in order | Ordre de la liste à mettre à jour : la marque de l'en-tête remet en ordre | ترتيب القائمة بحاجة إلى تحديث: علامة العنوان تعيد الترتيب |
| `edit.rowStale` (row description) | No longer matches the filter | Ne correspond plus au filtre | لم يعد مطابقًا للمرشح |
| `edit.reapply` (button name) | Put back in order | Remettre en ordre | إعادة الترتيب |
| `header.withStale` | {name}, order out of date | {name}, à remettre en ordre | {name}، بحاجة إلى إعادة الترتيب |
| `edit.reapplied` (plural) | Back in order, {n} rows | Remis en ordre, {n} lignes | one: أُعيد الترتيب، صف واحد ({n}) · two: أُعيد الترتيب، صفان ({n}) · few: أُعيد الترتيب، {n} صفوف · many: أُعيد الترتيب، {n} صفا · other: أُعيد الترتيب، {n} صف |

(en and fr have `one`: « Back in order, 1 row », « Remis en ordre, 1 ligne »; `zero` falls to `other`.)

## Right to left
The mark sits at the header's inline end with the other marks (left in Arabic); the muted look is the
same.

## Choices to confirm
- Only rows failing the filters are muted; a row out of sort order is not.
- The mark on every sorted or filtered header (quick search only: the edited column's header).
- No keyboard shortcut for reapply: the header button (F2 then Enter), a new sort (Enter on a header) or the app's API.
- The muted row's sign is a hollow funnel at the start of its first cell.
- The reapply by the app is not announced.

## Tests (to be written with the code)
Step 2 (done): conformance `edit-order/*` (an edit on the sorted column keeps the order until
`rows.reapply`; a filtered-out edit stays displayed; `orderStale` on/off; reapply notifies once; resize,
search typed on, host updates, a tree, details), `core/test/edit-seams.test.ts` (events, refusals),
`core/test/source-rows-edit.test.ts` (7a). Step 7: muted rows (sign, description), the
mark on the right headers, keys on the mark (Enter on the header sorts, F2 enters the mark), the focused
cell clear of sticky parts after reapply, focus after reapply, one sentence only, selection kept;
browser: axe with the mark, ar RTL. Manual: §19.

## Built at step 7 (2026-10-24)
- 6: after `api.reapply()` with the focus on a cell of the grid, that cell is scrolled into view as a focus move
  would (clear of the pinned columns and sticky parents); the focus itself stays where it is (the cell, or an open
  field, which keeps its text). The focused row is retained, so an open field never loses its cell to a reapply.
- 7a: on a server grid the mark's press asks the page again (one request, the same key) and « Remis en ordre, {n} »
  is said at the answer that puts the order back, with that answer's count; after a failed request nothing is said
  (the mark stays), and a later answer says nothing of the old press. The app's reapply is never said.

## Built at step 4 (2026-10-23)
- 3: muted rows are worked out by `@dzgrid/dom/edit` over the rows holding an edit, with the edits, once per reader, rows, query and state version; not on server pages (owner S4-O3).
- 4–5: the mark is `<button class="dzg-reapply">`, appended last in the header cell; F2 on the header focuses it (tab stop while inside), Escape goes back to the header cell. With a `slots()` header part, F2 goes to the part first; the mark is then reached by Tab from the part.
- The stale sentence is joined after the save's (« … . … ») when both fall in the same task.
- Review of step 4: when the row header is not mounted (its column scrolled out), the sign and the description go to the row's first mounted cell (`data-dzg-stale` on that cell).
