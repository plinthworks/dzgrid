# Recipe: time-slot column groups (step 16d, forecast F:P2, F:P16)

A screen whose columns are the quarter-hours of a day, grouped by what can still be done with them (the
owner's tree screen: PAST, REAL_TIME, ADJUST_A, ADJUST_B). Nothing here is a grid feature: the application builds
the columns, the grid keeps what the user did to them. 0 B.

## Build the slots with tzslot
A day has 96 quarter-hours, 92 on the day the clocks go forward and 100 on the day they go back. Never count them
by hand: ask tzslot for the day's slots in the market's zone, and make one column per slot, its id stable for the day
(`s0915`, or the slot's instant), its header the local time.

```ts
const slotColumn = (s: Slot): ColumnDef<Row> => ({ id: s.id, header: s.label, width: 64, type: 'number', align: 'end' });
const groups = (slots: readonly Slot[], now: InstantMs): ColumnOrGroup<Row>[] => [
  { id: 'PAST', header: t('past'), children: slots.filter((s) => s.end <= now).map((s) => ({ ...slotColumn(s), editable: false })) },
  { id: 'REAL_TIME', header: t('realTime'), children: slots.filter((s) => s.start <= now && now < s.end).map(slotColumn) },
  { id: 'ADJUST_A', header: t('A'), children: /* … */ [] },
  { id: 'ADJUST_B', header: t('rr'), children: /* … */ [] },
];
```

## When « now » crosses a slot
Give the grid the new groups: `grid.update({ columns: groups(slots, now) })` (Angular: a new `[columns]`), or
`dispatch({ type: 'columns.set', defs })`. The widths and the order the user set are kept **by id**; a slot that moved
into PAST becomes read-only through its own `editable: false`. Tested: `packages/core/test/columns-regroup.test.ts`,
conformance `header-bands/regroup-slot.json`.

## Colours and labels of a group
Every group header cell carries `.dzg-hgroup[data-g="<group id>"]` (stable from 1.1.0, header-groups.md « Styling
hook »). Colour it from the application's sheet with variables, never a hex in a component:

```css
.dzg-hgroup[data-g='REAL_TIME'] { background: var(--app-realtime-bg); color: var(--app-realtime-fg); }
```

To hide PAST's label keep a real `header` (it stays the group's accessible name) and hide it visually
(`.dzg-hgroup[data-g='PAST'] .dzg-hlabel { clip-path: inset(50%); }` or the app's visually-hidden class). An empty
`header` shows the id.

## A language change (F:P16)
Give new `columns` (headers in the new language) **and** new `messages` (and `locale`) together; the grid keeps the
user's widths and order by id, as above.

## Scroll to the current slot
`ensureColumnVisible(slotId)` (`grid.api`, Angular's `DzgController`): the column only, sideways; the rows, the block
scroll and the focus unchanged (column-layout.md). Right to left, the same column comes into view from the other side.
