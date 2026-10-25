import { describe, it, expectTypeOf } from 'vitest';
import type { DisplayIndex, RowKey, Day, InstantMs, DisplayedRows, ColumnDef, EditableRule, EditChecks, FilterKind, GridEvent, LocaleCtx, Json, SaveOrigin, CellAddr, CellRange } from '@dzgrid/core';
import type { PlannedCell, RangeBox } from '@dzgrid/core/range';
import type { CellInput, SaveRequest } from '@dzgrid/core/edit';

/**
 * Invariants held by the type system. Each `@ts-expect-error` line must stay
 * an error: if a change makes it compile, `npm run typecheck` fails.
 */
describe('branded types', () => {
  it('never take a plain number for a display position', () => {
    expectTypeOf<number>().not.toMatchTypeOf<DisplayIndex>();
    // @ts-expect-error — a number is not a DisplayIndex
    const i: DisplayIndex = 3;
    void i;
  });

  it('never take a plain string for a row key or a day', () => {
    expectTypeOf<string>().not.toMatchTypeOf<RowKey>();
    expectTypeOf<string>().not.toMatchTypeOf<Day>();
    // @ts-expect-error — a string is not a RowKey
    const k: RowKey = 'd:1:a';
    // @ts-expect-error — a string is not a Day
    const d: Day = '2026-03-05';
    void k;
    void d;
  });

  it('keep days and instants apart', () => {
    expectTypeOf<Day>().not.toMatchTypeOf<InstantMs>();
    expectTypeOf<InstantMs>().not.toMatchTypeOf<Day>();
    // @ts-expect-error — a number is not an instant without parsing
    const t: InstantMs = 0;
    void t;
  });

  it('never let a number address a displayed row', () => {
    const shown = null as unknown as DisplayedRows<unknown>;
    // @ts-expect-error — nodeAt takes a DisplayIndex, which only index() makes
    const f = () => shown.nodeAt(3);
    void f;
  });
});

describe('the edit seams (Phase 5 step 2)', () => {
  type Row = { id: string; stock: number };
  it('an editable rule reads the row and the context; validate the value, the row and the context', () => {
    expectTypeOf<EditableRule<Row>>().toEqualTypeOf<boolean | ((row: Readonly<Row>, context: unknown) => boolean)>();
    const col: ColumnDef<Row, number> = {
      id: 'stock',
      editable: (row, context) => row.stock >= 0 && context !== null,
      validate: (value, row, context) => (value !== null && value < 0 && row.id && context ? 'min' : null),
    };
    void col;
    // @ts-expect-error — a rule returns a boolean
    const bad: ColumnDef<Row, number> = { id: 'stock', editable: () => 'yes' };
    void bad;
  });

  it('a kind whose test or wire takes two or three parameters is still a kind; the context comes last', () => {
    const old: FilterKind<Json, number> = { name: 'old', read: (s) => s as Json, active: () => true, test: (_s, _ctx: LocaleCtx) => (v) => v === 1 };
    const withContext: FilterKind<Json, number> = {
      name: 'ctx', read: (s) => s as Json, active: () => true,
      test: (_s, _ctx, context) => (v) => v === (context as number),
      wire: (s, _ctx, _zone, context) => ({ s, c: context as Json }),
    };
    void old;
    void withContext;
    expectTypeOf<Parameters<NonNullable<FilterKind['test']>>[2]>().toEqualTypeOf<unknown>();
    expectTypeOf<Parameters<NonNullable<FilterKind['wire']>>[3]>().toEqualTypeOf<unknown>();
  });
});

describe('the edit controller (Phase 5 step 3)', () => {
  type Row = { id: string; stock: number; due: Day };
  it('a column\'s edit rules: min and max typed by the column\'s value, options a list or a function of the row and the context', () => {
    const stock: ColumnDef<Row, number> = { id: 'stock', edit: { required: true, min: 0, max: 100, pattern: /^\\d+$/ } };
    const due: ColumnDef<Row, Day> = { id: 'due', edit: { min: null as unknown as Day } };
    const status: ColumnDef<Row, string> = { id: 's', edit: { options: (row, context) => (row.stock > 0 && context ? [{ value: 'in' }] : []) } };
    void stock;
    void due;
    void status;
    // @ts-expect-error — a number column's min is a number
    const bad: ColumnDef<Row, number> = { id: 'stock', edit: { min: 'five' } };
    void bad;
    // @ts-expect-error — a day column's min is a Day, not any string
    const badDay: EditChecks<Row, Day> = { min: '2026-01-01' };
    void badDay;
  });

  it('an input is typed text or a value, never both shapes mixed with anything else', () => {
    expectTypeOf<{ text: string }>().toMatchTypeOf<CellInput>();
    expectTypeOf<{ value: unknown }>().toMatchTypeOf<CellInput>();
    // @ts-expect-error — neither text nor value
    const none: CellInput = { raw: 1 };
    void none;
  });

  it('the edit events and the save request carry their origin', () => {
    expectTypeOf<SaveOrigin>().toEqualTypeOf<'edit' | 'undo' | 'redo' | 'paste' | 'fill' | 'bulk' | 'cut'>(); // Part B step 10: `cut`
    expectTypeOf<Extract<GridEvent<Row>, { type: 'cellEdited' }>['origin']>().toEqualTypeOf<SaveOrigin>();
    expectTypeOf<Extract<GridEvent<Row>, { type: 'saveFailed' }>['source']>().toEqualTypeOf<'data'>();
    expectTypeOf<Extract<GridEvent<Row>, { type: 'saveFailed' }>['reason']>().toEqualTypeOf<string | null>();
    expectTypeOf<Extract<GridEvent<Row>, { type: 'undoChanged' }>['canUndo']>().toEqualTypeOf<boolean>();
    expectTypeOf<Extract<GridEvent<Row>, { type: 'editStates' }>['cells']>().toEqualTypeOf<readonly { readonly key: RowKey; readonly column: string }[]>();
    expectTypeOf<SaveRequest<Row>['changes'][number]['row']>().toEqualTypeOf<Readonly<Row>>();
  });
});

describe('blocks of cells (Phase 5 step 10, range-selection.md 1)', () => {
  type Row = { id: string };
  it('a block is two corners by row key and column id, never positions', () => {
    expectTypeOf<CellAddr>().toEqualTypeOf<{ readonly row: RowKey; readonly column: string }>();
    expectTypeOf<CellRange>().toEqualTypeOf<{ readonly anchor: CellAddr; readonly focus: CellAddr }>();
    // @ts-expect-error — a display position is not a corner
    const bad: CellAddr = { row: 3, column: 'a' };
    void bad;
  });

  it('the block events carry the corners, and counts only for a copy (never values)', () => {
    expectTypeOf<Extract<GridEvent<Row>, { type: 'rangeChanged' }>['range']>().toEqualTypeOf<CellRange | null>();
    type Copied = Extract<GridEvent<Row>, { type: 'rangeCopied' }>;
    expectTypeOf<Omit<Copied, 'source'>>().toEqualTypeOf<{ readonly type: 'rangeCopied'; readonly rows: number; readonly columns: number; readonly cells: number; readonly cut: boolean }>();
  });

  it('a planned cell carries an input for the editing commit; a box holds numbers of one version', () => {
    expectTypeOf<PlannedCell['input']>().toEqualTypeOf<CellInput>();
    expectTypeOf<PlannedCell['key']>().toEqualTypeOf<RowKey>();
    expectTypeOf<RangeBox>().toEqualTypeOf<{ readonly top: number; readonly bottom: number; readonly start: number; readonly end: number }>();
  });
});
