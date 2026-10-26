# The group drop zone (protocol in Phase 6, zone in Phase 7)

Written before the code (CLEANROOM). Sources: the public documentation of data grids about a « row group »
panel above the grid (drag a column header there to group rows by it; each grouping column shows as a
removable chip; chips can be reordered), WAI-ARIA 1.2 (`toolbar`, `button`), APG « toolbar », WCAG 2.2
(2.1.1, 2.5.7, 2.5.8, 4.1.3). Plan D12; owner decision Q-G (A: Phase 6 prepares the header drag protocol and
writes this sheet; the visible zone and its chips « Nom × » come in Phase 7 with grouping). **Nothing of this
sheet is visible in Phase 6** except through an application's own registered target.

## Part 1 — the drop protocol (Phase 6, `@dzgrid/dom/columns`)

1. `columns().dropTargets.add(element, { accept(column) → boolean, drop(column) → void, label? }) → remove()`.
   Any element of the page may be a target (inside the grid's root or outside it).
2. During a header drag (`column-move.md`), when the pointer is over a registered target whose `accept`
   returns true: the insertion bar is hidden, the target gets `data-dzg-drop="over"` (styled by the host, or
   by the Phase 7 zone), the ghost stays. `accept` false: the target is ignored (the drag goes on as a move).
3. Release over an accepting target: `drop(column)` is called once; **no `column.state` patch**, no
   `columnsChanged`; the column stays visible (hiding a grouped column is Phase 7's choice). Escape over a
   target cancels, as every drag.
4. A thrown `accept` counts as false; a thrown `drop` is caught, one `invalid-drop-target` problem (path, no row
   data). A target removed during a drag is ignored from then on.
5. A target registered on one grid accepts drags from that grid only (a nested grid's headers do not reach the
   outer grid's targets).
6. No keyboard path in Phase 6 (there is nothing to drop on without grouping); in Phase 7 the column menu gets
   « Regrouper par cette colonne » (the WCAG 2.5.7 way).
7. Touch: no header drag (Q-M3), so no drop by finger.

## Part 2 — the zone (Phase 7, `@dzgrid/dom/group-zone`; to be confirmed when Phase 7 is planned)

**What the user does**: drags a header into the band above the grid; reorders the chips; removes one with its
×; or uses the column menu's « Regrouper par cette colonne ».

**What they observe**: an empty band with the text « Glissez une colonne ici pour regrouper »; after a drop, a
chip « Nom × » and the rows grouped by Nom; a second chip groups inside the first; × removes the grouping.

8. The zone is a `toolbar` (named `zone.label`) above the header, its chips `button`s in grouping order (logical:
   the first on the start side, on the right in Arabic), each with a × button (24 × 24 px) named
   `zone.remove {column}`. Empty: the text `zone.empty`.
9. Keys (APG toolbar): one tab stop; ArrowRight / ArrowLeft between chips (mirrored in RTL), Home / End;
   Delete or Backspace on a chip removes it (sentence `zone.removed`); Ctrl+Shift+ArrowRight / Left moves a chip
   one place (the same keys as moving a column, `column-move.md` 14), sentence `zone.placed`.
10. Pointer: drag a chip to reorder; drag a chip out of the zone: nothing (removal is by × or Delete only).
11. Sentences: `zone.grouped` after a drop or the menu item, `zone.removed`, `zone.placed`.
12. The zone's state (the grouping columns) belongs to Phase 7's `GridState` part.

### Texts (Phase 7, `locales/{en,fr,ar}-group`; recorded now for the Arabic reader)
| Key | en | fr | ar |
|---|---|---|---|
| `zone.label` | Row grouping | Regroupement des lignes | تجميع الصفوف |
| `zone.empty` | Drag a column here to group | Glissez une colonne ici pour regrouper | اسحب عمودًا إلى هنا للتجميع |
| `zone.remove` | Stop grouping by {column} | Ne plus regrouper par {column} | إلغاء التجميع حسب {column} |
| `zone.grouped` | Grouped by {column} | Regroupé par {column} | مجمّع حسب {column} |
| `zone.removed` | No longer grouped by {column} | Plus regroupé par {column} | لم يعد مجمّعًا حسب {column} |
| `zone.placed` | {column}: level {n} of {total} | {column} : niveau {n} sur {total} | {column}: المستوى {n} من {total} |
| `menu.groupBy` | Group by this column | Regrouper par cette colonne | التجميع حسب هذا العمود |

## Keyboard (Phase 7)

| Where | Key | LTR | RTL |
|---|---|---|---|
| chip | ArrowRight / ArrowLeft | next / previous chip | previous / next chip |
| chip | Home / End | first / last chip | same (logical) |
| chip | Delete, Backspace | remove | remove |
| chip | Ctrl+Shift+ArrowRight / Left | move one place toward the end / start | mirrored |

## Announcements
Phase 6: none (the application's target speaks for itself). Phase 7: 11.

## WCAG notes
- 2.5.7: the menu item is the no-drag way (Phase 7); 2.5.8: chips and × at 24 × 24 px; 4.1.3: changes said.

## Choices to confirm (not settled by the decisions)
1. The dropped column stays visible (Phase 6 protocol does not hide it; Phase 7 may).
2. Dragging a chip out of the zone does not remove it.
3. Targets are per grid (a nested grid's headers never reach the outer grid's zone).

## Tests (Phase 6, with the code)
`packages/dom/test/columns-drop-targets.test.ts` (accept / drop, no patch, thrown callbacks, removed target,
Escape, nested grids). Phase 7: the zone's own tests.
