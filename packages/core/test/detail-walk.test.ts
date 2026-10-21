import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, detailKey, headerSelection, localeCtx, makeQuery, type DisplayIndex, type FocusPos, type RowKey, type RowNode } from '@dzgrid/core';
import { csvRows, toCsv } from '@dzgrid/core/csv';
import { detailShape, sparseRowLayout, type DetailRows } from '@dzgrid/core/detail';
import { mulberry32 } from './support/rng.js';

/**
 * A kernel random walk with details (master-detail.md, step 8) against an independent model: the
 * rows in store order, the open masters, the query, the page, the selection, the anchor and the
 * focus kept by hand. After every step: the rows shown (a detail right after its master, on its
 * page), the keys and nodes, counts, the page, the expansion, the selection (never a detail), the
 * header box, the focus, the three CSV scopes and the sparse layout against a brute-force sum.
 */
type R = { id: string; n: number; t: string };
const WORDS = ['alpha', 'beta', 'gamma'];
const QUICK = ['', 'alpha', 'et', 'a', 'mm'];
const k = (id: string) => dataKey(id)!;
const x = (id: string) => detailKey(k(id));
const H = 32;

function walk(seed: number, steps: number): void {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <V>(a: readonly V[]): V => a[int(a.length)]!;
  const pageSize0 = pick([0, 0, 2, 3, 4]) || undefined;
  const initial = pick(['none', 'none', 'all'] as const);
  let made = 0;
  const mk = (): R => ({ id: `r${made++}`, n: int(6), t: pick(WORDS) });

  // The oracle's state.
  let rows: R[] = Array.from({ length: 3 + int(8) }, mk);
  const gone: R[] = [];
  const sizes = new Map<RowKey, number>();
  for (const r of rows) if (rnd() < 0.25) sizes.set(k(r.id), pick([17, 0, -5, NaN, 99.5]));
  const open = new Set<string>(initial === 'all' ? rows.map((r) => r.id) : []);
  let sort: 'asc' | 'desc' | null = null;
  let filterT: string | null = null;
  let quick = '';
  let pageIndex = 0;
  let pageSize = pageSize0;
  const sel = new Set<string>();
  /** Everything-except (select all filtered, paged): `sel` holds the unticked rows. */
  let exclude = false;
  const isSel = (id: string) => sel.has(id) !== exclude;
  let anchor: string | null = null;
  let focus: FocusPos | null = null;

  const columns = createColumnModel<R>([{ id: 'n', header: 'N', type: 'number' }, { id: 't', header: 'T' }]);
  const ctx = localeCtx({ locale: 'en-US' });
  const shape = detailShape<R>({ height: (r) => r.n * 7 + 3, sizes, initial });
  const model = clientRows<R>({ rows, getRowId: (r) => r.id, columns, ctx, shape, ...(pageSize0 && { page: { pageSize: pageSize0 } }) });
  const kernel = createKernel<R>({ rows: model, columns });

  const hOf = (r: R): number => {
    const v = sizes.get(k(r.id)) ?? r.n * 7 + 3;
    return Number.isFinite(v) && v >= 0 ? v : 240;
  };
  const filtered = (): R[] => {
    const out = rows.filter((r) => (filterT === null || r.t === filterT) && (quick === '' || r.t.includes(quick)));
    if (sort) {
      const s = sort === 'asc' ? 1 : -1;
      // Ties keep the store order.
      out.sort((a, b) => s * (a.n - b.n));
    }
    return out;
  };
  const pageCount = (n: number) => (pageSize ? Math.max(1, Math.ceil(n / pageSize)) : 1);
  const page = (): R[] => {
    const f = filtered();
    if (!pageSize) return f;
    pageIndex = Math.min(pageIndex, pageCount(f.length) - 1);
    return f.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  };
  const shownKeys = (): RowKey[] => page().flatMap((r) => (open.has(r.id) ? [k(r.id), x(r.id)] : [k(r.id)]));
  let before = shownKeys();
  /** The focus after the rows changed: kept, else a detail's master, else the row at its old place (a detail's: its master's); no rows: the header. */
  const follow = () => {
    const now = shownKeys();
    if (focus?.kind === 'cell' && !now.includes(focus.row)) {
      const m = focus.row.startsWith('x:') ? (focus.row.slice(2) as RowKey) : null;
      if (m && now.includes(m)) focus = { kind: 'cell', row: m, column: 'n' };
      else if (!now.length) focus = { kind: 'header', column: 'n' };
      else {
        // A detail's master gone: the row now at the master's place (one before the detail's).
        const was = before.indexOf(focus.row) - (m ? 1 : 0);
        focus = { kind: 'cell', row: now[Math.min(was === -1 ? 0 : was, now.length - 1)]!, column: 'n' };
      }
    }
    before = now;
  };
  const setQuery = (s: typeof sort, f: typeof filterT, q: string) => {
    const changed = s !== sort || f !== filterT || q !== quick;
    const filterT0 = filterT;
    const quick0 = quick;
    sort = s;
    filterT = f;
    quick = q;
    if (changed) pageIndex = 0;
    // "All" stood for the rows of that filter and search: another one clears it.
    if (exclude && (f !== filterT0 || q !== quick0)) (sel.clear(), (exclude = false), (anchor = null));
    kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: s ? [{ column: 'n', dir: s }] : [], filter: f ? { t: { type: 'text', op: 'equals', value: f } } : {}, quick: q }) }, 'user');
  };
  const dropRow = (id: string) => {
    open.delete(id);
    sel.delete(id);
    if (anchor === id) anchor = null;
  };

  const check = (step: string) => {
    const at = `seed ${seed}, ${step}`;
    const d = model.displayed as DetailRows<R>;
    const pg = page();
    const keys = shownKeys();
    const got = Array.from({ length: d.count }, (_, i) => d.keyAt(d.index(i)!));
    expect(got, at).toEqual(keys);
    expect(d.dataCount, at).toBe(pg.length);
    expect([...d.details], at).toEqual(keys.flatMap((key, i) => (key.startsWith('x:') ? [i] : [])));
    const masters = pg.filter((r) => open.has(r.id));
    expect([...d.heights], at).toEqual(masters.map(hOf));
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const di = d.index(i)!;
      expect(d.indexOf(key), at).toBe(i);
      const node = d.nodeAt(di) as RowNode<R> & { data: R };
      const p = pg.findIndex((r) => key === k(r.id) || key === x(r.id));
      const r = pg[p]!;
      expect(node.data, at).toBe(rows.find((q) => q.id === r.id));
      if (key.startsWith('x:')) {
        expect(node, at).toMatchObject({ kind: 'detail', key, master: k(r.id), level: 0 });
        expect(d.parentOf(key), at).toBe(k(r.id));
        expect(d.nextData(di, -1)?.key ?? null, at).toBe(k(r.id));
      } else {
        expect(node, at).toMatchObject({ kind: 'data', key, id: r.id });
        expect(d.parentOf(key), at).toBe(null);
        expect(d.nextData(di, -1)?.key ?? null, at).toBe(p > 0 ? k(pg[p - 1]!.id) : null);
      }
      expect(d.nextData(di, 1)?.key ?? null, at).toBe(p + 1 < pg.length ? k(pg[p + 1]!.id) : null);
    }
    // A closed master's detail, a hidden row's, another page's: not shown.
    for (const r of rows) if (!keys.includes(x(r.id))) expect(d.indexOf(x(r.id)), at).toBe(-1);
    for (const r of gone) expect(d.indexOf(k(r.id)), at).toBe(-1);

    const f = filtered();
    expect(model.counts, at).toEqual({ total: rows.length, filtered: f.length, displayed: keys.length });
    if (pageSize) expect(model.page, at).toMatchObject({ index: pageIndex, size: pageSize, total: f.length, pageCount: pageCount(f.length) });
    expect([...kernel.expansion].sort(), at).toEqual([...open].map(k).sort());
    expect(kernel.selection.mode, at).toBe(exclude ? 'exclude' : 'include');
    expect([...kernel.selection.keys].sort(), at).toEqual([...sel].map(k).sort());
    for (const s of kernel.selection.keys) expect(s.startsWith('x:'), at).toBe(false);
    expect(kernel.anchor, at).toBe(anchor === null ? null : k(anchor));
    const ticked = pg.filter((r) => isSel(r.id)).length;
    const box = pg.length === 0 || ticked === 0 ? 'none' : ticked === pg.length ? 'all' : 'some';
    expect(headerSelection(kernel.selection, d), at).toBe(box);
    expect(kernel.headerState, at).toBe(box);
    expect(kernel.focus, at).toEqual(focus);

    // CSV: never a detail; displayed is the page, all the filtered rows across pages, selected those ticked.
    const line = (r: R) => `${r.n},${r.t}`;
    for (const [scope, want] of [['displayed', pg], ['all', f], ['selected', f.filter((r) => isSel(r.id))]] as const) {
      const held = csvRows(model, scope, kernel.selection)!;
      const lines = toCsv({ rows: held.rows, at: held.at, columns, ctx }, { bom: false }).split('\r\n').slice(0, -1);
      expect({ count: held.count, lines }, `${at}, csv ${scope}`).toEqual({ count: want.length, lines: ['N,T', ...want.map(line)] });
    }

    // The layout against a brute-force sum of each row's height.
    const hs = keys.map((key) => (key.startsWith('x:') ? hOf(pg.find((r) => x(r.id) === key)!) : H));
    const L = sparseRowLayout(d, H, { at: d.details, heights: d.heights });
    let off = 0;
    for (let i = 0; i < hs.length; i++) {
      expect(L.offsetOf(i as DisplayIndex), `${at}, offsetOf ${i}`).toBe(off);
      expect(L.heightOf(i as DisplayIndex), `${at}, heightOf ${i}`).toBe(hs[i]);
      if (hs[i]! > 0) {
        expect(L.indexAt(off), `${at}, indexAt ${off}`).toBe(i);
        expect(L.indexAt(off + hs[i]! / 2), at).toBe(i);
      }
      off += hs[i]!;
    }
    expect(L.total, at).toBe(off);
    if (hs.length) expect(L.indexAt(off + 1), at).toBe(hs.length - 1);
  };

  check('start');
  for (let s = 0; s < steps; s++) {
    const step = int(21);
    let label = `step ${s} (${step})`;
    const ids = rows.map((r) => r.id);
    switch (step) {
      case 0:
      case 1: {
        // Open or close masters, shown or not.
        const some = ids.filter(() => rnd() < 0.3);
        const expanded = rnd() < 0.6;
        label += ` expand ${some} ${expanded}`;
        kernel.dispatch({ type: 'rows.expand', rows: some.map(k), expanded }, 'user');
        for (const id of some) expanded ? open.add(id) : open.delete(id);
        break;
      }
      case 2: {
        // A detail key or an unknown row: nothing opens.
        const id = ids.length ? pick(ids) : 'zz';
        const ok = kernel.dispatch({ type: 'rows.expand', rows: [rnd() < 0.5 ? x(id) : k('zz')], expanded: true }, 'user').ok;
        label += ` expand-nothing ${id} ${ok}`;
        break;
      }
      case 3: {
        const expanded = rnd() < 0.5;
        label += ` expandAll ${expanded}`;
        const pg = page();
        kernel.dispatch({ type: 'rows.expandAll', expanded }, 'user');
        if (expanded) for (const r of pg) open.add(r.id);
        else open.clear();
        break;
      }
      case 4:
        label += ' sort';
        setQuery(pick([null, 'asc', 'desc'] as const), filterT, quick);
        break;
      case 5:
        label += ' filter';
        setQuery(sort, pick([null, null, ...WORDS]), quick);
        break;
      case 6:
        label += ' quick';
        setQuery(sort, filterT, pick(QUICK));
        break;
      case 7: {
        if (!pageSize) break;
        const to = int(pageCount(filtered().length) + 1);
        label += ` page ${to}`;
        kernel.dispatch({ type: 'page.go', index: to }, 'user');
        pageIndex = Math.min(to, pageCount(filtered().length) - 1);
        break;
      }
      case 8: {
        // Remove a row or two, masters open or not.
        const out = ids.filter(() => rnd() < 0.2).slice(0, 2);
        if (!out.length) break;
        label += ` remove ${out}`;
        model.applyTransaction({ remove: out });
        for (const id of out) {
          gone.push(rows.find((r) => r.id === id)!);
          dropRow(id);
        }
        rows = rows.filter((r) => !out.includes(r.id));
        break;
      }
      case 9: {
        // Add a new row, or one removed before (closed, not selected).
        const back = gone.length && rnd() < 0.6 ? gone.splice(int(gone.length), 1)[0]! : mk();
        label += ` add ${back.id}`;
        model.applyTransaction({ add: [back] });
        rows = [...rows, back];
        break;
      }
      case 10: {
        // Removed and added again in one transaction: kept open and selected, now last in the store.
        if (!ids.length) break;
        const id = pick(ids);
        const r = rows.find((q) => q.id === id)!;
        label += ` readd ${id}`;
        model.applyTransaction({ remove: [id], add: [r] });
        rows = [...rows.filter((q) => q.id !== id), r];
        break;
      }
      case 11: {
        // New data for a row: its detail shows it, its height follows.
        if (!ids.length) break;
        const id = pick(ids);
        const r = { id, n: int(6), t: pick(WORDS) };
        label += ` update ${JSON.stringify(r)}`;
        model.applyTransaction({ update: [r] });
        rows = rows.map((q) => (q.id === id ? r : q));
        break;
      }
      case 12: {
        const keys = shownKeys();
        if (!keys.length) break;
        const row = pick(keys);
        label += ` focus ${row}`;
        expect(kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row, column: 'n' } }, 'user').ok).toBe(true);
        focus = { kind: 'cell', row, column: 'n' };
        break;
      }
      case 13: {
        // A tick on any held row; a detail's is refused.
        const keys = [...ids.map(k), ...shownKeys().filter((key) => key.startsWith('x:'))];
        if (!keys.length) break;
        const key = pick(keys);
        label += ` toggle ${key}`;
        const ok = kernel.dispatch({ type: 'selection.toggle', row: key }, 'user').ok;
        expect(ok, `seed ${seed}, ${label}`).toBe(!key.startsWith('x:'));
        if (ok) {
          const id = key.slice(key.indexOf(':', 2) + 1);
          sel.has(id) ? sel.delete(id) : sel.add(id);
          anchor = id;
        }
        break;
      }
      case 14: {
        label += ' select-all';
        const pg = page();
        kernel.dispatch({ type: 'selection.all' }, 'user');
        // Tied to the query: everything again (the unticked rows ticked); else the rows shown, added on pages.
        // (A new everything-except forgets the anchor; the same one again changes nothing.)
        if (exclude) sel.size && (sel.clear(), (anchor = null));
        else {
          if (!pageSize) sel.clear();
          for (const r of pg) sel.add(r.id);
        }
        break;
      }
      case 15: {
        // A range to any row shown, a detail too: the data rows between.
        const keys = shownKeys();
        if (!keys.length) break;
        const target = pick(keys);
        label += ` range ${target}`;
        const ok = kernel.dispatch({ type: 'selection.range', target, additive: false }, 'user').ok;
        const a = anchor === null ? -1 : keys.indexOf(k(anchor));
        expect(ok, `seed ${seed}, ${label}`).toBe(a !== -1);
        if (a !== -1) {
          const b = keys.indexOf(target);
          sel.clear();
          exclude = false;
          for (const key of keys.slice(Math.min(a, b), Math.max(a, b) + 1)) if (!key.startsWith('x:')) sel.add(key.slice(key.indexOf(':', 2) + 1));
        }
        break;
      }
      case 17: {
        // New rows from the host: a shuffled subset, some removed rows back; what stays keeps its state.
        const keep = rows.filter(() => rnd() < 0.7);
        const back = gone.filter(() => rnd() < 0.3);
        const next = [...keep, ...back];
        for (let i = next.length - 1; i > 0; i--) {
          const j = int(i + 1);
          [next[i], next[j]] = [next[j]!, next[i]!];
        }
        label += ` setRows ${next.map((r) => r.id)}`;
        model.setRows(next);
        for (const r of rows) if (!next.includes(r)) (gone.push(r), dropRow(r.id));
        for (const r of back) gone.splice(gone.indexOf(r), 1);
        rows = next;
        break;
      }
      case 18: {
        // Every row the query matches, across pages: everything-except when paged, the rows shown otherwise.
        label += ' all-filtered';
        const f = filtered();
        kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
        if (!pageSize) (sel.clear(), (exclude = false), f.forEach((r) => sel.add(r.id)));
        else if (!f.length) (sel.clear(), (exclude = false), (anchor = null));
        else if (!exclude || sel.size) (sel.clear(), (exclude = true), (anchor = null));
        break;
      }
      case 19: {
        if (!ids.length) break;
        const id = pick(ids);
        label += ` only ${id}`;
        kernel.dispatch({ type: 'selection.only', row: k(id) }, 'user');
        sel.clear();
        exclude = false;
        sel.add(id);
        anchor = id;
        break;
      }
      case 20: {
        // Another page size: the model says which page; the rows shown must be that page's.
        if (!pageSize) break;
        const size = pick([1, 2, 3, 5]);
        label += ` page-size ${size}`;
        expect(kernel.dispatch({ type: 'page.size', size }, 'user').ok).toBe(true);
        pageSize = size;
        pageIndex = model.page!.index;
        expect(pageIndex, `seed ${seed}, ${label}`).toBeLessThan(pageCount(filtered().length));
        break;
      }
      case 16:
        label += ' clear';
        kernel.dispatch({ type: 'selection.clear' }, 'user');
        sel.clear();
        exclude = false;
        anchor = null;
        break;
    }
    follow();
    check(label);
  }
}

describe('a kernel random walk with details, against an independent model', () => {
  it('agrees over 400 seeds × 60 steps', { timeout: 120_000 }, () => {
    for (let seed = 1; seed <= 400; seed++) walk(seed, 60);
  });
});
