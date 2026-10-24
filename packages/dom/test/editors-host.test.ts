// The editor host (Phase 5 step 5: moved from the base's `render/editor.ts` into `@dzgrid/dom/editors`, same
// contract; ARCH retained-row contract 5–6, editing.md 17–18): the field put in the mounted cell, the cell left
// alone by the paint while it is there, closed by focusing the cell first; `lost` when the cell leaves the page.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import type { GridFeature } from '../src/features.js';
import { EN } from '../src/locales/en.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { edit } from '../src/edit.js';
import { editorHost, type EditorHost } from '../src/editors/host.js';
import { cleanup, emake, join, k, rowsOf, type R } from './support-edit.js';

afterEach(cleanup);

/** The host alone, on a grid, as `editors()` sets it up: its lost check after the rows, its destroy with the grid. */
let H!: EditorHost;
const hostFeature = (): GridFeature => ({
  id: 'test-host',
  setup(g) {
    H = editorHost(g);
    return { afterRows: () => H.paint(), destroy: () => H.destroy() };
  },
});

describe('the editor host (retained-row contract 5–6)', () => {
  const settings = { features: [edit(), hostFeature()], messages: join(EN, EN_EDIT) };
  const columns: ColumnDef<R, any>[] = [{ id: 'name', width: 120 }, { id: 'n', type: 'number', width: 80, editable: true, ui: { cellClass: (c) => ((c.value as number) > 100 ? 'big' : null) } }, { id: 'q', type: 'number', width: 80 }];

  function open(id = 'r2', col = 'n') {
    const m = emake({ columns, rows: rowsOf(20000), settings });
    m.g.api.focusCell(k(id), col);
    const field = document.createElement('input');
    const lost = vi.fn();
    const ok = H.open(k(id), col, field, lost);
    return { ...m, field, lost, ok };
  }

  it('puts the field in the mounted cell, marked as the editor', () => {
    const { ok, field, cell, ctx } = open();
    expect(ok).toBe(true);
    expect(field.parentElement).toBe(cell('r2', 'n'));
    expect(field.getAttribute('data-dzg-owner')).toBe('editor');
    expect(cell('r2', 'n')!.hasAttribute('data-dzg-editing')).toBe(true);
    expect(ctx.editor?.cell).toBe(cell('r2', 'n'));
  });

  it('refuses a cell that is not mounted', () => {
    const m = emake({ columns, rows: rowsOf(2000), settings });
    expect(H.open(k('r1500'), 'n', document.createElement('input'), () => {})).toBe(false);
    expect(m.ctx.editor ?? null).toBeNull();
  });

  it('rule 5: a host update changes the row’s other cells, never the edited one', () => {
    const { g, cell, field } = open();
    const c = cell('r2', 'n')!;
    g.kernel.rows.applyTransaction({ update: [{ id: 'r2', name: 'Changed', n: 500, s: '', q: 9 }] });
    expect(cell('r2', 'name')!.textContent).toBe('Changed');
    expect(cell('r2', 'q')!.textContent).toBe('9');
    expect(cell('r2', 'n')).toBe(c);
    expect(c.firstChild!.textContent).toBe('2');
    expect(c.classList.contains('big')).toBe(false);
    expect(field.parentElement).toBe(c);
  });

  it('rule 5: scrolled 10 000 rows away and back, the same field in the same cell', () => {
    const { scroll, cell, field } = open();
    const c = cell('r2', 'n');
    scroll(32 * 10000);
    scroll(0);
    expect(cell('r2', 'n')).toBe(c);
    expect(field.parentElement).toBe(c);
    expect(field.isConnected).toBe(true);
  });

  it('rule 6: closing focuses the cell first, then removes the field; the focus is never on body', () => {
    const { ctx, field, cell } = open();
    field.focus();
    const c = cell('r2', 'n')!;
    let at: Element | null = null;
    const remove = field.remove.bind(field);
    field.remove = () => { at = document.activeElement; remove(); };
    H.shut(true);
    expect(at).toBe(c);
    expect(field.isConnected).toBe(false);
    expect(c.hasAttribute('data-dzg-editing')).toBe(false);
    expect(ctx.editor ?? null).toBeNull();
    expect(document.activeElement).toBe(c);
  });

  it('the edited cell shows the new value once closed', () => {
    const { g, ctx, cell } = open();
    g.kernel.rows.applyTransaction({ update: [{ id: 'r2', name: 'x', n: 77, s: '', q: 9 }] });
    expect(cell('r2', 'n')!.firstChild!.textContent).toBe('2');
    H.shut(true);
    expect(cell('r2', 'n')!.textContent).toBe('77');
  });

  it('lost: the row removed → `lost` once, the field gone, the focus on a cell', () => {
    const { g, lost, field, ctx } = open();
    field.focus();
    g.kernel.rows.applyTransaction({ remove: ['r2'] });
    ctx.schedule();
    expect(lost).toHaveBeenCalledTimes(1);
    expect(field.isConnected).toBe(false);
    expect(ctx.editor ?? null).toBeNull();
    expect(document.activeElement?.closest('.dzg-cell, .dzg-viewport')).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('lost: the column hidden → `lost` once', () => {
    const { g, lost, ctx } = open();
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] }, 'api');
    ctx.schedule();
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('lost: the grid destroyed → `lost`', () => {
    const { g, lost } = open();
    g.destroy();
    expect(lost).toHaveBeenCalledTimes(1);
  });
});


describe('the base without the host', () => {
  it('has no editor host of its own any more (moved to @dzgrid/dom/editors)', () => {
    const { ctx } = emake();
    expect('openEditor' in ctx).toBe(false);
    expect('closeEditor' in ctx).toBe(false);
    expect(typeof ctx.step).toBe('function');
  });
});
