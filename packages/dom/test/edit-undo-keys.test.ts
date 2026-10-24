// Phase 5 step 8, undo and redo in the DOM (edit-undo.md 2–13, step08-plan.md « Behaviour » 1–7, « Keyboard »; owner
// S8-O2, S8-O4): Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z on a cell or a header, matched on `key` first (AZERTY's Z) and on
// `code` only when the key is not a Latin letter (an Arabic layout); never in a field, a popup, a filter input or a
// cell's widget, never while an editor waits for its paint; the focus to the first cell given back when it is shown,
// clear of the pinned columns and the sticky parents, else it stays; one sentence that replaces « Saving »;
// `api.undo()` / `api.redo()` the same path, as the application.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { tree } from '../src/tree.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { BASE, EDIT, EDITORS, cleanup, ed, join, k, rowsOf, type R } from './support-editors.js';

afterEach(cleanup);

const put = (t: ReturnType<typeof ed>, cells: [string, string, string][]) => t.api.commit(cells.map(([id, column, text]) => ({ key: k(id), column, input: { text } })));
/** The polite sentences the grid hands its live region (each task's joined). */
const polite = (t: ReturnType<typeof ed>) => {
  const said: string[] = [];
  vi.spyOn(t.ctx.live, 'announce').mockImplementation((s: string) => void said.push(s));
  return said;
};
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/** r1 Stock 50, then r2 Stock 60, then the API undoes r2's: one to undo (r1), one to redo (r2). The focus on r5/Shelf (read-only: no key there opens a field). */
function ready(o: Parameters<typeof ed>[0] = {}) {
  const t = ed(o);
  put(t, [['r1', 'n', '50']]);
  put(t, [['r2', 'n', '60']]);
  t.api.undo();
  expect([t.value('r1'), t.value('r2')]).toEqual(['50', '2']);
  t.at('r5', 's');
  t.events.length = 0;
  return t;
}
type Want = 'undo' | 'redo' | null;
const result = (t: ReturnType<typeof ed>): Want => (t.value('r1') === '1' ? 'undo' : t.value('r2') === '60' ? 'redo' : null);

describe('the keys (step08-plan « Keyboard »)', () => {
  const rows: [string, boolean, string, KeyboardEventInit & { modifierAltGraph?: boolean }, Want][] = [
    ['Ctrl+Z', false, 'z', { code: 'KeyZ', ctrlKey: true }, 'undo'],
    ['Ctrl+Y', false, 'y', { code: 'KeyY', ctrlKey: true }, 'redo'],
    ['Ctrl+Shift+Z', false, 'Z', { code: 'KeyZ', ctrlKey: true, shiftKey: true }, 'redo'],
    ['Ctrl+Shift+Y', false, 'Y', { code: 'KeyY', ctrlKey: true, shiftKey: true }, null],
    ['Ctrl+Alt+Z', false, 'z', { code: 'KeyZ', ctrlKey: true, altKey: true }, null],
    // AltGr as the systems send it (review 5): Windows Ctrl+Alt (+AltGraph), Linux AltGraph alone; neither taken.
    ['AltGr+Z on Windows (Ctrl, Alt, AltGraph)', false, 'z', { code: 'KeyZ', ctrlKey: true, altKey: true, modifierAltGraph: true }, null],
    ['AltGr+Z on Linux (AltGraph alone)', false, 'z', { code: 'KeyZ', modifierAltGraph: true }, null],
    ['AltGr+Z on a Mac (Option)', true, 'z', { code: 'KeyZ', altKey: true, modifierAltGraph: true }, null],
    ['Cmd+Z off a Mac', false, 'z', { code: 'KeyZ', metaKey: true }, null],
    ['Ctrl+Cmd+Z', false, 'z', { code: 'KeyZ', ctrlKey: true, metaKey: true }, null],
    ['Cmd+Z on a Mac', true, 'z', { code: 'KeyZ', metaKey: true }, 'undo'],
    ['Cmd+Shift+Z on a Mac', true, 'z', { code: 'KeyZ', metaKey: true, shiftKey: true }, 'redo'],
    ['Cmd+Y on a Mac', true, 'y', { code: 'KeyY', metaKey: true }, 'redo'],
    ['Ctrl+Z on a Mac', true, 'z', { code: 'KeyZ', ctrlKey: true }, null],
    ['Cmd+Option+Z on a Mac', true, 'z', { code: 'KeyZ', metaKey: true, altKey: true }, null],
    ['Ctrl+Cmd+Z on a Mac', true, 'z', { code: 'KeyZ', metaKey: true, ctrlKey: true }, null],
    ['AZERTY Ctrl+Z (key z, code KeyW)', false, 'z', { code: 'KeyW', ctrlKey: true }, 'undo'],
    ['AZERTY Ctrl+W (key w, code KeyZ)', false, 'w', { code: 'KeyZ', ctrlKey: true }, null],
    ['AZERTY Cmd+Z on a Mac', true, 'z', { code: 'KeyW', metaKey: true }, 'undo'],
    ['Arabic Ctrl+ظ (code KeyZ)', false, 'ظ', { code: 'KeyZ', ctrlKey: true }, 'undo'],
    ['Arabic Ctrl+غ (code KeyY)', false, 'غ', { code: 'KeyY', ctrlKey: true }, 'redo'],
    ['Arabic Ctrl+Shift+ظ', false, 'ظ', { code: 'KeyZ', ctrlKey: true, shiftKey: true }, 'redo'],
    ['Arabic Cmd+ظ on a Mac', true, 'ظ', { code: 'KeyZ', metaKey: true }, 'undo'],
    ['Arabic Ctrl+ض (code KeyQ)', false, 'ض', { code: 'KeyQ', ctrlKey: true }, null],
  ];
  for (const [label, mac, key, init, want] of rows) {
    it(`${label}: ${want ?? 'not taken'}`, () => {
      const t = ready();
      (t.ctx as { mac: boolean }).mac = mac;
      const ev = t.key(key, init);
      expect(result(t)).toBe(want);
      // Taken: the browser's own (the page's undo) never runs; not taken: left alone.
      expect(ev.defaultPrevented).toBe(want !== null);
      if (want) expect(t.of('cellEdited').map((e) => [e.origin, e.source])).toEqual([[want, 'user']]);
    });
  }

  it('the same keys in Arabic, right to left: nothing mirrored', () => {
    const t = ready({ lang: 'ar' });
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    expect(result(t)).toBe('undo');
  });

  it('nothing to undo: taken all the same (prevented), « Nothing to undo » said; « Nothing to redo » the same', async () => {
    const t = ed();
    const said = polite(t);
    t.at('r3');
    expect(t.key('z', { code: 'KeyZ', ctrlKey: true }).defaultPrevented).toBe(true);
    await settle();
    expect(t.key('y', { code: 'KeyY', ctrlKey: true }).defaultPrevented).toBe(true);
    await settle();
    expect(said).toEqual(['Nothing to undo', 'Nothing to redo']);
    expect(t.of('cellEdited')).toEqual([]);
  });

  it('key repeat: each repeat one more gesture undone', () => {
    const t = ed();
    for (const [id, v] of [['r1', '11'], ['r2', '12'], ['r3', '13']]) put(t, [[id!, 'n', v!]]);
    t.at('r9', 'q');
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    t.key('z', { code: 'KeyZ', ctrlKey: true, repeat: true });
    t.key('z', { code: 'KeyZ', ctrlKey: true, repeat: true });
    expect([t.value('r1'), t.value('r2'), t.value('r3')]).toEqual(['1', '2', '3']);
    expect(t.api.canUndo).toBe(false);
  });

  it('a composition (keyCode 229) is never taken', () => {
    const t = ready();
    const ev = t.key('z', { code: 'KeyZ', ctrlKey: true, keyCode: 229 } as KeyboardEventInit);
    expect(result(t)).toBeNull();
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('who owns the key (behaviour 1)', () => {
  it('an open field: the field\'s own; the grid unchanged, the field still open', () => {
    const t = ready();
    t.at('r4', 'n');
    t.key('F2');
    const f = t.field()!;
    const ev = t.key('z', { code: 'KeyZ', ctrlKey: true }, f);
    expect(ev.defaultPrevented).toBe(false);
    expect(result(t)).toBeNull();
    expect(t.field()).toBe(f);
    expect(t.key('y', { code: 'KeyY', ctrlKey: true }, f).defaultPrevented).toBe(false);
    expect(result(t)).toBeNull();
  });

  for (const owner of ['popup', 'filter-input', 'cell-widget'] as const) {
    it(`a ${owner}: not taken`, () => {
      const t = ready();
      const el = document.createElement(owner === 'filter-input' ? 'input' : 'div');
      el.setAttribute('data-dzg-owner', owner);
      el.tabIndex = 0;
      (owner === 'filter-input' ? t.host.querySelector('.dzg-hcell[data-col="q"]')! : t.cell('r5', 'q')!).append(el);
      el.focus();
      expect(t.key('z', { code: 'KeyZ', ctrlKey: true }, el).defaultPrevented).toBe(false);
      expect(result(t)).toBeNull();
    });
  }

  it('a button a part drew in a cell (its widget): not taken', () => {
    const t = ready();
    const b = t.cell('r5', 'q')!.appendChild(document.createElement('button'));
    b.focus();
    expect(t.key('z', { code: 'KeyZ', ctrlKey: true }, b).defaultPrevented).toBe(false);
    expect(result(t)).toBeNull();
  });

  it('a header: taken; the focus goes to the cell given back', () => {
    const t = ready();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'q' } }, 'user');
    t.ctx.restoreFocus();
    expect(document.activeElement).toBe(t.host.querySelector('.dzg-hcell[data-col="q"]'));
    expect(t.key('z', { code: 'KeyZ', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(result(t)).toBe('undo');
    expect(t.focusAt()).toBe('r1/n');
    expect(document.activeElement).toBe(t.cell('r1', 'n'));
  });

  it('the scroller itself (the focus cell scrolled away): taken', () => {
    const t = ready();
    t.vp.focus();
    expect(t.key('z', { code: 'KeyZ', ctrlKey: true }, t.vp).defaultPrevented).toBe(true);
    expect(result(t)).toBe('undo');
  });

  it('a key from outside the grid: nothing', () => {
    const t = ready();
    const out = document.body.appendChild(document.createElement('button'));
    out.focus();
    expect(t.key('z', { code: 'KeyZ', ctrlKey: true }, out).defaultPrevented).toBe(false);
    expect(result(t)).toBeNull();
  });

  // Owner S8-O6 (lead): left to the browser — not taken, not prevented, nothing undone; the field still opens.
  it('an editor waiting for its paint (typed ahead): Ctrl+Z left to the browser — nothing undone, the field opens with what was typed', () => {
    const queue: FrameRequestCallback[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => queue.push(f), cancelAnimationFrame: () => {} };
    const flush = () => { for (let i = 0; queue.length && i < 20; i++) queue.shift()!(0); };
    const t = ed({ raf, block: 160 });
    flush();
    put(t, [['r1', 'n', '50']]);
    flush();
    t.g.api.focusCell(k('r3'), 'n');
    flush();
    t.cell('r3', 'n')!.focus();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r40'), column: 'n' } }, 'user');
    t.ctx.restoreFocus();
    expect(t.cell('r40', 'n')).toBeNull();
    t.key('4');
    const ev = t.key('z', { code: 'KeyZ', ctrlKey: true });
    flush();
    // r1 scrolled away: its value as the cells read it.
    expect(t.ctx.edit!.read(t.ctx.columns.get('n')! as never, t.g.kernel.rows.row(k('r1'))!.data, k('r1'))).toBe(50);
    expect(t.api.canUndo).toBe(true);
    expect(ev.defaultPrevented).toBe(false);
    expect(t.field()?.value).toBe('4');
  });
});

describe('the focus after an undo (behaviour 6, O10, S8-O4)', () => {
  it('to the first cell of the gesture, focused in the DOM; no field opens', () => {
    const t = ed();
    put(t, [['r7', 'q', '5'], ['r3', 'n', '9']]);
    t.at('r9', 'name');
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    expect(t.focusAt()).toBe('r7/q');
    expect(document.activeElement).toBe(t.cell('r7', 'q'));
    expect(t.field()).toBeNull();
    expect([t.value('r7', 'q'), t.value('r3')]).toEqual([String((7 * 37) % 101), '3']);
  });

  it('a cell scrolled far away: brought into view, clear of the pinned column', () => {
    const COLS: ColumnDef<R, any>[] = [
      { id: 'name', header: 'Name', width: 200, editable: true, pinned: 'start' },
      { id: 'n', header: 'Stock', type: 'number', width: 200, editable: true },
      { id: 's', header: 'Shelf', width: 300 },
      { id: 'q', header: 'Price', type: 'number', width: 300, editable: true },
    ];
    const t = ed({ columns: COLS });
    put(t, [['r150', 'q', '5']]);
    t.at('r1', 'n');
    t.box.scrollInline = 0;
    t.vp.dispatchEvent(new Event('scroll'));
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    expect(t.focusAt()).toBe('r150/q');
    expect(document.activeElement).toBe(t.cell('r150', 'q'));
    // Row 150 wholly in the 320 px view; Price (500–800 in the centre) wholly in the 400 px beside the pinned column.
    expect(t.box.scrollTop).toBeLessThanOrEqual(150 * 32);
    expect(t.box.scrollTop + 320).toBeGreaterThanOrEqual(151 * 32);
    expect(t.box.scrollInline).toBeLessThanOrEqual(500);
    expect(t.box.scrollInline + 400).toBeGreaterThanOrEqual(800);
  });

  it('under sticky parents (the step-7 gap): the row comes out below its pinned parents, not under them', () => {
    type T = R & { parent: string | null };
    // Three levels: a root every 40 rows, a branch every 8 under it, leaves; all open.
    const rows: T[] = rowsOf(240).map((r, i) => ({ ...r, parent: i % 40 === 0 ? null : i % 8 === 0 ? `r${i - (i % 40)}` : `r${i - (i % 8)}` }));
    const t = ed({
      rows: rows as never, block: 320,
      settings: { messages: join(BASE.en, EDIT.en, EDITORS.en, EN_TREE) },
      features: (e, x) => [tree<T>({ parentId: (r) => r.parent, sticky: 3 }) as never, e, x],
    });
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
    put(t, [['r117', 'q', '5']]);
    t.at('r1', 'n');
    // Scrolled below r117: its row is above the view, its parents (r80, r112) would be pinned over it.
    t.scroll(150 * 32);
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    expect(t.focusAt()).toBe('r117/q');
    const i = t.g.kernel.rows.displayed.indexOf(k('r117'));
    const room = t.ctx.insetFor!(i);
    expect(room).toBe(64);
    expect(i * 32 - t.box.scrollTop).toBeGreaterThanOrEqual(room);
    expect((i + 1) * 32 - t.box.scrollTop).toBeLessThanOrEqual(320);
  });

  it('a row no longer shown (filtered out after a reapply): undone and said, the focus stays where it was', async () => {
    const t = ed();
    const said = polite(t);
    put(t, [['r1', 'n', '50']]);
    // r1's Price is 37: filtered out by « Price > 50 ».
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 50 } }, 'api');
    expect(t.g.kernel.rows.displayed.indexOf(k('r1'))).toBe(-1);
    const at = t.at('r2', 'q');
    await settle();
    said.length = 0;
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    await settle();
    expect(t.ctx.edit!.read(t.ctx.columns.get('n')! as never, t.g.kernel.rows.row(k('r1'))!.data, k('r1'))).toBe(1);
    expect(t.api.state(k('r1'), 'n')?.status ?? 'saved').toBe('saved');
    expect(t.focusAt()).toBe('r2/q');
    expect(document.activeElement).toBe(at);
    expect(said).toEqual(['Undone: Stock']);
  });

  it('api.undo() from an app\'s button onto a row not shown: the focus stays on the button (not pulled into the grid)', () => {
    const t = ed();
    put(t, [['r1', 'n', '50']]);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 50 } }, 'api');
    t.at('r2', 'q');
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();
    t.api.undo();
    expect(document.activeElement).toBe(button);
    expect(t.api.canRedo).toBe(true);
  });

  it('a column hidden since: undone, the focus stays', () => {
    const t = ed();
    put(t, [['r1', 'n', '50']]);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] }, 'api');
    const at = t.at('r2', 'q');
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    expect(t.focusAt()).toBe('r2/q');
    expect(document.activeElement).toBe(at);
    expect(t.api.canRedo).toBe(true);
  });

  it('an undo never moves rows (K.14): sorted on Stock, the row stays in place, the order marked stale', () => {
    const t = ed();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'api');
    put(t, [['r3', 'n', '500']]);
    t.api.reapply();
    const before = t.g.kernel.rows.displayed.indexOf(k('r3'));
    t.at('r0', 'q');
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    expect(t.g.kernel.rows.displayed.indexOf(k('r3'))).toBe(before);
    expect(t.g.kernel.orderStale).toBe(true);
  });
});

describe('the sentences (edit-undo.md « Announcements »)', () => {
  const press = (t: ReturnType<typeof ed>, key: 'z' | 'y') => t.key(key, { code: key === 'z' ? 'KeyZ' : 'KeyY', ctrlKey: true });

  it('one cell: « Undone: Stock », « Redone: Stock »; many: « Undone: 2 cells »', async () => {
    const t = ed();
    const said = polite(t);
    put(t, [['r1', 'n', '50']]);
    put(t, [['r2', 'n', '60'], ['r2', 'q', '7']]);
    t.at('r9', 'q');
    await settle();
    said.length = 0;
    press(t, 'z');
    await settle();
    press(t, 'z');
    await settle();
    press(t, 'y');
    await settle();
    press(t, 'y');
    await settle();
    expect(said).toEqual(['Undone: 2 cells', 'Undone: Stock', 'Redone: Stock', 'Redone: 2 cells']);
  });

  it('a cell changed since: the others undone, the skipped counted in the same sentence', async () => {
    const t = ed();
    const said = polite(t);
    put(t, [['r7', 'q', '5'], ['r3', 'n', '9']]);
    // The host changes r3 (a new row object): its edit no longer counts, its undo is skipped.
    t.g.kernel.rows.applyTransaction({ update: [{ ...t.g.kernel.rows.row(k('r3'))!.data, n: 999 }] });
    t.at('r9', 'name');
    await settle();
    said.length = 0;
    press(t, 'z');
    await settle();
    expect(said).toEqual(['Undone: Price. Cannot undo 1: the value changed since']);
    expect(t.focusAt()).toBe('r7/q');
    expect(t.value('r3')).toBe('999');
  });

  it('every cell changed since: that sentence alone; the focus stays; the gesture still moved to redo', async () => {
    const t = ed();
    const said = polite(t);
    put(t, [['r3', 'n', '9']]);
    t.g.kernel.rows.applyTransaction({ update: [{ ...t.g.kernel.rows.row(k('r3'))!.data, n: 999 }] });
    t.at('r20', 'name');
    await settle();
    said.length = 0;
    press(t, 'z');
    await settle();
    expect(said).toEqual(['Cannot undo 1: the value changed since']);
    expect(t.focusAt()).toBe('r20/name');
    expect([t.api.canUndo, t.api.canRedo]).toEqual([false, true]);
    // Redo: the value it kept is not what is shown either (999, not 9): skipped too.
    press(t, 'y');
    await settle();
    expect(said.at(-1)).toBe('Cannot redo 1: the value changed since');
  });

  // Owner S8-O6: one announcement, the undo's sentence first, then its save's « Saving ».
  it('the undo\'s own save: « Undone: Stock. Saving » in one announcement, the cell described « Saving »', async () => {
    const answers: (() => void)[] = [];
    const t = ed({ save: () => new Promise<void>((ok) => void answers.push(ok)) });
    const said = polite(t);
    put(t, [['r1', 'n', '50']]);
    answers.shift()!();
    await settle();
    t.at('r9', 'q');
    said.length = 0;
    press(t, 'z');
    await settle();
    expect(said).toEqual(['Undone: Stock. Saving']);
    expect(t.api.state(k('r1'), 'n')?.status).toBe('saving');
    const d = (t.cell('r1', 'n')!.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(d).toContain('Saving');
    // The next gesture, not an undo, says « Saving » again.
    put(t, [['r4', 'n', '40']]);
    await settle();
    expect(said.at(-1)).toBe('Saving');
  });

  it('an undo that makes the order stale: its sentence, then the stale one, in one task', async () => {
    const t = ed();
    const said = polite(t);
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'api');
    put(t, [['r3', 'n', '500']]);
    t.api.reapply();
    t.at('r0', 'q');
    await settle();
    said.length = 0;
    press(t, 'z');
    await settle();
    expect(said).toEqual(['Undone: Stock. Order out of date: reapply from the header']);
  });

  it('French and Arabic', async () => {
    for (const lang of ['fr', 'ar'] as const) {
      const t = ed({ lang });
      const said = polite(t);
      put(t, [['r1', 'n', '50']]);
      t.at('r9', 'q');
      await settle();
      said.length = 0;
      press(t, 'z');
      await settle();
      press(t, 'z');
      await settle();
      expect(said, lang).toEqual(lang === 'fr' ? ['Annulé : Stock', 'Rien à annuler'] : ['تم التراجع: ⁨Stock⁩', 'لا شيء للتراجع عنه']);
      cleanup();
    }
  });
});

describe('api.undo() / api.redo() (owner S8-O2: as the keys)', () => {
  it('the same path: the focus into the grid from the app\'s button, the sentence, source « api »', async () => {
    const t = ed();
    const said = polite(t);
    put(t, [['r7', 'q', '5']]);
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();
    await settle();
    said.length = 0;
    const r = t.api.undo();
    await settle();
    expect(r).toEqual({ cells: [{ key: k('r7'), column: 'q' }], skipped: 0 });
    expect(document.activeElement).toBe(t.cell('r7', 'q'));
    expect(t.of('cellEdited').at(-1)).toMatchObject({ origin: 'undo', source: 'api' });
    expect(said).toEqual(['Undone: Price']);
    t.api.redo();
    await settle();
    expect(t.of('cellEdited').at(-1)).toMatchObject({ origin: 'redo', source: 'api' });
    expect(said.at(-1)).toBe('Redone: Price');
    expect(t.api.redo()).toBeNull();
    await settle();
    expect(said.at(-1)).toBe('Nothing to redo');
  });

  it('api.undo() while a field is open (the user typing): undone, the field keeps the focus and its text', () => {
    const t = ed();
    put(t, [['r7', 'q', '5']]);
    t.at('r2', 'n');
    t.key('F2');
    t.type('44');
    const f = t.field()!;
    t.api.undo();
    expect(document.activeElement).toBe(f);
    expect([t.field(), f.value]).toEqual([f, '44']);
    expect(t.value('r7', 'q')).toBe(String((7 * 37) % 101));
  });

  it('a refused gesture leaves nothing to undo: canUndo false, Ctrl+Z says « Nothing to undo »', async () => {
    let no: (e: unknown) => void = () => {};
    const t = ed({ save: () => new Promise<void>((_ok, n) => void (no = n)) });
    const said = polite(t);
    // A local refusal stages nothing.
    expect(put(t, [['r1', 'n', '-5']]).refused).toHaveLength(1);
    expect(t.api.canUndo).toBe(false);
    // A server refusal takes its entry back.
    put(t, [['r2', 'n', '60']]);
    expect(t.api.canUndo).toBe(true);
    no({ reason: 'no' });
    await settle();
    expect(t.api.canUndo).toBe(false);
    t.at('r9', 'q');
    said.length = 0;
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    await settle();
    expect(said).toEqual(['Nothing to undo']);
  });
});

// The test analyser's gaps (step-8 review).
describe('review gaps', () => {
  it('the focused cell scrolled away, the scroller focused: Ctrl+Z taken', () => {
    const t = ed();
    put(t, [['r150', 'n', '50']]);
    t.at('r1', 'q');
    t.scroll(140 * 32);
    t.vp.focus();
    expect(t.key('z', { code: 'KeyZ', ctrlKey: true }, t.vp).defaultPrevented).toBe(true);
    expect(t.api.canUndo).toBe(false);
  });

  it('AZERTY Ctrl+Shift+Z (key Z, code KeyW): redo, prevented', () => {
    const t = ed();
    put(t, [['r1', 'n', '50']]);
    t.api.undo();
    t.at('r5', 's');
    expect(t.key('Z', { code: 'KeyW', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(t.value('r1')).toBe('50');
  });

  it('1 undone and 2 skipped, then 2 undone and 1 skipped: the exact sentences', async () => {
    const t = ed();
    const said = polite(t);
    put(t, [['r7', 'q', '5'], ['r8', 'q', '6'], ['r3', 'n', '9']]);
    t.g.kernel.rows.applyTransaction({ update: [{ ...t.g.kernel.rows.row(k('r3'))!.data, n: 999 }] });
    put(t, [['r7', 'n', '5'], ['r3', 'q', '9'], ['r4', 'q', '9']]);
    t.g.kernel.rows.applyTransaction({ update: [{ ...t.g.kernel.rows.row(k('r3'))!.data, q: 998 }, { ...t.g.kernel.rows.row(k('r4'))!.data, q: 997 }] });
    t.at('r9', 'name');
    await settle();
    said.length = 0;
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    await settle();
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    await settle();
    expect(said).toEqual(['Undone: Stock. Cannot undo 2: the value changed since', 'Undone: 2 cells. Cannot undo 1: the value changed since']);
  });

  it('a redo with 1 given back and 1 skipped: one sentence', async () => {
    const t = ed();
    const said = polite(t);
    put(t, [['r7', 'q', '5'], ['r3', 'n', '9']]);
    t.api.undo();
    t.g.kernel.rows.applyTransaction({ update: [{ ...t.g.kernel.rows.row(k('r3'))!.data, n: 999 }] });
    t.at('r9', 'name');
    await settle();
    said.length = 0;
    t.key('y', { code: 'KeyY', ctrlKey: true });
    await settle();
    expect(said).toEqual(['Redone: Price. Cannot redo 1: the value changed since']);
  });

  it('api.undo(): the focus change told with source api', () => {
    const t = ed();
    put(t, [['r7', 'q', '5']]);
    t.at('r2', 'n');
    t.events.length = 0;
    t.api.undo();
    expect(t.of('focusChanged').at(-1)).toMatchObject({ source: 'api' });
  });

  it('a new gesture through the DOM (F2, type, Enter) empties the redo list', async () => {
    const t = ed();
    const said = polite(t);
    put(t, [['r1', 'n', '50']]);
    t.at('r5', 's');
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    t.at('r2', 'n');
    t.key('F2');
    t.type('77');
    t.key('Enter', {}, t.field()!);
    await settle();
    said.length = 0;
    t.key('y', { code: 'KeyY', ctrlKey: true });
    await settle();
    expect(said).toEqual(['Nothing to redo']);
    expect(t.value('r1')).toBe('1');
  });
});
