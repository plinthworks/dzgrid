// The fill against core's plan, through the REAL `edit()` (Phase 5 step 12, step12-plan.md tests 1; owner « Step 12 »:
// the same result by the drag, the keys, the no-drag control and the API). Random rows shown (flat, a tree with a
// structure column, a path tree's fillers, details open, a server-like page), random visible columns of every type and
// rule, a random source (a focused cell or a block up to 4 × 4, corners on any row shown), a random cell to fill to on
// any side, a random swap, and a random way to get there. The oracle: `planFill(src, fillTarget(src, to).box, way, …)` of
// `@dzgrid/core/range` on the same rows and overlay, then each planned cell judged BY HAND (the read-only table, the rule
// table, unchanged values) — never the fill's own code. Asserted: at most one request (origin fill), its changes; the
// sentence; the cells blinked; the block after (source ∪ target); one undo gives every value back.
// `FILL_DOM_RUNS` (default 300; 3 000 once at the gate), `FILL_DOM_SEED` replays one seed.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type RowKey } from '@dzgrid/core';
import { fillTarget, planFill, rangeBox } from '@dzgrid/core/range';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { pagination } from '../src/pagination.js';
import { tree } from '../src/tree.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { FR_DETAIL } from '../src/locales/fr-detail.js';
import { AR_DETAIL } from '../src/locales/ar-detail.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { FR_TREE } from '../src/locales/fr-tree.js';
import { AR_TREE } from '../src/locales/ar-tree.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { FR_PAGINATION } from '../src/locales/fr-pagination.js';
import { AR_PAGINATION } from '../src/locales/ar-pagination.js';
import { msg } from '../src/messages.js';
import { cleanup, flush, fmake, FMSG, join } from './support-fill.js';

afterEach(cleanup);

type Lang = 'en' | 'fr' | 'ar';
type Kind = 'text' | 'number' | 'day' | 'instant' | 'enum' | 'boolean';
type P = { id: string; name: string | null; req: string | null; qty: number | null; lim: number | null; price: number | null; day: string | null; at: number | null; st: string | null; ok: boolean | null; ref: string; parent: string | null; path: string[] };
interface Spec { readonly id: keyof P; readonly kind: Kind; readonly min?: number; readonly max?: number; readonly required?: boolean; readonly ro?: boolean }
const POOL: Spec[] = [
  { id: 'name', kind: 'text' }, { id: 'req', kind: 'text', required: true }, { id: 'qty', kind: 'number', min: 0 }, { id: 'lim', kind: 'number', max: 10 },
  { id: 'price', kind: 'number' }, { id: 'day', kind: 'day' }, { id: 'at', kind: 'instant' }, { id: 'st', kind: 'enum' }, { id: 'ok', kind: 'boolean' }, { id: 'ref', kind: 'text', ro: true },
];
const defOf = (s: Spec): ColumnDef<P, any> => ({
  id: s.id, header: s.id, width: 40, ...(s.kind !== 'text' && { type: s.kind }), ...(!s.ro && { editable: true }),
  ...((s.required || s.min !== undefined || s.max !== undefined) && { edit: { ...(s.required && { required: true }), ...(s.min !== undefined && { min: s.min }), ...(s.max !== undefined && { max: s.max }) } }),
  ...(s.kind === 'enum' && { enumOptions: [{ value: 'in', label: 'In stock' }, { value: 'out', label: 'Rupture' }] }),
});

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { next, int, pick: <X>(xs: readonly X[]): X => xs[int(xs.length)]!, chance: (p: number) => next() < p };
}

const panel = definePart('detail', { mount: (host) => (host.append('panel'), { update() {}, destroy() {} }) });
const BUNDLES = { en: [EN_DETAIL, EN_TREE, EN_PAGINATION], fr: [FR_DETAIL, FR_TREE, FR_PAGINATION], ar: [AR_DETAIL, AR_TREE, AR_PAGINATION] } as const;
const DAYS = ['2026-01-31', '2026-02-28', '2026-03-28', '2028-02-28', null];
const AT0 = Date.parse('2026-03-05T22:59:00Z');
const isDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const hit: Record<string, number> = {};
const saw = (k: string, on: unknown) => void (on && (hit[k] = (hit[k] ?? 0) + 1));

async function run(seed: number): Promise<void> {
  const r = rng(seed);
  const lang = r.pick<Lang>(['en', 'fr', 'ar']);
  const shape = r.pick(['flat', 'flat', 'tree', 'path', 'detail', 'page'] as const);
  const pool = [...POOL].sort(() => r.next() - 0.5);
  let specs = pool.slice(0, 2 + r.int(6));
  if (shape === 'path' && !specs.some((s) => s.id === 'name')) specs = [POOL[0]!, ...specs];
  if (shape === 'path') specs = specs.map((s) => (s.id === 'name' ? { ...s, ro: true } : s));
  const parentSpec: Spec = { id: 'parent', kind: 'text', ro: true };
  if (shape === 'tree') specs.splice(r.int(specs.length + 1), 0, parentSpec);
  const defs = specs.map((s) => (s.id === 'parent' ? ({ id: 'parent', header: 'parent', width: 40, editable: true, value: (x: P) => x.parent ?? '' } as ColumnDef<P, any>) : defOf(s)));
  const N = 14;
  const num = () => (r.chance(0.1) ? null : r.chance(0.5) ? r.int(12) - 2 : r.int(5) * 0.1);
  const rows: P[] = Array.from({ length: N }, (_, i) => ({
    id: `r${i}`, name: r.pick(['a', 'b', 'c', null]), req: r.pick(['x', 'y', null]), qty: num(), lim: num(), price: r.chance(0.5) ? i * 0.25 : num(),
    day: r.chance(0.5) ? DAYS[(i % 2) + (r.int(2) * 2)]! : r.pick(DAYS), at: r.chance(0.8) ? AT0 + r.int(3) * 60000 : null, st: r.pick(['in', 'out', null]), ok: r.pick([true, false, null]), ref: `R${i}`,
    parent: shape === 'tree' && i % 4 ? `r${i - (i % 4)}` : null, path: i % 5 === 3 ? ['g', `x${i}`, `leaf${i}`] : [`p${i}`],
  }));
  const extra = shape === 'tree' ? [tree<P>({ parentId: (x) => x.parent, structure: ['parent'] })]
    : shape === 'path' ? [tree<P>({ path: (x) => x.path, column: 'name' })]
    : shape === 'detail' ? [detail<P>({ part: panel, height: 60 })]
    : shape === 'page' ? [pagination()] : [];
  const t = fmake({
    rows: rows as never, columns: defs as never, lang, after: extra as never, block: 2000, more: BUNDLES[lang] as never,
    settings: { ...(shape === 'page' && { pagination: { pageSize: 6 } }) } as never,
  });
  const k = t.g.kernel;
  if (shape === 'tree') k.dispatch({ type: 'rows.expand', rows: rows.filter((x) => !x.parent && r.chance(0.7)).map((x) => dataKey(x.id)!), expanded: true }, 'api');
  if (shape === 'path') k.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
  if (shape === 'detail') k.dispatch({ type: 'rows.expand', rows: rows.filter(() => r.chance(0.4)).map((x) => dataKey(x.id)!), expanded: true }, 'api');
  if (shape === 'page') k.dispatch({ type: 'page.go', index: r.int(3) }, 'api');
  const d = k.rows.displayed;
  const keys = Array.from({ length: d.count }, (_, i) => d.keyAt(d.index(i)!));
  const kinds = keys.map((_, i) => d.nodeAt(d.index(i)!).kind);
  const dataIdx = kinds.flatMap((x, i) => (x === 'data' ? [i] : []));
  if (!dataIdx.length) return;
  const idOf = (key: RowKey) => String(key).replace(/^d:\d+:/, '');
  const model = new Map<string, unknown>();
  for (const x of rows) for (const s of [...POOL, parentSpec]) model.set(`${x.id}/${s.id}`, s.id === 'parent' ? x.parent ?? '' : (x as never)[s.id]);
  const before = new Map(model);
  const ids = specs.map((s) => s.id as string);

  // The source: a focused data cell, or a block (1 × 1 up to 4 × 4) whose corners may rest on any row shown.
  const fr = r.pick(dataIdx);
  const fc = r.int(specs.length);
  t.at(idOf(keys[fr]!), ids[fc]!);
  if (r.chance(0.6)) {
    const a = r.int(d.count);
    const b = Math.min(d.count - 1, a + r.int(4));
    const ca = r.int(specs.length);
    const cb = Math.min(specs.length - 1, ca + r.int(4));
    t.api().set({ anchor: { row: keys[a]!, column: ids[ca]! }, focus: { row: keys[b]!, column: ids[cb]! } });
  }
  const sel = t.api().get() ?? { anchor: { row: keys[fr]!, column: ids[fc]! }, focus: { row: keys[fr]!, column: ids[fc]! } };
  const src = rangeBox(sel, d, ids)!;
  // The cell to fill to: on any side, up to the edges.
  const to = { row: r.int(d.count), col: r.int(specs.length) };
  const swap = r.chance(0.3);
  const ft = fillTarget(src, to);
  // The oracle: core's plan on the same rows and overlay.
  const planned = ft ? planFill(src, ft.box, ft.way, d, t.ctx.columns.visible(), { ctx: t.ctx.ctx, reader: k.reader, swap }) : [];
  // Each planned cell judged by hand.
  const ro = new Set(specs.filter((s) => s.ro).map((s) => s.id as string));
  // The value a column makes of what it is given (by hand from the codecs: text takes numbers and yes/no as their
  // text; numbers take numbers and plain numeric texts; days ISO days; instants milliseconds; lists their options;
  // yes/no true or false), undefined when it refuses.
  const take = (s: Spec, v: unknown): unknown => {
    if (s.kind === 'text') return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined;
    if (s.kind === 'number') return typeof v === 'number' ? (Number.isFinite(v) ? v : undefined) : typeof v === 'string' && /^[+-]?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined;
    if (s.kind === 'day') return isDay(v) ? v : undefined;
    if (s.kind === 'instant') return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    if (s.kind === 'enum') return v === 'in' || v === 'out' ? v : undefined;
    return typeof v === 'boolean' ? v : undefined;
  };
  const verdict = (row: string, col: string, v: unknown): { v: 'ro' | 'no' | 'same' | 'ok'; val?: unknown } => {
    if (ro.has(col)) return { v: 'ro' };
    const s = specs.find((x) => x.id === col)!;
    const cur = model.get(`${row}/${col}`) ?? null;
    if (v === null || v === undefined || v === '') return { v: s.required ? 'no' : cur === null ? 'same' : 'ok', val: null };
    const val = take(s, v);
    if (val === undefined) return { v: 'no' };
    if (typeof val === 'number' && ((s.min !== undefined && val < s.min) || (s.max !== undefined && val > s.max))) return { v: 'no' };
    return { v: cur === val ? 'same' : 'ok', val };
  };
  const judged = planned.map((c) => ({ c, ...verdict(idOf(c.key), c.column, (c.input as { value: unknown }).value) }));
  const expectChanges = judged.filter((x) => x.v === 'ok').map((x) => `${idOf(x.c.key)}/${x.c.column}=${JSON.stringify(x.val)}`);
  const refused = judged.filter((x) => x.v === 'no');
  const readOnly = judged.filter((x) => x.v === 'ro').length;

  // The way there: the API, the drag, the keys, the click-then-click (the handle needed for the two pointer ways).
  const handle = t.handle();
  const toKey = keys[to.row]!;
  // The fixtures' ids: a detail row is `x` + its row's id.
  const toId = String(toKey).replace(/^x:d:\d+:/, 'x').replace(/^d:\d+:/, '');
  const rtl = lang === 'ar';
  let path = r.pick(['api', 'drag', 'keys', 'pick'] as const);
  if ((path === 'drag' || path === 'pick') && (!handle || (kinds[to.row] !== 'data' && kinds[to.row] !== 'detail'))) path = 'keys';
  // A click on a panel disarms the no-drag way (review 2: a detail panel is outside the body's cells); the drag reaches it.
  if (path === 'pick' && kinds[to.row] === 'detail') path = 'drag';
  saw(`path ${path}`, true);
  let res: unknown = undefined;
  if (path === 'api') res = t.fapi().fill({ row: toKey, column: ids[to.col]! }, { swap });
  else if (path === 'drag') {
    t.down(handle!, t.pt(...(t.handleAt()!.split('/') as [string, string])));
    const p = t.pt(toId, ids[to.col]!);
    t.move(p);
    t.up(p, document, { ctrlKey: swap });
  } else if (path === 'pick') {
    t.pickTo(toId, ids[to.col]!, { ctrl: swap });
  } else {
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    for (let i = src.bottom; i < to.row; i++) t.press('ArrowDown');
    for (let i = src.bottom; i > to.row; i--) t.press('ArrowUp');
    for (let i = src.end; i < to.col; i++) t.press(rtl ? 'ArrowLeft' : 'ArrowRight');
    for (let i = src.end; i > to.col; i--) t.press(rtl ? 'ArrowRight' : 'ArrowLeft');
    t.press('Enter', swap ? { ctrlKey: true } : {});
  }
  await flush();
  const where = `seed ${seed} (${lang}, ${shape}, ${path}, src ${JSON.stringify(src)} to ${JSON.stringify(to)}${swap ? ' swap' : ''}) said ${JSON.stringify(t.said().slice(-3))}`;
  expect(t.requests.length, where).toBe(expectChanges.length ? 1 : 0);
  if (t.requests.length) expect(t.requests[0]!.origin, where).toBe('fill');
  expect(t.changes(), where).toEqual(expectChanges);
  // Blinked: the refused cells (all mounted here), never a read-only one.
  expect(t.blinked().sort(), where).toEqual(refused.map((x) => `${idOf(x.c.key)}/${x.c.column}`).sort());
  if (!ft) {
    expect(t.said().some((x) => /^(Cells filled|Cellules recopiées|التعبئة: \d)/.test(x)), where).toBe(false);
    if (path === 'api') expect(res, where).toBeNull();
    saw('inside', true);
    return;
  }
  saw('refused', refused.length);
  saw('readOnly', readOnly);
  saw('swap', swap);
  saw(`way ${ft.way}`, true);
  saw(shape, true);
  // The sentence: by hand from the bundle's texts.
  const m = t.ctx.settings.messages;
  const n = planned.length - refused.length - readOnly;
  const main = [msg(m, 'fill.filled', { n }), refused.length ? msg(m, 'range.refused', { n: refused.length }) : '', readOnly ? msg(m, 'range.readOnly', { n: readOnly }) : ''].join('');
  const said = expectChanges.length ? `${main}. ${msg(m, 'edit.saving')}` : main;
  expect(t.said().at(-1), where).toBe(said);
  if (path === 'api') expect(res, where).toEqual({ filled: n, refused: refused.length, readOnly });
  // The block after: source ∪ target.
  const u = { top: Math.min(src.top, ft.box.top), bottom: Math.max(src.bottom, ft.box.bottom), start: Math.min(src.start, ft.box.start), end: Math.max(src.end, ft.box.end) };
  expect(t.api().box(), where).toEqual(u);
  // One undo gives every value back.
  if (expectChanges.length) {
    t.edits!.undo();
    for (const [cell, v] of before) {
      const [row, col] = cell.split('/') as [string, string];
      // An undo skips a value the column refuses now (edit-undo.md 7): a blank in a required column stays filled.
      const sp = specs.find((x) => x.id === col);
      const bad = !!sp && ((v == null && sp.required) || (typeof v === 'number' && ((sp.min !== undefined && v < sp.min) || (sp.max !== undefined && v > sp.max))));
      if (!ids.includes(col) || ro.has(col) || bad) continue;
      const node = k.rows.row(dataKey(row)!);
      if (node) expect(t.ctx.edit!.read(t.ctx.columns.get(col)! as never, node.data, node.key), `${where} ${cell}`).toEqual(v ?? null);
    }
  }
}

describe('the fill property (step 12): the real edit() against core\'s plan, every way', () => {
  it('random grids, sources, targets, swaps and ways: the request, the sentence, the blinks, the block, the undo', async () => {
    const one = process.env['FILL_DOM_SEED'];
    const runs = Number(process.env['FILL_DOM_RUNS'] ?? 300);
    const seeds = one ? [Number(one)] : Array.from({ length: runs }, (_, i) => i + 1);
    for (const seed of seeds) {
      await run(seed);
      cleanup();
    }
    if (!one) for (const k of ['path api', 'path drag', 'path keys', 'path pick', 'inside', 'refused', 'readOnly', 'swap', 'way down', 'way up', 'way end', 'way start', 'tree', 'path', 'detail', 'page']) expect(hit[k] ?? 0, k).toBeGreaterThanOrEqual(3);
  }, 600_000);
});
