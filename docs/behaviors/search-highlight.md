# Searched text highlighted in the cells

Written before the code (CLEANROOM). Owner decisions (2026-11-03) in `phase-9-steps/decisions.md` « Row numbers and
search highlight — owner decisions », which win over this sheet. What a browser's find and a spreadsheet's find show
is named from using them, nothing read.

## What the user does
Types in the quick search field (`quickSearch()`), or in the find bar (Ctrl+F, `find()`), and looks for the letters
typed inside the cells.

## What they observe
1. **The letters typed are tinted inside the cell's text**, not the whole cell: « ver » in « Severine » and in
   « SÉVÈRE ». Every occurrence in the cell.
2. **The same folding as the search itself** (`fold` of the core): no case, no accents, no Arabic short vowels, one
   alef, `ى` as `ي`, one set of digits. What is tinted is the original text the cell shows: « été » typed tints « ÉTÉ »,
   « Ete » tints « Été » (three letters, the accents with them).
3. **Quick search**: each word of the search, wherever it is found, in the columns the search looks in: text and
   lists always, numbers and dates only for a word with a digit (their shown text; a match only through the export
   text, « 2026-03 » finding « 05/03/2026 », tints nothing). Every row shown matched; every mounted cell is tinted.
4. **Find**: the text typed (trimmed), in the hit cells. Find's cell marks stay (the tint and the ring); inside, the
   letters are tinted too, the current hit's more strongly than the others'.
5. **Both at once**: find's tint wins over the quick search's where they meet; the current hit's over both.
6. **Only the grid's own text.** A cell drawn by the application (a part, an Angular `cell()` template) is never
   touched; its part gets the texts searched (`search.quick`, `search.find` in its context, `parts.md`) to tint itself.
   A header, an editor open in a cell, a detail panel, a pinned row: not tinted.
7. **The cell's DOM is not changed.** The tint is drawn by the browser over the text (CSS Custom Highlight API,
   `::highlight()`), so a screen reader reads the cell as before, copy and selection are unchanged, and nothing is
   said (the search already says its count). Where the browser has no such API, there is no tint (the search works
   the same); nothing is drawn instead.
8. **Kept up to date** with the text, the rows, the scroll, a sort, edits, the language; gone when the search is
   emptied, the bar closed, the feature destroyed.
9. **Opt-out per feature**: `quickSearch({ highlight: false })`, `find({ highlight: false })`. On by default.
10. **Colours**: `--dzg-search-mark` (quick search, a soft warning tint), `--dzg-find-mark` and
    `--dzg-find-mark-current` (the find colour, stronger) with the text in `--tz-fg`, 4.5:1 checked in light and
    dark over the cell, the find mark and the selection; forced colours: `Mark` / `MarkText`, the current one
    `Highlight` / `HighlightText`. In `@dzgrid/theme/search.css` (new) and `@dzgrid/theme/find.css`.

## What DzGrid does differently on purpose
- A script whose folding depends on the neighbours (Greek final sigma, Hangul, Indic recompositions) is tinted only
  where folding letter by letter gives the same text as folding the whole: otherwise that cell is not tinted, never
  tinted at the wrong place.
- The highlighting code is loaded at the first search that needs it (a small chunk shared by both features).
