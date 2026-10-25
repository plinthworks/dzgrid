// `@dzgrid/dom/range`, the keys (docs/behaviors/range-selection.md 5–7, owner QB1, QB2, S11-Q2; step11a-plan.md
// « Keys »): Shift with the grid's own moves, mirrored right to left; the focus on the moving corner; Ctrl+A and
// Shift+Space keep the focus; never into the header; owners other than the cell keep their keys.
import { describe, it, expect, afterEach } from 'vitest';
import { definePart } from '../src/part.js';
import { tree } from '../src/tree.js';
import { edit } from '../src/edit.js';
import { editors } from '../src/editors.js';
import { detail } from '../src/detail.js';
import { EN } from '../src/locales/en.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { cells, cleanup, ids, join, rmake, rowsOf, type R } from './support-range.js';

afterEach(cleanup);

const ALL = ['name', 'n', 's', 'q'];

describe('range keys: Shift with the grid\'s moves (range-selection.md 7)', () => {
  it('Shift+↓ twice then Shift+→: the block from the anchor, the focus on the moving corner after each key (QB2)', () => {
    const t = rmake();
    t.focus('r1', 'n');
    expect(t.press('ArrowDown', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(t.where()).toBe('r2/n');
    expect(t.block()).toBe('r1/n:r2/n');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.where()).toBe('r3/n');
    t.press('ArrowRight', { shiftKey: true });
    expect(t.where()).toBe('r3/s');
    expect(t.block()).toBe('r1/n:r3/s');
    expect(t.ranged()).toEqual(cells(ids(1, 3), ['n', 's']));
    expect(t.changes().map((e) => e.source)).toEqual(['user', 'user', 'user']);
  });

  it('keeps the anchor across keys: back over it the block turns, never restarts', () => {
    const t = rmake();
    t.focus('r5', 'n');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowUp', { shiftKey: true });
    t.press('ArrowUp', { shiftKey: true });
    t.press('ArrowUp', { shiftKey: true });
    expect(t.block()).toBe('r5/n:r3/n');
    expect(t.ranged()).toEqual(cells(ids(3, 5), ['n']));
  });

  it('back to one cell: no block (one cell is the focus, RS 5), told once as null', () => {
    const t = rmake();
    t.focus('r1');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowUp', { shiftKey: true });
    expect(t.block()).toBeNull();
    expect(t.ranged()).toEqual([]);
    expect(t.changes().map((e) => e.range === null)).toEqual([false, true]);
    expect(t.where()).toBe('r1/name');
  });

  it('right to left: Shift+← goes toward the logical end, Shift+→ toward the start (mirrored by intentFor)', () => {
    const t = rmake({ lang: 'ar' });
    t.focus('r1', 'n');
    t.press('ArrowLeft', { shiftKey: true });
    expect(t.where()).toBe('r1/s');
    expect(t.block()).toBe('r1/n:r1/s');
    t.press('ArrowRight', { shiftKey: true });
    t.press('ArrowRight', { shiftKey: true });
    expect(t.where()).toBe('r1/name');
    expect(t.block()).toBe('r1/n:r1/name');
  });

  it('Shift+Home / Shift+End: the row\'s first / last visible column; Ctrl+Shift+Home / End: the first / last cell shown', () => {
    const t = rmake({ rows: rowsOf(30) });
    t.focus('r4', 'n');
    t.press('End', { shiftKey: true });
    expect(t.block()).toBe('r4/n:r4/q');
    t.press('Home', { shiftKey: true });
    expect(t.block()).toBe('r4/n:r4/name');
    t.press('End', { shiftKey: true, ctrlKey: true });
    expect(t.block()).toBe('r4/n:r29/q');
    expect(t.where()).toBe('r29/q');
    t.press('Home', { shiftKey: true, ctrlKey: true });
    expect(t.block()).toBe('r4/n:r0/name');
    t.press('ArrowDown', { shiftKey: true, ctrlKey: true });
    expect(t.block()).toBe('r4/n:r29/name');
  });

  it('Shift+PageDown / PageUp: the router\'s own page (the same row a plain PageDown reaches)', () => {
    const plain = rmake();
    plain.focus('r2');
    plain.press('PageDown');
    const reached = plain.where();
    const t = rmake();
    t.focus('r2');
    t.press('PageDown', { shiftKey: true });
    expect(t.where()).toBe(reached);
    expect(t.block()).toBe(`r2/name:${reached}`);
    t.press('PageUp', { shiftKey: true });
    expect(t.block()).toBeNull();
  });

  it('Shift+PageDown over rows of their own heights (a detail open): the same row as the plain key', () => {
    const part = definePart('detail', { mount: (host) => ((host.textContent = 'panel'), {}) });
    const messages = join(EN, EN_RANGE, EN_DETAIL);
    const make = () => rmake({ messages, features: (r) => [detail<R>({ part, height: 150 }), r] });
    const plain = make();
    plain.g.kernel.dispatch({ type: 'rows.expand', rows: [plain.g.kernel.rows.displayed.keyAt(plain.g.kernel.rows.displayed.index(3)!)], expanded: true }, 'api');
    plain.focus('r1');
    plain.press('PageDown');
    const reached = plain.where();
    const t = make();
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(3)!)], expanded: true }, 'api');
    t.focus('r1');
    t.press('PageDown', { shiftKey: true });
    expect(t.where()).toBe(reached);
    expect(t.block()).toBe(`r1/name:${reached}`);
  });

  it('a detail is one stop: Shift+↓ from a master lands on its detail, then on the next row; the panel is never tinted', () => {
    const part = definePart('detail', { mount: (host) => ((host.textContent = 'panel'), {}) });
    const t = rmake({ messages: join(EN, EN_RANGE, EN_DETAIL), features: (r) => [detail<R>({ part, height: 64 }), r] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(1)!)], expanded: true }, 'api');
    t.focus('r1', 'n');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.where()).toBe('xr1/*');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.where()).toBe('r2/n');
    expect(t.block()).toBe('r1/n:r2/n');
    expect(t.ranged()).toEqual(['r1/n', 'r2/n']);
    expect(t.rowEl('xr1')!.querySelector('.dzg-dcell')!.classList.contains('dzg-cell--range')).toBe(false);
  });

  it('Shift+↑ on the first row stays out of the header: the key is taken, nothing moves', () => {
    const t = rmake();
    t.focus('r0', 'n');
    const e = t.press('ArrowUp', { shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(t.where()).toBe('r0/n');
    expect(t.g.kernel.focus).toMatchObject({ kind: 'cell', column: 'n' });
    expect(t.block()).toBeNull();
    // From inside a block, the corner stops at row 0 too.
    t.focus('r2', 'n');
    t.press('ArrowUp', { shiftKey: true });
    t.press('ArrowUp', { shiftKey: true });
    t.press('ArrowUp', { shiftKey: true });
    expect(t.block()).toBe('r2/n:r0/n');
    expect(t.where()).toBe('r0/n');
  });

  it('on a Mac Cmd is the command key: Cmd+Shift+↓ goes to the edge; Ctrl+Shift+↓ is not ours there', () => {
    const t = rmake({ mac: true, rows: rowsOf(20) });
    t.focus('r1');
    t.press('ArrowDown', { shiftKey: true, ctrlKey: true });
    expect(t.block()).toBeNull();
    expect(t.where()).toBe('r1/name');
    t.press('ArrowDown', { shiftKey: true, metaKey: true });
    expect(t.block()).toBe('r1/name:r19/name');
  });

  it('Ctrl+Alt (AltGr) with Shift and an arrow is the system\'s, not a block', () => {
    const t = rmake();
    t.focus('r1');
    const e = t.press('ArrowDown', { shiftKey: true, ctrlKey: true, altKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(t.block()).toBeNull();
  });
});

describe('range keys: Ctrl+A and Shift+Space (QB1, S11-Q2)', () => {
  it('Ctrl+A: every cell shown, the focus stays; rows are not ticked (multi selection on)', () => {
    const t = rmake({ rows: rowsOf(12), settings: { selection: { mode: 'multi', checkbox: true } } });
    t.focus('r3', 'n');
    expect(t.press('a', { ctrlKey: true, code: 'KeyA' }).defaultPrevented).toBe(true);
    expect(t.block()).toBe('r0/name:r11/q');
    expect(t.where()).toBe('r3/n');
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.g.kernel.selection.mode).toBe('include');
  });

  it('Ctrl+A by the physical key: AZERTY (q on KeyA) and the Arabic layout (ش on KeyA)', () => {
    for (const key of ['q', 'ش']) {
      const t = rmake({ rows: rowsOf(5) });
      t.focus('r1');
      t.press(key, { ctrlKey: true, code: 'KeyA' });
      expect(t.block(), key).toBe('r0/name:r4/q');
    }
  });

  it('Ctrl+A on a column header selects every cell too, the header keeps the focus', () => {
    const t = rmake({ rows: rowsOf(5) });
    const h = t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!;
    h.focus();
    t.press('a', { ctrlKey: true, code: 'KeyA' });
    expect(t.block()).toBe('r0/name:r4/q');
    expect(t.where()).toBe('header/n');
  });

  it('after Ctrl+A a Shift+arrow starts afresh from the focused cell', () => {
    const t = rmake({ rows: rowsOf(12) });
    t.focus('r3', 'n');
    t.press('a', { ctrlKey: true, code: 'KeyA' });
    t.press('ArrowDown', { shiftKey: true });
    expect(t.block()).toBe('r3/n:r4/n');
    expect(t.where()).toBe('r4/n');
  });

  it('Shift+Space: the whole row (visible columns), the focus stays; then Shift+↓ starts from the focused cell', () => {
    const t = rmake();
    t.focus('r2', 's');
    expect(t.press(' ', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(t.block()).toBe('r2/name:r2/q');
    expect(t.ranged()).toEqual(cells(['r2'], ALL));
    expect(t.where()).toBe('r2/s');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.block()).toBe('r2/s:r3/s');
  });
});

describe('range keys: who has the key', () => {
  it('a field or a widget in a cell, a filter input, a popup, an editor: Shift+arrows are theirs', () => {
    const t = rmake();
    t.focus('r1');
    for (const owner of ['filter-input', 'popup', 'editor']) {
      const el = document.createElement('input');
      el.dataset['dzgOwner'] = owner;
      t.vp.append(el);
      el.focus();
      t.press('ArrowDown', { shiftKey: true }, el);
      t.press('a', { ctrlKey: true, code: 'KeyA' }, el);
      expect(t.block(), owner).toBeNull();
      el.remove();
    }
    const widget = document.createElement('button');
    t.cell('r1')!.append(widget);
    widget.focus();
    t.press('ArrowDown', { shiftKey: true }, widget);
    t.press(' ', { shiftKey: true }, widget);
    expect(t.block()).toBeNull();
  });

  it('an editor open in the cell: Shift+arrows select its text, the grid makes no block', () => {
    const messages = join(EN, EN_RANGE, EN_EDIT, EN_EDITORS);
    const t = rmake({ messages, columns: [{ id: 'name', header: 'Name', width: 120, editable: true }, { id: 'n', header: 'N', type: 'number', width: 80 }], features: (r) => [edit(), editors(), r] });
    t.focus('r1');
    t.press('F2');
    const field = t.host.querySelector<HTMLElement>('.dzg-field')!;
    expect(field).not.toBeNull();
    t.press('ArrowLeft', { shiftKey: true }, field);
    t.press('ArrowDown', { shiftKey: true }, field);
    expect(t.block()).toBeNull();
  });

  it('Escape with a tooltip shown hides the tooltip first (the router\'s), the second drops the block', () => {
    const t = rmake();
    t.focus('r1');
    t.press('ArrowDown', { shiftKey: true });
    t.ctx.el.tooltip.hidden = false;
    t.press('Escape');
    expect(t.ctx.el.tooltip.hidden).toBe(true);
    expect(t.block()).toBe('r1/name:r2/name');
    t.press('Escape');
    expect(t.block()).toBeNull();
    expect(t.where()).toBe('r2/name');
  });

  it('Escape without a block is the grid\'s (not taken)', () => {
    const t = rmake();
    t.focus('r1');
    expect(t.press('Escape').defaultPrevented).toBe(false);
  });

  it('the same keys with the features in either order: tree, edit, editors, range — a block on the tree column; plain → stays the tree\'s', () => {
    const rows: R[] = [{ ...rowsOf(1)[0]!, id: 'p', parent: null }, { ...rowsOf(2)[1]!, id: 'c1', parent: 'p' }, { ...rowsOf(3)[2]!, id: 'c2', parent: 'p' }, { ...rowsOf(4)[3]!, id: 'q', parent: null }];
    const messages = join(EN, EN_RANGE, EN_TREE, EN_EDIT, EN_EDITORS);
    for (const order of ['first', 'last'] as const) {
      const t = rmake({ rows, messages, features: (r) => (order === 'first' ? [r, editors(), edit(), tree<R>({ parentId: (x) => x.parent ?? null })] : [tree<R>({ parentId: (x) => x.parent ?? null }), edit(), editors(), r]) });
      t.focus('p');
      t.press('ArrowDown', { shiftKey: true });
      expect(t.block(), order).toBe('p/name:q/name');
      t.press('Escape');
      // Forward on a closed parent: the tree opens it, no block.
      t.focus('p');
      t.press('ArrowRight');
      expect(t.g.kernel.rows.displayed.count, order).toBe(4);
      expect(t.block(), order).toBeNull();
      t.press('ArrowDown', { shiftKey: true });
      expect(t.block(), order).toBe('p/name:c1/name');
    }
  });
});

describe('range keys: review of step 11a (the analyser\'s gaps)', () => {
  it('Escape drops the block with the source user', () => {
    const t = rmake();
    t.focus('r1');
    t.press('ArrowDown', { shiftKey: true });
    t.events.length = 0;
    t.press('Escape');
    expect(t.changes().map((e) => e.source)).toEqual(['user']);
  });
});
