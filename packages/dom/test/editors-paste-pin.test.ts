// Part A gate G6 (Phase 5 step 9, docs/phase-5-steps/step09-plan.md §6; editors.md, editing.md): a paste inside an
// open field is the field's — the grid takes none (nothing prevented, nothing kept, the field still open). Re-pinned at
// step 11b against the real listener of `@dzgrid/dom/range` (clipboard.md 2; step11b-plan L1): the same paste with
// the focus on the cell IS taken, which proves the listener is live.
import { describe, it, expect, afterEach } from 'vitest';
import { range } from '../src/range.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { ed, cleanup, join, BASE, EDIT, EDITORS } from './support-editors.js';

afterEach(cleanup);

const pasteEvent = (text: string) => {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: { getData: (f: string) => (f === 'text/plain' ? text : ''), setData() {}, types: ['text/plain'] } });
  return ev;
};

describe('a paste inside an open field (range() + edit() + editors())', () => {
  const make = () => ed({ features: (e, x) => [e, x, range()], settings: { messages: join(BASE.en, EDIT.en, EDITORS.en, EN_RANGE) } });

  it('is left to the field: not prevented, nothing kept, the field open', () => {
    const t = make();
    t.at('r2');
    t.key('F2');
    const f = t.field()!;
    for (const at of [f, document.body]) {
      const ev = pasteEvent('12');
      at.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(t.field()).toBe(f);
    expect(t.of('cellEdited')).toEqual([]);
  });

  it('the same paste with the focus on the cell is the grid\'s: prevented, one cell written', () => {
    const t = make();
    t.at('r2');
    const ev = pasteEvent('12');
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(t.of('cellEdited').map((e) => [e.column, e.value, e.origin])).toEqual([['n', 12, 'paste']]);
    expect(t.field()).toBeNull();
  });
});
