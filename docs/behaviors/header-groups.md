# Collapsible header groups

Written before the code (CLEANROOM). Sources: the public documentation of data grids about column groups
that open and close (a group header with a small button; closed, the group shows fewer columns, often a
summary column), WAI-ARIA 1.2 (`columnheader`, `button`, `aria-expanded`), APG grid, WCAG 2.2 (2.1.1,
2.4.3, 2.5.8, 4.1.2, 4.1.3). Plan D6; owner decision Q-GH (A: own open / closed state, apart from the user's
hidden columns, ~40–80 B core). Grouped headers themselves: `spans.md` (unchanged). Entries: the existing
`@dzgrid/core/spans` and `@dzgrid/dom/spans`, plus a base core seam (the collapse set read by the `shown`
filter).

## What the user does
Clicks the small button in a group header (« Patient » above Nom, Prénom, Âge, Téléphone), or focuses the
group header and presses Enter or Space.

## What they observe
- Closed, the group keeps only the columns the application chose for the closed state (for example Nom), and
  the group header narrows to them; open again, all its columns come back in their places and widths.
- The button's sign shows the state (a chevron pointing to the inline end when closed, down when open).
- A column the user hid stays hidden when the group opens.

## Behaviours (numbered, each one a test)

**Definitions**
1. `ColumnGroupDef.collapsible?: boolean` (default false), `open?: boolean` (initial state, default true);
   child `ColumnDef.groupShow?: 'open' | 'closed'` (shown only when its group is open / closed; absent: in
   both). `groupShow` on a column of a non-collapsible group: ignored, no problem.
2. A group that would show **no** column when closed shows its first child instead (choice 1); one warning
   `invalid-column-group` (path `columns.<group>.children`, reason `empty-closed`).

**State**
3. The open / closed state is **its own state** in the column model (a set of closed group ids), never
   `hidden`: a column is shown when the user has not hidden it **and** every collapsible group above it shows
   it. Re-showing a column in the chooser never opens its group.
4. Nested groups: each one's state is independent; a column shows when every collapsible ancestor shows it.
5. A group split by a move (`spans.md`) keeps one state for all its pieces; each piece has its own button.
6. `GridState.groups` saves `{ id: open }` for collapsible groups whose state differs from their definition
   (`grid-state.md`); the menu's « Réinitialiser les colonnes » brings back the definitions' `open`.
7. Event `columnsChanged` (source `user`) with the new group state; widths of hidden-by-group columns kept.

**The button**
8. A `<button>` in the group header at its inline end, hit area 24 × 24 px, `tabindex="-1"` (the header
   stays one tab stop), `aria-expanded`, named `group.toggle {group}`. The chevron is a shape (forced colours
   `ButtonText`).
9. The group header's own name adds the state: `group.open {group}` / `group.closed {group}` (« Patient,
   groupe ouvert »).

**Keys**
10. Enter or Space on a focused **collapsible group header** toggles it (group headers never sort, so the
    keys are free). Alt+ArrowDown / Alt+ArrowUp: nothing (choice 2).
11. Focus after closing: a column header whose column just went away moves to its group header; a body cell
    in such a column moves to the same row's nearest shown column of the group (the first shown child), else
    the next shown column. Focus on the group header stays.
12. Polite sentence `group.closedSaid` / `group.openedSaid` with the count of columns now shown in the group.

**Elsewhere**
13. The chooser lists group-hidden columns ticked, with `chooser.inClosedGroup` (`columns-chooser.md` 8).
14. Auto-size « toutes » sizes only shown columns; a group opened later keeps the widths its columns had.
15. Print and CSV write the columns shown (a closed group's hidden children are not written, as hidden ones).

## Keyboard

| Where | Key | Result (RTL: same) |
|---|---|---|
| collapsible group header | Enter, Space | open / close |
| collapsible group header | Left / Right, Home / End, Up / Down | moves as `spans.md` (mirrored in RTL) |
| non-collapsible group header | Enter, Space | nothing (as today) |

## Announcements
Polite, one per toggle: `group.closedSaid` / `group.openedSaid`.

## Texts (`locales/{en,fr,ar}-columns`)
| Key | en | fr | ar |
|---|---|---|---|
| `group.toggle` | Open or close {group} | Ouvrir ou fermer {group} | فتح {group} أو طيّه |
| `group.open` | {group}, group open | {group}, groupe ouvert | {group}، مجموعة مفتوحة |
| `group.closed` | {group}, group closed | {group}, groupe fermé | {group}، مجموعة مطويّة |
| `group.closedSaid` | {group} closed, columns shown: {n} | {group} fermé, colonnes affichées : {n} | طُويت {group}، الأعمدة الظاهرة: {n} |
| `group.openedSaid` | {group} open, columns shown: {n} | {group} ouvert, colonnes affichées : {n} | فُتحت {group}، الأعمدة الظاهرة: {n} |

## Right to left
The button at the group header's inline end (left in Arabic); the closed chevron points to the inline end
(mirrored with `scale: -1` under `dir="rtl"`, as the tree's chevron).

## WCAG notes
- 2.5.8: 24 × 24 px button; 2.1.1: Enter / Space on the header; 4.1.2: `aria-expanded` on the button and the
  state in the header's name (`aria-expanded` is not used on the `columnheader` itself, choice 3).
- 2.4.3: the focus never lost when columns go (11); 4.1.3: the toggle said.

## Choices to confirm (not settled by the decisions)
1. A group that would show nothing closed keeps its first child (and warns).
2. Alt+Up / Alt+Down do not close / open a group (only Enter / Space).
3. The state is said in the header's name and on the button, not as `aria-expanded` on the column header.

## Tests (to be written with the code)
Conformance `conformance/cases/header-bands/collapse-*` (shown sets, nested, split groups, user-hidden kept,
empty closed), `packages/core/test/columns-collapse.test.ts`, `packages/dom/test/spans-collapse.test.ts`
(button, keys, focus fallback, sentences, state round trip); browser fr / ar RTL.
