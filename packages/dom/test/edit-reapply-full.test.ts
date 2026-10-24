// Phase 5 step 7, K.14 in full (edit-reapply.md 6, editing.md 26; step07-plan.md « K.14 in full »): after the
// application's reapply with the focus in the body, the focused cell is scrolled into view, clear of the pinned
// columns; an editor open meanwhile stays when its cell stays mounted and is kept (lost) when it goes; a muted
// focused row that leaves gives the focus to the nearest row, never to the page.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { cleanup, ed, k, type R } from './support-editors.js';

afterEach(cleanup);

const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 200, editable: true, pinned: 'start' },
  { id: 'n', header: 'Stock', type: 'number', width: 200, editable: true },
  { id: 's', header: 'Shelf', width: 300 },
  { id: 'q', header: 'Price', type: 'number', width: 300, editable: true },
];
const sorted = () => {
  const t = ed({ columns: COLS });
  t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'api');
  return t;
};
const put = (t: ReturnType<typeof ed>, id: string, col: string, text: string) => t.api.commit([{ key: k(id), column: col, input: { text } }]);

describe('the application\'s reapply (edit-reapply.md 6)', () => {
  it('the focus in the body: the focused cell scrolled into view, its row moved far down', () => {
    const t = sorted();
    t.at('r3', 'n');
    put(t, 'r3', 'n', '9999');
    expect(t.g.kernel.orderStale).toBe(true);
    t.api.reapply();
    expect(t.g.kernel.orderStale).toBe(false);
    expect(t.g.kernel.rows.displayed.indexOf(k('r3'))).toBe(199);
    // Seen: mounted and focused (the last row's top inside the view).
    expect(t.cell('r3', 'n')).not.toBeNull();
    expect(document.activeElement).toBe(t.cell('r3', 'n'));
    expect(t.box.scrollTop).toBeGreaterThanOrEqual(200 * 32 - 320);
  });

  it('clear of the pinned column: a centre cell scrolled under it comes out', () => {
    const t = sorted();
    t.at('r3', 'q');
    put(t, 'r3', 'n', '9999');
    // The view scrolled sideways past the focused column (it sits under the pinned one now).
    t.box.scrollInline = 900;
    t.vp.dispatchEvent(new Event('scroll'));
    t.api.reapply();
    // The centre starts after the 200 px pinned column: q (at 500–800 in the centre) wholly in the 400 px left.
    expect(t.box.scrollInline).toBeLessThanOrEqual(500);
    expect(t.box.scrollInline + 400).toBeGreaterThanOrEqual(800);
    expect(document.activeElement).toBe(t.cell('r3', 'q'));
  });

  it('the focus on the header (the mark pressed): it stays there', () => {
    const t = sorted();
    put(t, 'r3', 'n', '9999');
    const h = t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!;
    t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"] .dzg-reapply')!.click();
    expect(document.activeElement).toBe(h);
  });

  it('the focus outside the grid: not taken, nothing scrolled', () => {
    const t = sorted();
    t.at('r3', 'n');
    put(t, 'r3', 'n', '9999');
    const out = document.body.appendChild(document.createElement('button'));
    out.focus();
    const at = [t.box.scrollTop, t.box.scrollInline];
    t.api.reapply();
    expect(document.activeElement).toBe(out);
    // Analyser 6: nothing scrolled either.
    expect([t.box.scrollTop, t.box.scrollInline]).toEqual(at);
  });

  it('an editor open on a row that stays mounted: the field stays, its text kept', () => {
    const t = sorted();
    put(t, 'r1', 'n', '9999');
    t.at('r5', 'name');
    t.key('F2');
    t.type('Zed');
    t.api.reapply();
    expect(t.field()?.value).toBe('Zed');
    expect(t.of('editingStopped')).toEqual([]);
  });

  it('an editor open on a row that moves far: the field stays (the focused row is retained), its text kept, scrolled into view', () => {
    const t = sorted();
    put(t, 'r1', 'n', '9999');
    t.at('r1', 'name');
    t.key('F2');
    t.type('Zed');
    t.api.reapply();
    expect(t.g.kernel.rows.displayed.indexOf(k('r1'))).toBe(199);
    expect(t.field()?.value).toBe('Zed');
    expect(document.activeElement).toBe(t.field());
    expect(t.box.scrollTop).toBeGreaterThanOrEqual(200 * 32 - 320);
  });

  it('a muted focused row that leaves: the focus on the nearest row\'s cell, never the page', () => {
    const t = ed({ columns: COLS });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'lt', value: 100 } }, 'api');
    t.at('r5', 'n');
    put(t, 'r5', 'n', '500');
    expect(t.row('r5')!.hasAttribute('data-dzg-stale')).toBe(true);
    t.api.reapply();
    expect(t.row('r5')).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(['r4/n', 'r6/n']).toContain(t.focusAt());
    expect(document.activeElement).toBe(t.cell(t.focusAt()!.split('/')[0]!, 'n'));
  });
});
