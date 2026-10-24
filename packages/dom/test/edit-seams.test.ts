// The DOM seams of editing in the base (Phase 5 step 4, docs/phase-5-steps/step04-plan.md « Base API »;
// editing.md 3, 17, 18; ARCH retained-row contract 5–6): the overlay read in the paint, `touch`, the
// computed `aria-readonly`, the editor host (rules 5–6, lost), the tooltip's description by token.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef, ResolvedColumn, RowKey } from '@dzgrid/core';
import type { GridFeature } from '../src/features.js';
import type { GridContext } from '../src/context.js';
import type { SlotPart } from '../src/part.js';
import { tree } from '../src/tree.js';
import { EN } from '../src/locales/en.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { lockColumns } from '@dzgrid/core/internal';
import { cleanup, emake, join, k, rowsOf, COLUMNS, type R } from './support-edit.js';

afterEach(cleanup);

/** A feature giving the edit seam: values from `over` (row id → column → value), else the column's. */
function seam(over: Map<string, Map<string, unknown>> = new Map()) {
  const reads = vi.fn();
  let g!: GridContext<unknown>;
  const f: GridFeature = {
    id: 'test-edit',
    setup: (ctx) => {
      g = ctx;
      return {
        edit: {
          read(col: ResolvedColumn<unknown>, row: unknown, key: RowKey) {
            reads(key, col.id);
            const id = (row as R).id;
            const m = over.get(id);
            return m?.has(col.id) ? m.get(col.id) : col.read(row as never);
          },
        },
        destroy() {},
      };
    },
  };
  return { f, reads, over, get g() { return g; }, set: (id: string, col: string, v: unknown) => { if (!over.has(id)) over.set(id, new Map()); over.get(id)!.set(col, v); } };
}

const wide: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'n', header: 'N', type: 'number', width: 80, ui: { cellClass: (c) => ((c.value as number) % 2 ? 'odd' : null) } },
  { id: 's', header: 'S', width: 80, ui: { cell: 'tag' } },
  { id: 'q', header: 'Q', type: 'number', width: 80 },
  { id: 'a', header: 'A', value: (r: R) => `a${r.n}`, width: 90 },
  { id: 'b', header: 'B', value: (r: R) => `b${r.q}`, width: 90 },
  { id: 'c', header: 'C', value: (r: R) => `ق ${r.n}`, width: 90 },
  { id: 'd', header: 'D', type: 'number', value: (r: R) => r.n * 1.5, width: 90 },
];
const tag: SlotPart<'cell'> = { slot: 'cell', part: { mount(host, c) { const s = document.createElement('b'); s.textContent = `<${c.text}>`; host.append(s); return { update(n) { s.textContent = `<${n.text}>`; } }; } } };

describe('no seam: the paint is the one before the change', () => {
  it('a 200 × 8 grid sorted, filtered, scrolled, with parts, cell classes, a box column, right to left: the same DOM', async () => {
    const { g, host, scroll } = emake({ columns: wide, settings: { direction: 'rtl', parts: { tag }, selection: { mode: 'multi', checkbox: true } } });
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'q', dir: 'desc' }] }, 'api');
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 10 } }, 'api');
    scroll(1000);
    g.kernel.rows.applyTransaction({ update: [{ id: 'r50', name: 'Renamed', n: 51, s: 'x', q: 3 }] });
    g.api.focusCell(k('r60'), 'q');
    const html = host.innerHTML.replace(/dzg-tip-\d+/g, 'dzg-tip-N');
    await expect(html).toMatchFileSnapshot('./fixtures/edit-seams-no-seam.html');
  });
});

describe('the read seam', () => {
  it('shows the seam’s value once the row is touched; the rule and the part run for that row only', () => {
    const s = seam();
    const rule = vi.fn((c: { value: unknown }) => ((c.value as number) > 1000 ? 'big' : null));
    const updates: string[] = [];
    const part: SlotPart<'cell'> = { slot: 'cell', part: { mount(host, c) { host.textContent = String(c.text); return { update(n) { updates.push(String((n.row as R).id)); host.textContent = String(n.text); } }; } } };
    const columns: ColumnDef<R, any>[] = [{ id: 'name', width: 120 }, { id: 'n', type: 'number', width: 80, ui: { cellClass: rule } }, { id: 's', width: 80, ui: { cell: 'p' } }];
    const { ctx, cell } = emake({ columns, settings: { features: [s.f], parts: { p: part } } });
    expect(cell('r3', 'n')!.textContent).toBe('3');
    s.set('r3', 'n', 4242);
    s.set('r3', 's', 'edited');
    const before = rule.mock.calls.length;
    // Without a touch, the row is the same: nothing is asked again.
    ctx.schedule();
    expect(cell('r3', 'n')!.textContent).toBe('3');
    expect(rule.mock.calls.length).toBe(before);
    ctx.rowRenderer.touch([k('r3')]);
    ctx.schedule();
    expect(cell('r3', 'n')!.textContent).toBe('4,242');
    expect(cell('r3', 'n')!.classList.contains('big')).toBe(true);
    expect(cell('r3', 's')!.textContent).toBe('edited');
    // Only r3's cells were asked again (two of its cells hold a rule or a part).
    const rows = rule.mock.calls.slice(before).map((c) => (c[0] as unknown as { row: R }).row.id);
    expect(new Set(rows)).toEqual(new Set(['r3']));
    expect(updates).toEqual(['r3']);
  });

  it('is the only reader of a data cell when given; a filler or a row without data never asks it', () => {
    const s = seam();
    emake({ settings: { features: [s.f] } });
    expect(s.reads).toHaveBeenCalled();
    for (const [key] of s.reads.mock.calls) expect(String(key)).toMatch(/^d:/);
  });

  it('reaches a tree’s pinned parent copy too', () => {
    const s = seam();
    type T = { id: string; parent: string | null; name: string; n: number; s: string; q: number };
    const rows: T[] = [{ id: 'P', parent: null, name: 'Parent', n: 0, s: '', q: 0 }, ...Array.from({ length: 60 }, (_, i): T => ({ id: `c${i}`, parent: 'P', name: `Child ${i}`, n: i + 1, s: '', q: 0 }))];
    const { g, ctx, host, scroll } = emake({ rows: rows as never, settings: { messages: join(EN, EN_TREE), features: [tree<R>({ parentId: (r) => (r as unknown as T).parent }), s.f] } });
    g.kernel.dispatch({ type: 'rows.expand', rows: [k('P')], expanded: true }, 'api');
    scroll(32 * 20);
    const copy = () => host.querySelector<HTMLElement>('.dzg-sticky [data-col="name"]');
    expect(copy()!.textContent).toContain('Parent');
    s.set('P', 'name', 'Edited parent');
    ctx.rowRenderer.touch([k('P')]);
    ctx.schedule();
    expect(copy()!.textContent).toContain('Edited parent');
  });
});

describe('touch and the spawned renderers (review 8)', () => {
  it('a spawned renderer is told (its rev bumped) only when it holds the row', () => {
    const { ctx } = emake();
    const s = ctx.rowRenderer.spawn(document.createElement('div'));
    const was = s.rev;
    ctx.rowRenderer.touch([k('r1')]);
    expect(s.rev).toBe(was);
  });
});

describe('aria-readonly (editing.md 3)', () => {
  it('a structure column locked by a tree, then a new context: its cells stay read-only (test gap 11)', () => {
    const columns: ColumnDef<R, any>[] = [{ id: 'name', width: 120 }, { id: 'n', type: 'number', width: 80, editable: true }, { id: 'q', type: 'number', width: 80, editable: (_r: R, c: unknown) => c === 'yes' }];
    const { g, cell } = emake({ columns, settings: { context: 'no' } });
    lockColumns(g.kernel, ['n']);
    g.update({ context: 'yes' });
    expect(cell('r1', 'n')!.getAttribute('aria-readonly')).toBe('true');
    expect(cell('r1', 'q')!.getAttribute('aria-readonly')).toBeNull();
  });

  const ro = (el: Element | null) => el?.getAttribute('aria-readonly') ?? null;

  it('no editable column: the grid says it, no cell does', () => {
    const { host, vp } = emake();
    expect(ro(vp)).toBe('true');
    expect(host.querySelectorAll('.dzg-cell[aria-readonly]').length).toBe(0);
  });

  it('one editable column: the grid says nothing, each cell that cannot be edited says it', () => {
    const columns: ColumnDef<R, any>[] = [{ id: 'name', width: 120 }, { id: 'n', type: 'number', width: 80, editable: true }, { id: 'q', type: 'number', width: 80, editable: (r: R) => r.n % 2 === 0 }];
    const { vp, cell, host } = emake({ columns, settings: { selection: { mode: 'multi', checkbox: true } } });
    expect(ro(vp)).toBeNull();
    expect(ro(cell('r1', 'name'))).toBe('true');
    expect(ro(cell('r1', 'n'))).toBeNull();
    expect(ro(cell('r1', 'q'))).toBe('true');
    expect(ro(cell('r2', 'q'))).toBeNull();
    // The box cell is never a value to edit.
    expect([...host.querySelectorAll('.dzg-layer .dzg-check')].every((c) => ro(c) === 'true')).toBe(true);
  });

  it('a rule that throws: read-only and one warning', () => {
    const columns: ColumnDef<R, any>[] = [{ id: 'name', width: 120 }, { id: 'n', type: 'number', width: 80, editable: () => { throw new Error('no'); } }];
    const { cell, events } = emake({ columns });
    expect(ro(cell('r1', 'n'))).toBe('true');
    const warned = events.filter((e) => e.type === 'problems' && e.problems.some((p) => p.path === 'columns.n.editable'));
    expect(warned.length).toBe(1);
  });

  it('follows the context, a column hidden, a row’s data', () => {
    const columns: ColumnDef<R, any>[] = [{ id: 'name', width: 120 }, { id: 'n', type: 'number', width: 80, editable: (r: R, c: unknown) => c === 'nurse' && r.q > 10 }, { id: 'q', type: 'number', width: 80 }];
    const { g, vp, cell } = emake({ columns, settings: { context: 'guest' } });
    // r1: q = 37.
    expect(ro(cell('r1', 'n'))).toBe('true');
    g.update({ context: 'nurse' });
    expect(ro(cell('r1', 'n'))).toBeNull();
    g.kernel.rows.applyTransaction({ update: [{ id: 'r1', name: 'x', n: 1, s: '', q: 2 }] });
    expect(ro(cell('r1', 'n'))).toBe('true');
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] }, 'api');
    expect(ro(vp)).toBe('true');
    expect(ro(cell('r1', 'q'))).toBeNull();
  });

  it('a detail row’s cell says read-only when the grid edits', async () => {
    const { detail } = await import('../src/detail.js');
    const { EN_DETAIL } = await import('../src/locales/en-detail.js');
    const columns: ColumnDef<R, any>[] = [{ id: 'name', width: 120 }, { id: 'n', type: 'number', width: 80, editable: true }];
    const { g, host } = emake({ columns, settings: { messages: join(EN, EN_DETAIL), features: [detail<R>({ part: { slot: 'detail', part: { mount: (h: HTMLElement) => (h.append('x'), {}) } } } as never)] } });
    g.kernel.dispatch({ type: 'rows.expand', rows: [k('r0')], expanded: true }, 'api');
    const d = host.querySelector('.dzg-dcell');
    expect(d).not.toBeNull();
    expect(ro(d)).toBe('true');
  });
});

describe('the tooltip keeps the other descriptions (one token each)', () => {
  it('shown twice on a cell: its id once (test gap 12)', () => {
    const { ctx, cell } = emake();
    const c = cell('r1')!;
    for (let i = 0; i < 2; i++) ctx.tip.showFor(c, { text: 'Tip', col: ctx.columns.get('name')!, row: null, value: null }, 'ltr', 0);
    expect(c.getAttribute('aria-describedby')).toBe(ctx.el.tooltip.id);
  });

  it('shown and hidden on a cell, another aria-describedby token stays', () => {
    const columns: ColumnDef<R, any>[] = [{ id: 'name', width: 120, tooltip: () => 'Tip' } as ColumnDef<R, any>, ...COLUMNS.slice(1)];
    const { ctx, cell } = emake({ columns });
    const c = cell('r1')!;
    c.setAttribute('aria-describedby', 'other');
    ctx.tip.showFor(c, { text: 'Tip', col: ctx.columns.get('name')!, row: null, value: null }, 'ltr', 0);
    expect(c.getAttribute('aria-describedby')!.split(' ').sort()).toEqual(['other', ctx.el.tooltip.id].sort());
    ctx.tip.hide();
    expect(c.getAttribute('aria-describedby')).toBe('other');
  });
});
