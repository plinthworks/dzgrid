// Bulk edit (Phase 5 step 12, owner QB5, S12-Q5; docs/behaviors/fill.md 9–10, 17; editing.md 19; step12-plan.md D7,
// tests 5): Ctrl/Cmd+Enter in a field whose cell is in the block writes its value in every cell of the block — one
// request (origin bulk), read-only and refused counted, one undo; the field closes on its cell and the focus never moves
// (`enterMoves: 'down'` too); the field's own cell refused: the others written, the field open with its reason;
// outside a block (or without fill()): kept as Enter, without the move; Ctrl+Shift+Enter is the field's; a row
// selection is never a block; `api.apply`. Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, flush, fmake, frows, CCOLS, FMSG } from './support-fill.js';
import { R_ } from './support-range.js';
import { listEditor } from '../src/editors-list.js';
import { definePart } from '../src/part.js';

afterEach(cleanup);

/** F2 on a cell (focused first, so the block set after it stays), then the text typed. */
const open = (t: ReturnType<typeof fmake>, id: string, col: string, text?: string) => {
  if (t.focusAt() !== `${id}/${col}`) t.at(id, col);
  t.press('F2');
  if (text !== undefined) t.type(text);
  return t.field()!;
};

describe('Ctrl+Enter in a field (bulk)', () => {
  it('inside a block: every editable cell of the block, one request (origin bulk), read-only counted; the field closed on its cell; one sentence; one undo', async () => {
    const t = fmake({ editors: 'after' });
    t.at('r2', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r3', 'ref']));
    const f = open(t, 'r2', 'qty', '7');
    expect(t.block()).toBe('r1/qty:r3/ref');
    const e = t.press('Enter', { ctrlKey: true }, f);
    expect(e.defaultPrevented).toBe(true);
    expect(t.field()).toBeNull();
    expect(t.focusAt()).toBe('r2/qty');
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.origin).toBe('bulk');
    // 7 in every column of the block: qty, price, day ("7" is no day), at, st, ok, code, ref (read-only).
    expect(t.changes().filter((x) => /qty|price|code/.test(x))).toEqual(['r1/qty=7', 'r1/price=7', 'r1/code="7"', 'r2/qty=7', 'r2/price=7', 'r2/code="7"', 'r3/qty=7', 'r3/price=7', 'r3/code="7"']);
    expect(t.changes().some((x) => x.includes('/ref'))).toBe(false);
    await flush();
    expect(t.said().at(-1)).toMatch(/^Cells changed: \d+; refused: \d+; read-only: 3\. Saving$/);
    t.edits!.undo();
    expect(t.value('r1', 'qty')).toBe('1');
    expect(t.value('r3', 'price')).toBe('3.5');
  });

  it('the focus never moves, with enterMoves: \'down\' too (Excel\'s Ctrl+Enter stays)', () => {
    const t = fmake({ editors: 'after', editorsOptions: { enterMoves: 'down' } });
    t.at('r2', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r3', 'qty']));
    const f = open(t, 'r2', 'qty', '6');
    t.press('Enter', { ctrlKey: true }, f);
    expect(t.focusAt()).toBe('r2/qty');
    expect(t.changes()).toEqual(['r1/qty=6', 'r2/qty=6', 'r3/qty=6']);
  });

  it('the field unchanged: the value shown written in the block; an emptied field clears (required refused, counted)', async () => {
    const t = fmake({ editors: 'after' });
    t.at('r2', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r3', 'qty']));
    const f = open(t, 'r2', 'qty');
    t.press('Enter', { ctrlKey: true }, f);
    expect(t.changes()).toEqual(['r1/qty=4', 'r3/qty=4']);
    const cols = CCOLS.map((c) => (c.id === 'name' ? { ...c, edit: { required: true } } : c));
    const b = fmake({ editors: 'after', columns: cols });
    b.at('r1', 'qty');
    b.api().set(R_(['r1', 'name'], ['r2', 'qty']));
    const g = open(b, 'r1', 'qty', '');
    b.press('Enter', { ctrlKey: true }, g);
    expect(b.changes()).toEqual(['r1/qty=null', 'r2/qty=null']);
    await flush();
    expect(b.said().at(-1)).toBe('Cells changed: 2; refused: 2. Saving');
  });

  it('a list opened and left as it was: its cell\'s value written in the block (its field keeps nothing of its own)', () => {
    const t = fmake({ editors: 'after', editorsOptions: { list: listEditor } });
    t.at('r2', 'st');
    t.api().set(R_(['r1', 'st'], ['r3', 'st']));
    t.press('F2');
    expect(t.host.querySelector('[data-dzg-owner="editor"]')).not.toBeNull();
    t.press('Enter', { ctrlKey: true }, document.activeElement!);
    // r2 is « in » (even rows): r1 and r3 (« out ») take it.
    expect(t.changes()).toEqual(['r1/st="in"', 'r3/st="in"']);
  });

  it('an app\'s editor that keeps nothing (read() undefined): the value shown of its cell is written in the block (mutant « bulk unchanged field »)', () => {
    const part = definePart('editor', { mount(h) { const i = document.createElement('input'); h.append(i); return { focus: () => (i.focus(), true), read: () => undefined }; } });
    const cols = CCOLS.map((c) => (c.id === 'name' ? { ...c, edit: { editor: 'keep' } } : c));
    const t = fmake({ editors: 'after', columns: cols as never, settings: { parts: { keep: part } } as never });
    t.at('r2', 'name');
    t.api().set(R_(['r1', 'name'], ['r3', 'name']));
    t.press('F2');
    t.press('Enter', { ctrlKey: true }, document.activeElement!);
    expect(t.changes()).toEqual(['r1/name="N2"', 'r3/name="N2"']);
  });

  it('the field\'s own cell refused (S12-Q5): the others written in one request, the field open with its reason', () => {
    const cols = CCOLS.map((c) => (c.id === 'qty' ? { ...c, validate: (v: number | null, r: { id: string }) => (r.id === 'r2' && v === 8 ? 'not here' : null) } : c));
    const t = fmake({ editors: 'after', columns: cols as never });
    t.at('r2', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r3', 'qty']));
    const f = open(t, 'r2', 'qty', '8');
    t.press('Enter', { ctrlKey: true }, f);
    expect(t.requests).toHaveLength(1);
    expect(t.changes()).toEqual(['r1/qty=8', 'r3/qty=8']);
    expect(t.field()).toBe(f);
    expect(f.getAttribute('aria-invalid')).toBe('true');
  });

  it('outside a block, or with no block: kept in its one cell as Enter, without the move (enterMoves down too)', () => {
    const t = fmake({ editors: 'after', editorsOptions: { enterMoves: 'down' } });
    t.at('r2', 'qty');
    t.api().set(R_(['r5', 'qty'], ['r6', 'qty']));
    const f = open(t, 'r2', 'qty', '6');
    expect(t.block()).toBe('r5/qty:r6/qty');
    t.press('Enter', { ctrlKey: true }, f);
    expect(t.changes()).toEqual(['r2/qty=6']);
    expect(t.requests[0]!.origin).toBe('edit');
    expect(t.focusAt()).toBe('r2/qty');
    const b = fmake({ editors: 'after', noFill: true, editorsOptions: { enterMoves: 'down' } });
    const g = open(b, 'r2', 'qty', '6');
    b.press('Enter', { ctrlKey: true }, g);
    expect(b.changes()).toEqual(['r2/qty=6']);
    expect(b.field()).toBeNull();
    expect(b.focusAt()).toBe('r2/qty');
  });

  it('Ctrl+Shift+Enter in a field is the field\'s (no bulk, no fill mode); Ctrl+Enter on a cell without a field writes nothing', () => {
    const t = fmake({ editors: 'after' });
    t.at('r2', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r3', 'qty']));
    const f = open(t, 'r2', 'qty', '6');
    const e = t.press('Enter', { ctrlKey: true, shiftKey: true }, f);
    expect(e.defaultPrevented).toBe(false);
    expect(t.field()).toBe(f);
    expect(t.requests).toHaveLength(0);
    t.press('Escape', {}, f);
    t.press('Enter', { ctrlKey: true });
    expect(t.requests).toHaveLength(0);
  });

  it('a block of 3 000 rows: one request of 3 000 changes', () => {
    const t = fmake({ editors: 'after', rows: frows(3000), block: 400 });
    t.at('r0', 'qty');
    t.api().set(R_(['r0', 'qty'], ['r2999', 'qty']));
    const f = open(t, 'r0', 'qty', '77');
    t.press('Enter', { ctrlKey: true }, f);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.changes).toHaveLength(3000);
  });

  it('a row selection (« every row but… ») is never a block: one cell written', () => {
    const t = fmake({ editors: 'after', settings: { selection: { mode: 'multi' } } as never });
    t.g.kernel.dispatch({ type: 'selection.all' }, 'api');
    const f = open(t, 'r2', 'qty', '6');
    t.press('Enter', { ctrlKey: true }, f);
    expect(t.changes()).toEqual(['r2/qty=6']);
  });

  it('api.apply(input): bulk on the block from the application; null without a block', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    expect(t.fapi().apply({ text: '5' })).toBeNull();
    t.api().set(R_(['r1', 'qty'], ['r2', 'ref']));
    expect(t.fapi().apply({ value: 5 })).toMatchObject({ readOnly: 2 });
    expect(t.requests[0]!.origin).toBe('bulk');
    expect(t.changes().filter((x) => /qty|price/.test(x))).toEqual(['r1/qty=5', 'r1/price=5', 'r2/qty=5', 'r2/price=5']);
  });
});

describe('bulk: the analysis\'s gaps', () => {
  it('the field\'s own cell refused by its `validate`: the field\'s error says that rule\'s reason', () => {
    const cols = CCOLS.map((c) => (c.id === 'qty' ? { ...c, validate: (v: number | null, r: { id: string }) => (r.id === 'r2' && v === 8 ? 'integer' : null) } : c));
    const t = fmake({ editors: 'after', columns: cols as never, settings: { messages: { ...FMSG.en, text: { ...FMSG.en.text, 'validation.integer': 'A whole number here' } } } as never });
    t.at('r2', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r3', 'qty']));
    const f = open(t, 'r2', 'qty', '8');
    t.press('Enter', { ctrlKey: true }, f);
    expect(t.field()).toBe(f);
    expect(t.host.querySelector('.dzg-bubble')?.textContent).toContain('A whole number here');
  });
});
