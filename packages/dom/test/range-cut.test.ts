// Cut and Delete on a block (Phase 5 step 11b, docs/behaviors/clipboard.md 23–24; owner S11b-Q1: the cells cleared at
// once, one save, undoable; step11b-plan.md L4, L10): values read before the clear, read-only cells copied and not
// cleared, `canCopy` refusing clears nothing; Delete / Backspace on a block whatever the order of `editors()` and
// `range()`; Delete with no block still the editors' one cell.
import { describe, it, expect, afterEach } from 'vitest';
import { CCOLS, cleanup, clip, cmake, flush } from './support-clip.js';
import { R_ } from './support-range.js';

afterEach(cleanup);

describe('cut (clipboard.md 23, S11b-Q1)', () => {
  it('the old values written, then the cells cleared in one request (origin cut), one undo gives them back', async () => {
    const t = cmake();
    t.at('r0', 'name');
    t.api().set(R_(['r0', 'name'], ['r1', 'qty']));
    const { e, text, html } = clip('cut');
    expect(e.defaultPrevented).toBe(true);
    expect(text).toBe('N0\t0\r\nN1\t1\r\n');
    expect(html).toBe('<table dir="ltr"><tbody><tr><td>N0</td><td>0</td></tr><tr><td>N1</td><td>1</td></tr></tbody></table>');
    expect(t.requests.map((r) => r.origin)).toEqual(['cut']);
    expect(t.changes()).toEqual(['r0/name=null', 'r0/qty=null', 'r1/name=null', 'r1/qty=null']);
    expect(t.value('r0', 'name')).toBe('');
    expect(t.of('rangeCopied')).toEqual([{ type: 'rangeCopied', source: 'user', rows: 2, columns: 2, cells: 4, cut: true }]);
    await flush();
    expect(t.said().at(-1)).toBe('Cells cut: 4. Saving');
    t.edits!.undo();
    expect([t.value('r0', 'name'), t.value('r0', 'qty'), t.value('r1', 'name'), t.value('r1', 'qty')]).toEqual(['N0', '0', 'N1', '1']);
  });

  it('read-only cells are copied, not cleared, counted; a refused clear (required) blinks and is counted', async () => {
    const t = cmake({ columns: CCOLS.map((c) => (c.id === 'name' ? { ...c, edit: { required: true } } : c)) });
    t.at('r0', 'code');
    t.api().set(R_(['r0', 'code'], ['r0', 'ref']));
    expect(clip('cut').text).toBe('"=""000"""\tR0\r\n');
    expect(t.changes()).toEqual(['r0/code=null']);
    await flush();
    expect(t.said().at(-1)).toBe('Cells cut: 1; read-only: 1. Saving');
    t.at('r2', 'name');
    expect(clip('cut').text).toBe('N2\r\n');
    expect(t.blinked()).toEqual(['r2/name']);
    await flush();
    expect(t.said().at(-1)).toBe('Cells cut: 0; refused: 1');
  });

  it('canCopy refusing a cut clears nothing', async () => {
    const t = cmake({ range: { canCopy: (c) => !c.cut } });
    t.at('r0', 'name');
    const { e, data } = clip('cut');
    expect(e.defaultPrevented).toBe(true);
    expect(data.types).toEqual([]);
    expect(t.requests).toEqual([]);
    expect(t.value('r0', 'name')).toBe('N0');
    await flush();
    expect(t.said()).toContain('Copying not allowed');
    expect(clip('copy').text).toBe('N0\r\n');
  });

  it('api.cut(): the text returned, the cells cleared, source api', () => {
    const t = cmake();
    t.at('r3', 'qty');
    expect(t.api().cut()).toEqual({ text: '3\r\n', html: '<table dir="ltr"><tbody><tr><td>3</td></tr></tbody></table>' });
    expect(t.changes()).toEqual(['r3/qty=null']);
    expect(t.of('rangeCopied')[0]!.source).toBe('api');
  });
});

describe('Delete and Backspace on a block (clipboard.md 24, L10)', () => {
  for (const order of ['before', 'after'] as const) {
    for (const k of ['Delete', 'Backspace']) {
      it(`${k}, editors() ${order} range(): the block's cells cleared in one request (origin edit), said`, async () => {
        const t = cmake({ editors: order });
        t.at('r1', 'name');
        t.api().set(R_(['r1', 'name'], ['r2', 'qty']));
        const ev = t.press(k);
        expect(ev.defaultPrevented).toBe(true);
        expect(t.requests.map((r) => r.origin)).toEqual(['edit']);
        expect(t.changes()).toEqual(['r1/name=null', 'r1/qty=null', 'r2/name=null', 'r2/qty=null']);
        expect(t.host.querySelector('.dzg-field')).toBeNull();
        await flush();
        expect(t.said().at(-1)).toBe('Cells cleared: 4. Saving');
        t.edits!.undo();
        expect(t.value('r2', 'qty')).toBe('2');
      });
    }
    it(`no block, editors() ${order}: Delete is the editors' one cell (range takes nothing)`, async () => {
      const t = cmake({ editors: order });
      t.at('r1', 'qty');
      t.press('Delete');
      expect(t.changes()).toEqual(['r1/qty=null']);
      await flush();
      expect(t.said().filter((s) => s.startsWith('Cells'))).toEqual([]);
    });
  }

  it('read-only cells counted; Ctrl, Shift (a cut on Windows) or Alt with Delete: not ours', async () => {
    const t = cmake();
    t.at('r0', 'code');
    t.api().set(R_(['r0', 'code'], ['r1', 'ref']));
    for (const m of [{ ctrlKey: true }, { shiftKey: true }, { altKey: true }, { metaKey: true }]) expect(t.press('Delete', m).defaultPrevented, JSON.stringify(m)).toBe(false);
    expect(t.requests).toEqual([]);
    t.press('Delete');
    expect(t.changes()).toEqual(['r0/code=null', 'r1/code=null']);
    await flush();
    expect(t.said().at(-1)).toBe('Cells cleared: 2; read-only: 2. Saving');
  });

  it('api.erase(): null without a block; with one, its counts', () => {
    const t = cmake();
    t.at('r0', 'qty');
    expect(t.api().erase()).toBeNull();
    t.api().set(R_(['r0', 'qty'], ['r1', 'price']));
    expect(t.api().erase()).toEqual({ pasted: 4, refused: 0, readOnly: 0, tooLong: 0, outside: 0, tooBig: false });
    expect(t.requests.map((r) => r.origin)).toEqual(['edit']);
  });

  it('without edit(): Delete on a block counts every cell read-only, no throw', async () => {
    const t = cmake({ noEdit: true });
    t.at('r0', 'qty');
    t.api().set(R_(['r0', 'qty'], ['r1', 'price']));
    expect(t.press('Delete').defaultPrevented).toBe(true);
    await flush();
    expect(t.said().at(-1)).toBe('Cells cleared: 0; read-only: 4');
  });
});
