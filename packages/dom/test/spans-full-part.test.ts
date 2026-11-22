import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnOrGroup, GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { definePart, type SlotContext, type SlotPart } from '../src/part.js';
import { spans } from '../src/spans.js';
import { EN } from '../src/locales/en.js';

/**
 * 1.17.0 fix (owner's demo, 2026-11-22): `fullWidth` answering `{ part }` draws the full-width cell with
 * that registered cell part (spans.md « Full-width rows »), mounted, updated and destroyed with the row.
 */
type R = { id: string; kind?: 'title'; name: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
});

const ROWS: R[] = [
  { id: 't1', kind: 'title', name: 'Monday', n: 0 },
  { id: 'a', name: 'ann', n: 1 },
  { id: 'b', name: 'bob', n: 2 },
];
const COLS: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }];

/** A counted cell part: its mounts, updates and destroys, and the contexts it saw. */
function counted(cls: string) {
  const life = { mounted: 0, updated: 0, gone: 0, seen: [] as SlotContext['cell'][] };
  const part = definePart('cell', {
    mount(host, c) {
      life.mounted++;
      life.seen.push(c);
      const b = document.createElement('b');
      b.className = cls;
      b.textContent = `${c.text}/${(c.row as R).id}`;
      host.append(b);
      return {
        update(c2) {
          life.updated++;
          life.seen.push(c2);
          b.textContent = `${c2.text}/${(c2.row as R).id}`;
        },
        destroy() {
          life.gone++;
        },
      };
    },
  }) as SlotPart;
  return { life, part };
}

function make(settings: Partial<GridSettings<R>>, columns = COLS, rows = ROWS) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns, messages: EN, features: [spans()], onEvent: (e) => events.push(e), ...settings }, { geometry, sync: true });
  grids.push(g);
  const full = () => host.querySelector<HTMLElement>('.dzg-layer > .dzg-row[data-full] .dzg-cell');
  const problems = () => events.flatMap((e) => (e.type === 'problems' ? e.problems : [])) as Problem[];
  return { g, host, full, problems };
}

describe('a full-width row drawn by a named part', () => {
  it('mounts that cell part with the first visible column\'s context; other rows keep their text', () => {
    const { life, part } = counted('day');
    const { full, host } = make({ parts: { day: part }, fullWidth: (r) => (r.kind === 'title' ? { part: 'day' } : false) });
    expect(full()!.querySelector('.day')!.textContent).toBe('Monday/t1');
    expect(full()!.textContent).toBe('Monday/t1');
    expect(life.mounted).toBe(1);
    const c = life.seen[0]!;
    expect([c.value, c.text, c.column.id, (c.row as R).name]).toEqual(['Monday', 'Monday', 'name', 'Monday']);
    // A normal row: the plain text, no part.
    expect(host.querySelectorAll('.day').length).toBe(1);
    expect(host.querySelector('.dzg-row[aria-rowindex="3"] [data-col="name"]')!.textContent).toBe('ann');
  });

  it('wins over the column\'s own `ui.cell` part on that row only', () => {
    const day = counted('day');
    const col = counted('col');
    const { full, host } = make({ parts: { day: day.part, col: col.part }, fullWidth: (r) => (r.kind === 'title' ? { part: 'day' } : false) }, [{ id: 'name', ui: { cell: 'col' } }, { id: 'n', type: 'number' }]);
    expect(full()!.querySelector('.day')).not.toBeNull();
    expect(full()!.querySelector('.col')).toBeNull();
    expect(host.querySelector('.dzg-row[aria-rowindex="3"] [data-col="name"] .col')!.textContent).toBe('ann/a');
  });

  it('updates with the row, and is destroyed when the row changes kind or the grid ends', () => {
    const { life, part } = counted('day');
    const { g, full, host } = make({ parts: { day: part }, fullWidth: (r) => (r.kind === 'title' ? { part: 'day' } : false) });
    g.update({ rows: [{ id: 't1', kind: 'title', name: 'Tuesday', n: 0 }, ...ROWS.slice(1)] });
    expect(full()!.textContent).toBe('Tuesday/t1');
    expect([life.mounted, life.updated, life.gone]).toEqual([1, 1, 0]);
    // No longer a title: a normal row, its plain text, the part gone.
    g.update({ rows: [{ id: 't1', name: 'Plain', n: 0 }, ...ROWS.slice(1)] });
    expect(full()).toBeNull();
    expect(host.querySelector('.day')).toBeNull();
    expect(host.querySelector('.dzg-row[aria-rowindex="2"] [data-col="name"]')!.textContent).toBe('Plain');
    expect(life.gone).toBe(1);
    // A title again, then the grid ends: mounted afresh, destroyed with it.
    g.update({ rows: [{ id: 't1', kind: 'title', name: 'Again', n: 0 }, ...ROWS.slice(1)] });
    expect(full()!.textContent).toBe('Again/t1');
    g.destroy();
    expect([life.mounted, life.gone]).toEqual([2, 2]);
  });

  it('`true` keeps the first column\'s text (or its own part)', () => {
    const { life, part } = counted('day');
    const { full } = make({ parts: { day: part }, fullWidth: (r) => r.kind === 'title' });
    expect(full()!.textContent).toBe('Monday');
    expect(life.mounted).toBe(0);
  });

  it('an unknown name: unknown-part told once, the plain text', () => {
    const rows = [...ROWS, { id: 't2', kind: 'title' as const, name: 'Friday', n: 9 }];
    const { full, problems, g } = make({ fullWidth: (r) => (r.kind === 'title' ? { part: 'nope' } : false) }, COLS, rows);
    expect(full()!.textContent).toBe('Monday');
    g.api.refresh();
    expect(problems().filter((p) => p.code === 'unknown-part')).toEqual([{ code: 'unknown-part', severity: 'error', path: 'settings.fullWidth', detail: 'nope' }]);
  });
});
