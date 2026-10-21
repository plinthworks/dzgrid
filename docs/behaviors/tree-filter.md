# Filtering a tree

Sources: the public documentation of grids with tree data (what is shown when a filter matches a
row deep in the tree), WAI-ARIA 1.2 (`aria-setsize` and `aria-posinset` of what is shown). Phase 4
plan D4; owner decision Q3 ("seulement ce qui correspond").

## What the user does
Types in a column filter, in the floating filter row or in the quick search while the grid shows a
tree; opens and closes rows while the filter is on; clears the filter.

## What they observe
- The rows that match stay, with every ancestor up to the root, so each match is seen in its
  place. Ancestors that do not match themselves are drawn muted, to tell them from matches.
- The parents on the way to a match open by themselves while the filter is on.
- Rows that match nothing and lead to no match are hidden, children included.
- The count says how many rows match (the muted ancestors are not counted).
- Opening and closing still work while filtered; clearing the filter brings back the tree exactly
  as the user had opened it before filtering.
- The focus stays on its row if the row is still shown, else goes to the nearest ancestor shown,
  else to the first row.

## What DzGrid does
- **Matches and their ancestors** (D4, owner Q3): a row is shown when it matches, or when one of
  its descendants matches. The match test is the same as on a flat grid (filters, quick search,
  custom kinds). `tree.filter: 'ancestors'` is the default; `'subtree'` also shows every descendant
  of a match (for "show me the whole service"), decided per grid.
- **Muted ancestors**: a shown row that does not match gets `data-context-row` on its row; the
  theme dims its text (contrast kept at 4.5:1, WCAG 1.4.3) and screen readers read it as any row.
- **Open while filtered, restored after**: while a filter or a search is active, the displayed
  list opens every ancestor of a match without changing the user's expansion set; the user may
  open and close rows meanwhile (that is a separate, temporary layer). When the filter clears, the
  user's own expansion set is used again, unchanged. No `rowExpanded` event for the automatic
  opening; one for each user action.
- **Counts**: `counts.filtered` is the number of matching rows; the sentence "Filtered. 12 rows"
  says that number.
- **ARIA**: `aria-setsize` and `aria-posinset` count the siblings shown under the filter.
- **Selection**: a filter never selects or unselects rows by itself (`selection.md`); select-all
  takes the matching rows shown (not the muted ancestors unless they match).
- **Server trees** (lazy children, step 7): the server decides what matches; the same muting rule
  applies to the ancestors it sends.

## Where DzGrid differs on purpose
- The muted look is never colour only: the text is dimmed and the row gets no selection mark
  even when its children are selected; a screen reader user hears the same text as for a match
  (the count tells them how many rows actually matched).

## Tests (to be written with the code)
Step 3: `@dzgrid/core/tree` filter stage — property test over 1 000 seeded trees and filters
against a recursive oracle (every match shown with all its ancestors, nothing else in `ancestors`
mode); the expansion set unchanged before and after a filter; target filter 100k ≤ 60 ms.
Conformance `conformance/cases/tree/filter-*`. Step 4: the muted mark and its contrast (theme
test), `aria-setsize` after a filter. Manual: `docs/a11y-protocol.md` §16.
