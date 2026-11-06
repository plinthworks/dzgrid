// What a move takes and when it is refused (Phase 9, docs/behaviors/row-move.md 13–16, 24): several selected rows, alone
// when unselected, `maxRows`, `canDrag`, `canDrop` (a throw is no, reported once), sorted and grouped refused (grips off,
// sentences) unless allowed, filtered allowed, the managed mode (`apply: true`: the same objects, the selection and focus
// kept, hidden rows in place), server sources (event only, `apply` told once). Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GridEvent } from '@dzgrid/core';
import type { DataSource } from '@dzgrid/core/server';
import { infiniteRows } from '@dzgrid/core/infinite';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridContext } from '../src/context.js';
import type { GridFeature } from '../src/features.js';
import { rowDrag } from '../src/row-drag.js';
import { pinnedRows } from '../src/pinned-rows.js';
import { EN_PINNED } from '../src/locales/en-pinned.js';
import { pinnedKey } from '@dzgrid/core';
import { cleanup, dmake, DMSG, flatRows, join, type Moved, type R } from './support-row-drag.js';

afterEach(cleanup);

const sel = (t: ReturnType<typeof dmake>, ...ids: string[]) => {
  t.g.kernel.dispatch({ type: 'selection.only', row: t.K(ids[0]!) }, 'api');
  for (const id of ids.slice(1)) t.g.kernel.dispatch({ type: 'selection.toggle', row: t.K(id) }, 'api');
};

describe('several rows (13)', () => {
  it('a selected row\'s grip drags every selected row shown, in display order; the ghost counts them; said as a count', () => {
    const t = dmake({ rows: flatRows(6), settings: { selection: { mode: 'multi' } } });
    t.app(flatRows(6));
    sel(t, 'r3', 'r1');
    t.drag('r3', ['r5', 0.7], { noUp: true });
    expect(t.ghost()!.textContent).toBe('2 rows');
    expect(['r1', 'r3', 'r2'].map((id) => t.rowEl(id)!.hasAttribute('data-dzg-moving'))).toEqual([true, true, false]);
    t.up(t.over('r5', 0.7));
    expect(t.moves()[0]!.keys).toEqual([t.K('r1'), t.K('r3')]);
    expect(t.order()).toEqual(['r0', 'r2', 'r4', 'r5', 'r1', 'r3']);
    expect(t.said()).toEqual(['2 rows moved']);
    expect([...t.g.kernel.selection.keys].sort()).toEqual([t.K('r1'), t.K('r3')].sort());
  });

  it('an unselected row\'s grip drags it alone; the selection stays', () => {
    const t = dmake({ rows: flatRows(6), settings: { selection: { mode: 'multi' } } });
    sel(t, 'r3', 'r1');
    t.drag('r0', ['r5', 0.7]);
    expect(t.moves()[0]!.keys).toEqual([t.K('r0')]);
    expect(t.g.kernel.selection.keys.size).toBe(2);
  });

  it('an « all but » selection drags the selected rows shown; past maxRows: refused, said, no layer', () => {
    const t = dmake({ rows: flatRows(6), settings: { selection: { mode: 'multi' } }, drag: { maxRows: 4 } });
    t.g.kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set([t.K('r0')]) } }, 'api');
    expect(t.g.kernel.selection.mode).toBe('exclude');
    t.drag('r2', ['r0', 0.2]);
    expect(t.layer()).toBeNull();
    expect(t.said()).toEqual(['Too many rows (4 at most)']);
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.K('r1') }, 'api');
    t.drag('r2', ['r0', 0.2]);
    expect(t.moves()[0]!.keys).toEqual(['r2', 'r3', 'r4', 'r5'].map(t.K));
  });

  it('canDrag no (or a throw) refuses the gesture, said once; canDrop no hides the place; a throw counts as no, reported once', () => {
    const report = vi.fn();
    const t = dmake({ rows: flatRows(6), drag: { canDrag: (r) => (r.id === 'r4' ? (() => { throw new Error('x'); })() : r.id !== 'r2'), canDrop: (m) => (m.target.key === t.K('r5') ? (() => { throw new Error('y'); })() : m.target.key !== t.K('r4')) } });
    t.ctx.report = report;
    t.drag('r2', ['r0', 0.2]);
    t.drag('r4', ['r0', 0.2]);
    expect(t.layer()).toBeNull();
    expect(t.said()).toEqual(['This row cannot be moved', 'This row cannot be moved']);
    t.drag('r0', ['r4', 0.7], { noUp: true });
    expect(t.bar()!.hidden).toBe(true);
    t.move(t.over('r5', 0.7));
    t.tick();
    t.move(t.over('r5', 0.6));
    t.tick();
    expect(t.bar()!.hidden).toBe(true);
    t.up(t.over('r5', 0.6));
    expect(t.moves()).toHaveLength(0);
    expect(report).toHaveBeenCalledTimes(2);
  });
});

describe('sorted, grouped, filtered (14, 15)', () => {
  it('sorted: the grips off, every way refused and said; whenSorted allow: the event goes, never applied', () => {
    const t = dmake({ rows: flatRows(6), drag: { apply: true } });
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'api');
    expect(t.g.kernel.query.sort.length).toBe(1);
    expect(t.grip('r1')!.hasAttribute('data-dzg-off')).toBe(true);
    t.drag('r1', ['r4', 0.7]);
    expect(t.layer()).toBeNull();
    t.focus('r1');
    t.altShift('ArrowDown');
    expect(t.api().step(t.K('r1'), 1)).toBe('sorted');
    expect(t.moves()).toHaveLength(0);
    expect(t.said()).toEqual(['Sorted: rows cannot be moved', 'Sorted: rows cannot be moved']);
    cleanup();
    const u = dmake({ rows: flatRows(6), drag: { apply: true, whenSorted: 'allow' } });
    u.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'api');
    expect(u.grip('r1')!.hasAttribute('data-dzg-off')).toBe(false);
    u.drag('r1', ['r4', 0.7]);
    expect(u.moves().map((m) => m.applied)).toEqual([false]);
  });

  it('grouped: refused and said', () => {
    // A grouping's seam, by hand: `grouped.by()` names a column (the grouping feature sets it at its setup).
    const grouped: GridFeature = { id: 'fake-grouping', setup: (g: GridContext<unknown>) => ((g.grouped = { by: () => ['s'] } as never), { destroy() {} }) }; // never: only `by` is read
    const t = dmake({ rows: flatRows(6), before: [grouped] });
    expect(t.api().step(t.K('r1'), 1)).toBe('grouped');
    t.drag('r1', ['r4', 0.7]);
    expect(t.said()).toEqual(['Grouped: rows cannot be moved']);
    expect(t.moves()).toHaveLength(0);
  });

  it('filtered: allowed; the managed mode leaves the hidden rows in their place', () => {
    const t = dmake({ rows: flatRows(6), drag: { apply: true } });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'notEqual', value: 2 } }, 'api');
    const shown = t.order();
    expect(shown).not.toContain('r2');
    t.drag('r0', ['r3', 0.7]);
    expect(t.moves()[0]!.applied).toBe(true);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: null }, 'api');
    expect(t.order()).toEqual(['r1', 'r2', 'r3', 'r0', 'r4', 'r5']);
  });
});

describe('pinned rows, a row no longer shown (25, 27)', () => {
  it('pinned rows have no grip and are never targets', () => {
    const pins = pinnedRows<R>({ top: [{ id: 'p0', name: 'P', n: 0, s: 's', q: 0 }] });
    const t = dmake({ rows: flatRows(4), messages: join(DMSG.en, EN_PINNED), before: [pins] });
    expect(t.ctx.el.root.querySelectorAll('.dzg-pins .dzg-row')).toHaveLength(1);
    expect(t.ctx.el.root.querySelectorAll('.dzg-pins .dzg-grip')).toHaveLength(0);
    expect(t.api().move([t.K('r1')], { key: pinnedKey('top', 'p0')!, where: 'before' })).toBe('unknown');
  });

  it('a moved row the application does not give back: « Row moved », never a place', () => {
    const t = dmake({ rows: flatRows(4) });
    t.g.kernel.subscribe((e) => e.type === 'rowMove' && (t.g.kernel.rows as { setRows(r: R[]): unknown }).setRows(flatRows(4).filter((r) => r.id !== 'r0')));
    t.drag('r0', ['r2', 0.7]);
    expect(t.said()).toEqual(['Row moved']);
  });
});

describe('the managed mode (Q-RD1)', () => {
  it('apply: true reorders the same objects, applied: true; the selection and the focus kept', () => {
    const rows = flatRows(6);
    const t = dmake({ rows, drag: { apply: true }, settings: { selection: { mode: 'multi' } } });
    sel(t, 'r4');
    t.focus('r1', 'n');
    t.drag('r1', ['r4', 0.7]);
    const m = t.moves()[0]!;
    expect(m.applied).toBe(true);
    expect(t.order()).toEqual(['r0', 'r2', 'r3', 'r4', 'r1', 'r5']);
    expect(rows.every((r) => t.g.kernel.rows.row(t.K(r.id))!.data === r)).toBe(true);
    expect([...t.g.kernel.selection.keys]).toEqual([t.K('r4')]);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: t.K('r1'), column: 'n' });
    expect(t.said()).toEqual(['Row 5 of 6']);
    expect(t.events.filter((e) => e.type === 'modelUpdated').length).toBeGreaterThan(0);
  });
});

describe('server sources (16)', () => {
  it('apply is ignored and told once; moves among the rows held go as events; loading rows have no grip', () => {
    const calls: { ok(v: unknown): void; offset: number; size: number }[] = [];
    const source: DataSource<R> = { fetch: (req) => ({ then(ok: (v: never) => void) { calls.push({ ok: ok as never, offset: req.page!.offset, size: req.page!.size }); } }) as never }; // never: a thenable answered by the test
    const host = document.body.appendChild(document.createElement('div'));
    const f = rowDrag<R>({ apply: true });
    const events: Moved[] = [];
    const problems: string[] = [];
    // never: a server's settings without its query type
    const g = createGrid<R>(host, { source: infiniteRows(source, { blockSize: 10 }), getRowId: (r: R) => r.id, columns: [{ id: 'name' }], messages: DMSG.en, features: [f], onEvent: (e: GridEvent<R>) => (e.type === 'rowMove' ? events.push(e as Moved) : e.type === 'problems' && problems.push(...e.problems.map((p) => `${p.code} ${p.path}`))) } as never, { sync: true, geometry: { read: () => ({ block: 400, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop: () => {}, writeScrollInline: () => {} } }) as GridInstance<R, any>; // any: the server model's type
    const c = calls[0]!;
    c.ok({ rows: Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, name: `n${i}` })), total: 100 });
    expect(problems).toEqual(['invalid-setting rowDrag.apply']);
    expect(host.querySelectorAll('.dzg-row[data-kind="loading"] .dzg-grip')).toHaveLength(0);
    expect(host.querySelectorAll('.dzg-grip').length).toBeGreaterThan(0);
    const d = g.kernel.rows.displayed;
    expect(f.api(g)!.step(d.keyAt(d.index(0)!), 1)).toBe('moved');
    expect(events.map((e) => [e.applied, e.target.where])).toEqual([[false, 'after']]);
    // The last row held: its next place is a loading row, never a target.
    expect(f.api(g)!.step(d.keyAt(d.index(9)!), 1)).toBe('edge');
    g.destroy();
  });
});
