// Part A gate G6 (Phase 5 step 9, docs/phase-5-steps/step09-plan.md §6; editors.md, editing.md): a paste inside an
// open field is the field's — the grid takes none (nothing prevented, nothing kept, the field still open). Part A has
// no paste of its own: a placeholder, re-pinned by Part B's paste (step 10) on its own plan.
import { describe, it, expect, afterEach } from 'vitest';
import { ed, cleanup } from './support-editors.js';

afterEach(cleanup);

describe('a paste inside an open field (placeholder until step 10)', () => {
  it('is left to the field: not prevented, nothing kept, the field open', () => {
    const t = ed();
    t.at('r2');
    t.key('F2');
    const f = t.field()!;
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    f.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(t.field()).toBe(f);
    expect(t.of('cellEdited')).toEqual([]);
  });
});
