// Paste on a cell or a block (Phase 5 step 11b, docs/behaviors/clipboard.md 11–22 and the « Excel interop » paste
// table; step11b-plan.md L6, L7, L9, L11; owner Q9, QB4, QB6, QB10, S3-O2, S5-O5, S11b-Q4): one save request, one
// undo, one sentence (joined with « Saving »); the shapes; outside, read-only, refused (blinked), too long, too big;
// the copy memo; the block shown after; the focus unmoved. Expectations written by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { pagination } from '../src/pagination.js';
import { tree } from '../src/tree.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { CCOLS, CMSG, cleanup, clip, cmake, crows, flush, join, key, type C } from './support-clip.js';
import { R_ } from './support-range.js';

afterEach(cleanup);

const paste = (text: string, html?: string) => clip('paste', { 'text/plain': text, ...(html !== undefined && { 'text/html': html }) });
const problems = (t: ReturnType<typeof cmake>) => t.of('problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems);

describe('paste: the shape (clipboard.md 15–16, QB6)', () => {
  it('one value on the focused cell: one request, said; no block after (one cell)', async () => {
    const t = cmake();
    t.at('r1', 'qty');
    const { e } = paste('12\r\n');
    expect(e.defaultPrevented).toBe(true);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.origin).toBe('paste');
    expect(t.changes()).toEqual(['r1/qty=12']);
    expect(t.value('r1', 'qty')).toBe('12');
    expect(t.api().get()).toBeNull();
    await flush();
    expect(t.said().at(-1)).toBe('Cells pasted: 1. Saving');
  });

  it('a block pasted on one cell writes its own size from there; the block after is the block written; the focus stays', () => {
    const t = cmake();
    t.at('r0', 'name');
    paste('x\t5\r\ny\t6\r\n');
    expect(t.changes()).toEqual(['r0/name="x"', 'r0/qty=5', 'r1/name="y"', 'r1/qty=6']);
    expect(t.block()).toBe('r0/name:r1/qty');
    expect(t.where()).toBe('r0/name');
    expect(t.g.kernel.focus).toMatchObject({ row: key('r0'), column: 'name' });
  });

  it('one value on a block fills the block', () => {
    const t = cmake();
    t.at('r0', 'qty');
    t.api().set(R_(['r2', 'price'], ['r0', 'qty']));
    paste('7');
    expect(t.changes()).toEqual(['r0/qty=7', 'r0/price=7', 'r1/qty=7', 'r1/price=7', 'r2/qty=7', 'r2/price=7']);
    expect(t.block()).toBe('r0/qty:r2/price');
  });

  it('a whole multiple repeats; otherwise written once from the top-left corner', () => {
    const t = cmake();
    t.at('r0', 'qty');
    t.api().set(R_(['r0', 'qty'], ['r3', 'price']));
    paste('1\r\n2\r\n');
    expect(t.changes()).toEqual(['r0/qty=1', 'r0/price=1', 'r1/qty=2', 'r1/price=2', 'r2/qty=1', 'r2/price=1', 'r3/qty=2', 'r3/price=2']);
    t.requests.length = 0;
    t.api().set(R_(['r5', 'qty'], ['r7', 'qty']));
    paste('8\r\n9\r\n');
    expect(t.changes()).toEqual(['r5/qty=8', 'r6/qty=9']);
    expect(t.block()).toBe('r5/qty:r6/qty');
  });

  it('a short row\'s missing cells are written empty (a rectangle); "\\r\\n" (one empty Excel cell) clears', () => {
    const t = cmake();
    t.at('r1', 'name');
    paste('x\t5\r\ny\r\n');
    expect(t.changes()).toEqual(['r1/name="x"', 'r1/qty=5', 'r2/name="y"', 'r2/qty=null']);
    t.requests.length = 0;
    t.at('r4', 'name');
    paste('\r\n');
    expect(t.changes()).toEqual(['r4/name=null']);
  });

  it('an empty clipboard: prevented, nothing written, nothing said', async () => {
    const t = cmake();
    t.at('r1', 'qty');
    expect(paste('').e.defaultPrevented).toBe(true);
    expect(clip('paste', {}).e.defaultPrevented).toBe(true);
    await flush();
    expect(t.requests).toEqual([]);
    expect(t.said()).toEqual([]);
  });
});

describe('paste: what is not written (clipboard.md 17–18, 20; Q9)', () => {
  it('past the last row and the last visible column: « outside the grid »', async () => {
    const t = cmake();
    t.at('r28', 'qty');
    paste('1\r\n2\r\n3\r\n4\r\n');
    expect(t.changes()).toEqual(['r28/qty=1', 'r29/qty=2']);
    await flush();
    expect(t.said().at(-1)).toBe('Cells pasted: 2; outside the grid: 2. Saving');
    t.requests.length = 0;
    t.at('r0', 'code');
    paste('a\tb\tc');
    expect(t.changes()).toEqual(['r0/code="a"']);
    await flush();
    expect(t.said().at(-1)).toBe('Cells pasted: 1; read-only: 1; outside the grid: 1. Saving');
  });

  it('a hidden column is never written: the next visible one is', () => {
    const t = cmake({ columns: CCOLS.map((c) => (c.id === 'qty' ? { ...c, hidden: true } : c)) });
    t.at('r0', 'name');
    paste('x\t5');
    expect(t.changes()).toEqual(['r0/name="x"', 'r0/price=5']);
  });

  it('read-only cells counted, never blinked; refused cells counted « refused » and blinked', async () => {
    const t = cmake();
    t.at('r0', 'qty');
    paste('-1\t1,5\tx\t\t\t\t\tR\r\n');
    // qty min 0 refused, price « 1,5 » in English refused, day « x » refused, the rest cleared … ref read-only.
    expect(t.blinked().sort()).toEqual(['r0/day', 'r0/price', 'r0/qty']);
    expect(t.changes()).toEqual(['r0/at=null', 'r0/st=null', 'r0/ok=null', 'r0/code=null']);
    await flush();
    expect(t.said().at(-1)).toBe('Cells pasted: 4; refused: 3; read-only: 1. Saving');
  });

  it('without edit(): every cell counts « read-only », nothing committed, no throw', async () => {
    const t = cmake({ noEdit: true });
    t.at('r0', 'name');
    expect(paste('a\tb').e.defaultPrevented).toBe(true);
    expect(t.of('cellEdited')).toEqual([]);
    await flush();
    expect(t.said().at(-1)).toBe('Cells pasted: 0; read-only: 2');
    // The block written before (two cells) is the target now.
    expect(t.api().paste('z')).toEqual({ pasted: 0, refused: 0, readOnly: 2, tooLong: 0, outside: 0, tooBig: false });
  });

  it('too long (S5-O5): over 1 000 characters by default, over the column\'s maxLength; 0 is no cap', async () => {
    const cols = CCOLS.map((c) => (c.id === 'code' ? { ...c, edit: { maxLength: 5 } } : c.id === 'ref' ? { ...c, editable: true, edit: { maxLength: 0 } } : c));
    const t = cmake({ columns: cols });
    t.at('r0', 'name');
    paste('a'.repeat(1001));
    paste('a'.repeat(1000));
    expect(t.changes()).toEqual([`r0/name="${'a'.repeat(1000)}"`]);
    t.requests.length = 0;
    t.at('r1', 'code');
    paste(`abcdef\t${'z'.repeat(5000)}`);
    expect(t.changes()).toEqual([`r1/ref="${'z'.repeat(5000)}"`]);
    await flush();
    // Three pastes in one task: each said, in order, « Saving » once after them (the latest microtask speaks).
    expect(t.said().at(-1)).toBe(`Cells pasted: 0; too long: 1. Cells pasted: 1. Cells pasted: 1; too long: 1. Saving`);
  });

  it('too big (QB4): over maxPaste nothing at all, said once; at it, written', async () => {
    const t = cmake({ range: { maxPaste: 4 } });
    t.at('r0', 'qty');
    t.api().set(R_(['r0', 'qty'], ['r1', 'price']));
    expect(t.api().paste('1')).toEqual({ pasted: 4, refused: 0, readOnly: 0, tooLong: 0, outside: 0, tooBig: false });
    t.requests.length = 0;
    t.api().set(R_(['r0', 'qty'], ['r2', 'price']));
    const { e } = paste('2');
    expect(e.defaultPrevented).toBe(true);
    expect(t.requests).toEqual([]);
    expect(t.block()).toBe('r0/qty:r2/price');
    await flush();
    expect(t.said().filter((s) => s.startsWith('Paste too large'))).toEqual(['Paste too large: at most 4 cells; nothing pasted']);
  });

  it('too big at the default: 100 000 cells written in one request, 100 001 nothing', { timeout: 120_000 }, () => {
    const rows = Array.from({ length: 100_001 }, (_, i) => ({ ...crows(1)[0]!, id: `r${i}` }));
    const t = cmake({ rows, columns: [CCOLS[0]!] });
    t.at('r0', 'name');
    t.press('a', { ctrlKey: true });
    expect(t.api().paste('v')!.tooBig).toBe(true);
    expect(t.requests).toEqual([]);
    t.api().set(R_(['r1', 'name'], ['r100000', 'name']));
    const c = t.api().paste('v')!;
    expect(c).toEqual({ pasted: 100_000, refused: 0, readOnly: 0, tooLong: 0, outside: 0, tooBig: false });
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.changes).toHaveLength(100_000);
  });

  it('maxPaste not a positive number: told (invalid-setting, range.maxPaste), the default kept', () => {
    for (const bad of [0, -1, Number.NaN, '5' as never]) {
      const t = cmake({ range: { maxPaste: bad } });
      expect(problems(t).filter((p) => p.path === 'range.maxPaste').map((p) => p.code), String(bad)).toEqual(['invalid-setting']);
      t.at('r0', 'qty');
      t.api().set(R_(['r0', 'qty'], ['r2', 'price']));
      expect(t.api().paste('1')!.pasted).toBe(6);
      cleanup();
    }
  });
});

describe('paste: the text made ready for the column (clipboard.md 19, the paste table)', () => {
  it('French: groups, a currency, a code, VRAI / faux, a French day, an ISO midnight', () => {
    const t = cmake({ lang: 'fr' });
    t.at('r0', 'qty');
    paste('1 234,50 €\t1 234,50 DZD\t05/03/2026');
    t.at('r1', 'day');
    paste('2026-03-05 00:00:00\t\t\tVRAI');
    t.at('r3', 'ok');
    paste('faux');
    expect(t.changes()).toEqual(['r0/qty=1234.5', 'r0/price=1234.5', 'r0/day="2026-03-05"', 'r1/day="2026-03-05"', 'r1/at=null', 'r1/st=null', 'r1/ok=true', 'r3/ok=false']);
  });

  it('English: a dollar and a sign, parentheses refused, a real code only, 1,5 refused', () => {
    const t = cmake();
    t.at('r0', 'qty');
    paste('-$1,234.50\r\n(1 234)\r\nSKU 100\r\n100 PCS\r\n1,5\r\n');
    expect(t.changes()).toEqual([]);
    expect(t.blinked().sort()).toEqual(['r0/qty', 'r1/qty', 'r2/qty', 'r3/qty', 'r4/qty']);
    // qty min 0 refuses −1234.5 too; the price column takes it.
    t.at('r0', 'price');
    paste('-$1,234.50');
    expect(t.changes()).toEqual(['r0/price=-1234.5']);
  });

  it('Arabic: Arabic-Indic digits, Intl\'s Algerian text, RLM text unchanged, نعم', () => {
    const RLM = String.fromCharCode(0x200f);
    const t = cmake({ lang: 'ar' });
    t.at('r0', 'name');
    paste(`${RLM}محمد\t١٢٫٥\t${RLM}-1.234,50 د.ج.${RLM}`);
    t.at('r1', 'ok');
    paste('نعم');
    expect(t.changes()).toEqual([`r0/name="${RLM}محمد"`, 'r0/qty=12.5', 'r0/price=-1234.5', 'r1/ok=true']);
  });

  it('our guard and our identifier read back; a guard on a number refused; a real \'=x round trip', () => {
    const t = cmake();
    t.at('r0', 'name');
    paste("'=1+1\t'=1+1");
    t.at('r1', 'code');
    paste('="0123"');
    t.at('r2', 'name');
    paste("''=x");
    expect(t.changes()).toEqual(['r0/name="=1+1"', 'r1/code="0123"', 'r2/name="\'=x"']);
    expect(t.blinked()).toEqual(['r0/qty']);
  });

  it('a wall time in a clock change refused (wall-time-skipped), counted', async () => {
    const t = cmake({ lang: 'fr', settings: { timeZone: 'Europe/Paris' } });
    t.at('r0', 'at');
    paste('2026-03-29 02:30:00');
    expect(t.changes()).toEqual([]);
    expect(t.blinked()).toEqual(['r0/at']);
    await flush();
    expect(t.said().at(-1)).toBe('Cellules collées : 0 ; refusées : 1');
  });
});

describe('paste: the copy memo (clipboard.md 22, L7)', () => {
  // 2026-10-25 02:30 in Paris happens twice: the text alone cannot say which (refused); the memo keeps the instant.
  const AMBIG = '2026-10-25T00:30:00Z';
  const amb = () => [{ ...crows(1)[0]!, at: AMBIG }, ...crows(3).slice(1)];

  it('our own copy pasted back writes the values: an ambiguous wall time exact', () => {
    const t = cmake({ rows: amb(), settings: { timeZone: 'Europe/Paris' } });
    t.at('r0', 'at');
    const { text } = clip('copy');
    expect(text).toBe('2026-10-25 02:30:00\r\n');
    t.at('r2', 'at');
    paste(text!);
    expect(t.changes()).toEqual([`r2/at=${Date.parse(AMBIG)}`]);
    // The same text typed elsewhere (not ours): refused.
    t.requests.length = 0;
    t.at('r1', 'at');
    paste('2026-10-25 02:30:00');
    expect(t.changes()).toEqual([]);
  });

  it('a value goes only where the column has the same type; an enum\'s code never into a text column', () => {
    const t = cmake();
    t.at('r1', 'st');
    const { text } = clip('copy');
    expect(text).toBe('Rupture\r\n');
    t.at('r3', 'name');
    paste(text!);
    t.at('r2', 'st');
    paste(text!);
    expect(t.changes()).toEqual(['r3/name="Rupture"', 'r2/st="out"']);
  });

  it('a value never crosses column types: an instant copied onto a number column is read as text there (refused)', () => {
    const t = cmake();
    t.at('r0', 'at');
    const { text } = clip('copy');
    t.at('r1', 'price');
    paste(text!);
    expect(t.changes()).toEqual([]);
    expect(t.blinked()).toEqual(['r1/price']);
  });

  it('an enum\'s value never into another enum column (its own options): the label is read there', () => {
    const cols = [...CCOLS, { id: 'st2', header: 'Way', type: 'enum', width: 50, editable: true, enumOptions: [{ value: 'out', label: 'Sortie' }, { value: 'in', label: 'Entrée' }] } as never];
    const t = cmake({ columns: cols, rows: crows(4).map((r) => ({ ...r, st2: 'in' }) as never) });
    t.at('r1', 'st');
    const { text } = clip('copy');
    expect(text).toBe('Rupture\r\n');
    t.at('r2', 'st2');
    paste(text!);
    // « Rupture » is no option of st2: refused, never its code « out » (which would mean « Sortie »).
    expect(t.changes()).toEqual([]);
    expect(t.blinked()).toEqual(['r2/st2']);
  });

  it('page-wide: another grid of the page pastes the first one\'s values; cleared at that grid\'s destroy', () => {
    const a = cmake({ rows: amb(), settings: { timeZone: 'Europe/Paris' } });
    a.at('r0', 'at');
    const { text } = clip('copy');
    const b = cmake({ rows: crows(3), settings: { timeZone: 'Europe/Paris' } });
    b.at('r1', 'at');
    paste(text!);
    expect(b.changes()).toEqual([`r1/at=${Date.parse(AMBIG)}`]);
    a.g.destroy();
    b.requests.length = 0;
    b.at('r2', 'at');
    paste(text!);
    expect(b.changes()).toEqual([]);
    expect(b.blinked()).toEqual(['r2/at']);
  });

  it('a later copy replaces it: the earlier text is read as text again', () => {
    const t = cmake({ rows: amb(), settings: { timeZone: 'Europe/Paris' } });
    t.at('r0', 'at');
    const first = clip('copy').text!;
    t.at('r1', 'name');
    clip('copy');
    t.at('r2', 'at');
    paste(first);
    expect(t.changes()).toEqual([]);
  });
});

describe('paste: one gesture (clipboard.md 18; edit-undo.md)', () => {
  it('one request, one undo for every cell, one sentence joined with « Saving »', async () => {
    const t = cmake({ save: () => new Promise(() => {}) });
    t.at('r0', 'qty');
    t.api().set(R_(['r0', 'qty'], ['r1', 'price']));
    paste('5\t6\r\n7\t8\r\n');
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.origin).toBe('paste');
    expect(t.requests[0]!.changes).toHaveLength(4);
    expect([t.value('r0', 'qty'), t.value('r0', 'price'), t.value('r1', 'qty'), t.value('r1', 'price')]).toEqual(['5', '6', '7', '8']);
    await flush();
    expect(t.said().slice(-1)).toEqual([`Cells pasted: 4. ${EN_EDIT.text['edit.saving']}`]);
    expect(t.said().filter((s) => s.includes('Cells pasted'))).toHaveLength(1);
    t.edits!.undo();
    expect([t.value('r0', 'qty'), t.value('r0', 'price'), t.value('r1', 'qty'), t.value('r1', 'price')]).toEqual(['0', '0.5', '1', '1.5']);
    expect(t.edits!.canUndo).toBe(false);
  });

  it('a save naming some cells (S3-O2) refuses those only', async () => {
    const t = cmake({ save: (req) => Promise.reject({ cells: [{ key: req.changes[1]!.key, column: req.changes[1]!.column }] }) });
    t.at('r0', 'qty');
    paste('5\r\n6\r\n7\r\n');
    await flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.edits!.state(key('r0'), 'qty')?.status).toBe('saved');
    expect(t.edits!.state(key('r1'), 'qty')?.status).toBe('failed');
    expect(t.edits!.state(key('r2'), 'qty')?.status).toBe('saved');
  });

  it('unchanged cells count as pasted (the user sees the value) and send nothing', async () => {
    const t = cmake();
    t.at('r3', 'qty');
    paste('3');
    expect(t.requests).toEqual([]);
    await flush();
    expect(t.said().at(-1)).toBe('Cells pasted: 1');
  });
});

describe('paste: pages and trees (clipboard.md 25–26)', () => {
  it('a page\'s last row: past it is « outside »', async () => {
    const t = cmake({ settings: { pagination: { pageSize: 10 }, messages: join(CMSG.en, EN_PAGINATION) } as never, extra: [pagination()], rows: crows(30) });
    t.at('r9', 'qty');
    const c = t.api().paste('1\r\n2\r\n3\r\n')!;
    expect(c).toMatchObject({ pasted: 1, outside: 2 });
    expect(t.changes()).toEqual(['r9/qty=1']);
  });

  it('a tree\'s structure column is read-only, counted; the rows shown whatever their level', () => {
    type T = C & { parent: string | null };
    const rows: T[] = crows(4).map((r, i) => ({ ...r, parent: i ? 'r0' : null }));
    const cols = [{ id: 'parent', header: 'Parent', width: 60, editable: true, value: (r: T) => r.parent ?? '' }, ...CCOLS];
    const t = cmake({ rows: rows as C[], columns: cols as never, extra: [tree<T>({ parentId: (r) => r.parent, structure: ['parent'] }) as never], settings: { messages: join(CMSG.en, EN_TREE) } });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [key('r0')], expanded: true }, 'api');
    t.at('r0', 'parent');
    const c = t.api().paste('x\ta\r\ny\tb\r\n')!;
    expect(c).toMatchObject({ pasted: 2, readOnly: 2 });
    expect(t.changes()).toEqual(['r0/name="a"', 'r1/name="b"']);
  });
});

// The test analyser's probes after the step-11b review (scratchpad t11b-probe.test.ts, m01–m34), kept here.
describe('paste: the analyser\'s probes (review of step 11b)', () => {
  const AMBIG = '2026-10-25T00:30:00Z';
  const AMBIG2 = '2026-10-25T01:30:00Z';
  const PARIS = { timeZone: 'Europe/Paris' } as never;
  const inst = (id: string) => ({ id, header: id, type: 'instant', width: 60, editable: true }) as never;

  it('one request for a block of 50 cells (counted, quickly: the « one commit per cell » mutant fails here first)', () => {
    const t = cmake({ rows: crows(60) });
    t.at('r0', 'qty');
    t.api().set(R_(['r0', 'qty'], ['r49', 'qty']));
    expect(t.api().paste('1')!.pasted).toBe(50);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.changes).toHaveLength(49);
  });

  it('m01 a paste with a page selection and no block: still the grid\'s', () => {
    const t = cmake();
    const p = document.body.appendChild(document.createElement('p'));
    p.textContent = 'page text';
    t.at('r1', 'qty');
    const r = document.createRange();
    r.selectNodeContents(p);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(r);
    expect(paste('7').e.defaultPrevented).toBe(true);
    expect(t.changes()).toEqual(['r1/qty=7']);
  });

  it('m03 a copy with headers never becomes the memo', () => {
    const t = cmake({ rows: [{ ...crows(1)[0]!, at: AMBIG }, ...crows(8).slice(1)], settings: PARIS });
    t.at('r0', 'at');
    const { text } = t.api().copy({ headers: true })!;
    t.at('r5', 'at');
    paste(text);
    expect(t.changes()).toEqual([]);
  });

  it('m05 an enum value never crosses grids (same column id, other options): the label is read', () => {
    const a = cmake();
    a.at('r1', 'st');
    const { text } = clip('copy');
    const cols = CCOLS.map((c) => (c.id === 'st' ? { ...c, enumOptions: [{ value: 'out', label: 'Sortie' }, { value: 'in', label: 'Rupture' }] } : c));
    const b = cmake({ columns: cols as never });
    b.at('r1', 'st');
    paste(text!);
    expect(b.changes()).toEqual(['r1/st="in"']);
  });

  it('m06/m07 a memo clipped at the end column: each row its own value, the source column kept', () => {
    const rows = crows(6).map((r, i) => ({ ...r, at: i === 0 ? AMBIG : i === 1 ? AMBIG2 : r.at, at2: null }) as C);
    const t = cmake({ rows, columns: [inst('at'), CCOLS[0]!, inst('at2')] as never, settings: PARIS });
    t.at('r0', 'at');
    t.api().set(R_(['r0', 'at'], ['r1', 'name']));
    const { text } = clip('copy');
    t.api().clear();
    t.at('r2', 'at2');
    paste(text!);
    expect(t.changes()).toEqual([`r2/at2=${Date.parse(AMBIG)}`, `r3/at2=${Date.parse(AMBIG2)}`]);
  });

  it('m08 one copied cell filling a two-wide block: both cells its value', () => {
    const rows = crows(4).map((r, i) => ({ ...r, at: i === 0 ? AMBIG : r.at, at2: null }) as C);
    const t = cmake({ rows, columns: [inst('at'), inst('at2'), CCOLS[0]!] as never, settings: PARIS });
    t.at('r0', 'at');
    const { text } = clip('copy');
    t.at('r1', 'at');
    t.api().set(R_(['r1', 'at'], ['r1', 'at2']));
    paste(text!);
    expect(t.changes()).toEqual([`r1/at=${Date.parse(AMBIG)}`, `r1/at2=${Date.parse(AMBIG)}`]);
  });

  it('m11 refused cells blink only when mounted', () => {
    const t = cmake({ rows: crows(200) });
    t.at('r0', 'qty');
    t.api().set(R_(['r0', 'qty'], ['r199', 'qty']));
    const mounted = crows(200).map((r) => r.id).filter((id) => t.cell(id, 'qty'));
    expect(mounted.length).toBeLessThan(200);
    expect(t.api().paste('abc')!.refused).toBe(200);
    expect(t.blinked()).toEqual(mounted.map((id) => `${id}/qty`));
  });

  it('m12/m13 maxLength Infinity is no cap; 2.5 is the default 1 000', () => {
    const cols = CCOLS.map((c) => (c.id === 'code' ? { ...c, edit: { maxLength: Infinity } } : c.id === 'name' ? { ...c, edit: { maxLength: 2.5 } } : c));
    const t = cmake({ columns: cols });
    t.at('r0', 'code');
    expect(t.api().paste('z'.repeat(1001))!.tooLong).toBe(0);
    t.at('r0', 'name');
    expect(t.api().paste('abc')!.tooLong).toBe(0);
    expect(t.changes()).toEqual([`r0/code="${'z'.repeat(1001)}"`, 'r0/name="abc"']);
  });

  it('m14 a memo value over the column\'s cap is too long', () => {
    const cols = CCOLS.map((c) => (c.id === 'code' ? { ...c, edit: { maxLength: 3 } } : c));
    const t = cmake({ columns: cols, rows: [{ ...crows(1)[0]!, name: 'abcdefgh' }, ...crows(3).slice(1)] });
    t.at('r0', 'name');
    const { text } = clip('copy');
    t.at('r1', 'code');
    expect(t.api().paste(text!)).toMatchObject({ pasted: 0, tooLong: 1 });
    expect(t.changes()).toEqual([]);
  });

  it('m19 another grid\'s destroy keeps the memo', () => {
    const a = cmake({ rows: [{ ...crows(1)[0]!, at: AMBIG }, ...crows(3).slice(1)], settings: PARIS });
    a.at('r0', 'at');
    const { text } = clip('copy');
    const b = cmake();
    b.g.destroy();
    a.at('r2', 'at');
    paste(text!);
    expect(a.changes()).toEqual([`r2/at=${Date.parse(AMBIG)}`]);
  });

  it('m21 the block written by a paste is not said after the pause', async () => {
    const t = cmake();
    t.at('r0', 'qty');
    paste('5\t6\r\n7\t8');
    await new Promise((r) => setTimeout(r, 600));
    expect(t.said().filter((s) => /selected/.test(s))).toEqual([]);
  });

  it('m24 an empty api paste answers zero counts at once', () => {
    const t = cmake();
    t.at('r0', 'name');
    expect(t.api().paste('')).toEqual({ pasted: 0, refused: 0, readOnly: 0, tooLong: 0, outside: 0, tooBig: false });
  });

  it('m34 a maxPaste above the default is honoured', { timeout: 120_000 }, () => {
    const rows = Array.from({ length: 100_001 }, (_, i) => ({ ...crows(1)[0]!, id: `r${i}` }));
    const t = cmake({ rows, columns: [CCOLS[0]!], range: { maxPaste: 100_001 } });
    t.at('r0', 'name');
    t.press('a', { ctrlKey: true });
    expect(t.api().paste('v')).toMatchObject({ pasted: 100_001, tooBig: false });
  });
});
