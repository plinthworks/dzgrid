// `@dzgrid/dom/range`, Escape's quiet state (owner S12-Q16, 2026-10-26: « je ne veux plus rien faire »): Escape on a
// cell clears the block and puts `data-dzg-quiet` on the grid's root (the theme then hides the active cell's ring,
// tint and the fill handle); the DOM focus and the kernel's stay on the cell (screen readers keep it); the next key
// (an arrow, Tab, a character, F2, Enter…), a press in the grid or the focus coming back ends it; a second Escape does
// nothing more. Only with `range()`; never on a header.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, rmake, R_ } from './support-range.js';
import { fmake } from './support-fill.js';
import { ed, k } from './support-editors.js';
import { range } from '../src/range.js';
import { EN } from '../src/locales/en.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { join } from './support-range.js';

afterEach(cleanup);

const QUIET = 'data-dzg-quiet';

/** A grid with the focus on r3/n (and, `block`, a block r3/n … r5/s made by the keys). */
function at(block = false, o: Parameters<typeof rmake>[0] = {}) {
  const t = rmake(o);
  t.focus('r3', 'n');
  if (block) t.press('ArrowDown', { shiftKey: true }), t.press('ArrowDown', { shiftKey: true }), t.press('ArrowRight', { shiftKey: true });
  t.announce.mockClear();
  t.events.length = 0;
  return t;
}
const quiet = (t: { readonly ctx: { readonly el: { readonly root: HTMLElement } } }) => t.ctx.el.root.hasAttribute(QUIET);

describe('S12-Q16: Escape, the quiet state', () => {
  it('Escape on a block clears it and goes quiet; the focus stays on its cell (DOM and kernel); ArrowDown ends it and moves', () => {
    const t = at(true);
    const before = t.where();
    t.press('Escape');
    expect(t.block()).toBeNull();
    expect(quiet(t)).toBe(true);
    expect(t.where()).toBe(before);
    expect(document.activeElement?.classList.contains('dzg-cell')).toBe(true);
    expect(t.said()).toEqual(['Selection cleared']);
    t.press('ArrowDown');
    expect(quiet(t)).toBe(false);
    expect(t.where()).toBe('r6/s');
  });

  it('Escape with no block goes quiet too; a second Escape changes nothing (no event, no sentence, the focus kept)', () => {
    const t = at();
    t.press('Escape');
    expect(quiet(t)).toBe(true);
    t.press('Escape');
    expect(quiet(t)).toBe(true);
    expect(t.where()).toBe('r3/n');
    expect(t.changes()).toEqual([]);
    expect(t.said()).toEqual([]);
  });

  for (const key of ['Tab', 'a', 'F2', 'Enter', 'Shift']) {
    it(`the next key ends it: ${key}`, () => {
      const t = at();
      t.press('Escape');
      expect(quiet(t)).toBe(true);
      t.press(key);
      expect(quiet(t)).toBe(false);
    });
  }

  it('a press in the grid ends it; so does the focus coming back from outside', () => {
    const t = at();
    t.press('Escape');
    t.down(t.cell('r5', 'n')!, t.at('r5', 'n'));
    expect(quiet(t)).toBe(false);
    t.focus('r3', 'n');
    t.press('Escape');
    expect(quiet(t)).toBe(true);
    const out = document.body.appendChild(document.createElement('button'));
    out.focus();
    t.cell('r3', 'n')!.focus();
    expect(quiet(t)).toBe(false);
  });

  it('never on a header; never without range()', () => {
    const t = at();
    const h = t.host.querySelector<HTMLElement>('.dzg-hcell')!;
    h.focus();
    t.press('Escape', {}, h);
    expect(quiet(t)).toBe(false);
    const plain = rmake({ features: () => [] });
    plain.focus('r3', 'n');
    plain.press('Escape');
    expect(quiet(plain)).toBe(false);
  });
});

describe('S12-Q16 review: one Escape, one job', () => {
  it('Escape that cancels a fill drag does not go quiet', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.dragTo('r4', 'qty', { noUp: true });
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(true);
    t.press('Escape');
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(false);
    expect(quiet(t)).toBe(false);
  });

  it('Escape that leaves the keyboard fill mode does not go quiet', () => {
    const t = fmake();
    t.at('r1', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r2', 'qty']));
    expect(t.press('Enter', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    t.press('Escape');
    expect(t.said().at(-1)).toBe('Fill cancelled');
    expect(quiet(t)).toBe(false);
    expect(t.block()).toBe('r1/qty:r2/qty');
  });

  it('Escape that gives up an editor waiting for its paint does not go quiet', () => {
    const queue: FrameRequestCallback[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => queue.push(f), cancelAnimationFrame: () => {} };
    const flush = () => { for (let i = 0; queue.length && i < 20; i++) queue.shift()!(0); };
    const t = ed({ raf, block: 160, features: (e, x) => [e, x, range()], settings: { messages: join(EN, EN_EDIT, EN_EDITORS, EN_RANGE) } });
    flush();
    t.g.api.focusCell(k('r3'), 'n');
    flush();
    t.cell('r3', 'n')!.focus();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r40'), column: 'n' } }, 'user');
    t.ctx.restoreFocus();
    expect(t.cell('r40', 'n')).toBeNull();
    t.key('4');
    expect(t.key('Escape').defaultPrevented).toBe(true);
    expect(t.ctx.el.root.hasAttribute('data-dzg-quiet')).toBe(false);
    flush();
    expect(t.field()).toBeNull();
  });

  it('Escape in an editor field, and in a widget of a cell, does not go quiet', () => {
    const t = fmake({ editors: 'after' });
    t.at('r1', 'name');
    t.press('F2');
    const f = t.field()!;
    expect(f).not.toBeNull();
    t.press('Escape', {}, f);
    expect(t.field()).toBeNull();
    expect(quiet(t)).toBe(false);
    const b = t.cell('r2', 'name')!.appendChild(document.createElement('button'));
    b.focus();
    t.press('Escape', {}, b);
    expect(quiet(t)).toBe(false);
  });

  for (const mod of ['ctrlKey', 'shiftKey', 'altKey', 'metaKey'] as const) {
    it(`${mod}+Escape does not go quiet`, () => {
      const t = at();
      t.press('Escape', { [mod]: true });
      expect(quiet(t)).toBe(false);
    });
  }

  it('a press on the cell that already has the focus ends it (no focusin there)', () => {
    const t = at();
    t.press('Escape');
    expect(quiet(t)).toBe(true);
    const c = t.cell('r3', 'n')!;
    expect(document.activeElement).toBe(c);
    t.down(c, t.at('r3', 'n'));
    expect(quiet(t)).toBe(false);
  });

  it('a block set by the API during the quiet state ends it (its tint and handle show)', () => {
    const t = at();
    t.press('Escape');
    expect(quiet(t)).toBe(true);
    t.api().set(R_(['r1', 'n'], ['r2', 's']));
    expect(quiet(t)).toBe(false);
  });
});
