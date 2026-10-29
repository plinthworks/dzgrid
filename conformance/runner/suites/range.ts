import { createColumnModel, dataKey, detailKey, localeCtx, NO_OVERLAY, type ColumnDef, type ColumnState, type RowKey, type ValueReader } from '@dzgrid/core';
import { boxRows, boxSize, decodeTsv, encodeTsv, fillTarget, planFill, planPaste, rangeBox, type PlannedCell, type RangeBox } from '@dzgrid/core/range';
import type { CellInput } from '@dzgrid/core/edit';
import { shown, tokenOf } from '../../../packages/core/test/support/shown.js';
import { iso } from '../iso.js';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

/**
 * Blocks of cells (Phase 5 step 10, range-selection.md, clipboard.md, fill.md). Rows shown as the
 * tokens of `packages/core/test/support/shown.ts` (`a`, `(a)` muted, `> a` a detail, `/x` a filler,
 * `~a` a loading row); `rows` their fields; `columns` the definitions, `state` the user's changes
 * (hidden, pinned), the visible columns in reading order.
 */
const keyOf = (t: string): RowKey => (t.startsWith('> ') ? detailKey(dataKey(t.slice(2))!) : dataKey(t)!);

function setup(input: any) {
  const model = createColumnModel<Row>(input.columns as ColumnDef<Row>[]);
  if (input.state) model.apply(input.state as ColumnState[], 'api');
  const columns = model.visible();
  // Instants are written as ISO strings in the cases; the codec reads them (`coerce`).
  const displayed = shown<Row>(input.shown, input.rows ?? {});
  return { columns, displayed };
}

/** `{text}` stays; `{value}` is a value given; a plain string is text. */
const inputOf = (x: unknown): CellInput => (typeof x === 'string' ? { text: x } : (x as CellInput));
const cellOf = (displayed: ReturnType<typeof shown>, cols: readonly { id: string; type: string }[], c: PlannedCell) => {
  const i = displayed.indexOf(c.key);
  const id = i === -1 ? String(c.key) : tokenOf(displayed.nodeAt(i));
  const col = cols.find((x) => x.id === c.column);
  const v = 'value' in c.input && col?.type === 'instant' && typeof c.input.value === 'number' ? { value: iso(c.input.value) } : c.input;
  return [id, c.column, v];
};

function runBox(input: any) {
  const { columns, displayed } = setup(input);
  const r = { anchor: { row: keyOf(input.range.anchor[0]), column: input.range.anchor[1] }, focus: { row: keyOf(input.range.focus[0]), column: input.range.focus[1] } };
  const box = rangeBox(r, displayed, columns.map((c) => c.id));
  return {
    box,
    rows: box ? boxRows(box, displayed).map(tokenOf) : [],
    columns: box ? columns.slice(box.start, box.end + 1).map((c) => c.id) : [],
    size: box ? boxSize(box, displayed) : null,
  };
}

function runPaste(input: any) {
  const { columns, displayed } = setup(input);
  const src = (input.src as unknown[][]).map((r) => r.map(inputOf));
  const plan = planPaste(src, input.at as RangeBox, displayed, columns, input.max !== undefined ? { max: input.max } : undefined);
  return { cells: plan.cells.map((c) => cellOf(displayed, columns, c)), outside: plan.outside, tooBig: plan.tooBig, box: plan.box };
}

function runFill(input: any) {
  const { columns, displayed } = setup(input);
  const target = fillTarget(input.src as RangeBox, input.to, input.along);
  if (input.only === 'target') return { target };
  const ctx = localeCtx({ locale: input.locale ?? 'en-US', ...(input.timeZone && { timeZone: input.timeZone }) });
  // `edits`: values shown over the rows' own (`"id.column": value`), as the editing overlay gives them.
  const edits: Record<string, unknown> = input.edits ?? {};
  const reader: ValueReader<Row> = input.edits
    ? { version: 1, overlay: true, value: (col, row, id) => (`${id}.${col.id}` in edits ? edits[`${id}.${col.id}`] : col.read(row)) }
    : (NO_OVERLAY as ValueReader<Row>);
  const cells = target ? planFill(input.src as RangeBox, target.box, target.way, displayed, columns, { ctx, reader, ...(input.mode && { mode: input.mode }), ...(input.swap && { swap: true }) }) : [];
  return { target, cells: cells.map((c) => cellOf(displayed, columns, c)) };
}

export const range: Record<string, Suite> = {
  'range-box': runBox,
  'clipboard-tsv': (input) => ('encode' in input ? { text: encodeTsv(input.encode) } : { rows: decodeTsv(input.decode, input.pad ? { pad: true } : undefined) }),
  'paste-plan': runPaste,
  'fill-plan': runFill,
};
