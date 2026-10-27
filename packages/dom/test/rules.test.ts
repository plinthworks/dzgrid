// Selection rules in the grid (step 21, docs/behaviors/selection-rules.md; decisions step21-decisions.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GridMessages } from '../src/messages.js';
import { rules, RULES_KEYS } from '../src/rules.js';
import { EN } from '../src/locales/en.js';
import { EN_RULES } from '../src/locales/en-rules.js';
import { FR_RULES } from '../src/locales/fr-rules.js';
import { AR_RULES } from '../src/locales/ar-rules.js';
import { createGrid } from '../src/grid.js';
import { readFileSync } from 'node:fs';
import { cleanup, grids, held, k, refuse, rmake, ROWS, type R, type Rule } from './support-rules.js';

afterEach(cleanup);
const hadReport = (window as unknown as { reportError?: unknown }).reportError;
afterEach(() => { (window as unknown as { reportError?: unknown }).reportError = hadReport; });

/** The live region's text once its beat has passed. */
async function heard(t: ReturnType<typeof rmake>): Promise<string> {
  await new Promise((r) => setTimeout(r, 60));
  return t.ctx.live.el.textContent ?? '';
}

describe('a refused row', () => {
  it('a click on its box leaves the selection as it was, says it, and tells selectionRefused', async () => {
    const t = rmake({ rule: refuse(['r3']) });
    t.clickBox('r1');
    t.clickBox('r3');
    expect(held(t.g.kernel.selection)).toEqual(['r1']);
    expect(t.refusals()).toEqual([{ type: 'selectionRefused', source: 'user', rows: [k('r3')], reason: null, cause: 'rule' }]);
    expect(await heard(t)).toBe('Not selectable');
    expect(t.rowEl('r3')!.getAttribute('aria-selected')).toBe('false');
  });

  it('Space on it says the refusal, and says it again on a second try', async () => {
    const t = rmake({ rule: refuse(['r2']) });
    t.focusRow('r2');
    t.press(' ');
    expect(await heard(t)).toBe('Not selectable');
    const n = t.said().length;
    t.press(' ');
    expect(t.said().length).toBe(n + 1);
    expect(t.said().at(-1)).toBe('Not selectable');
    expect(t.g.kernel.selection.keys.size).toBe(0);
  });

  it('a plain click (click selection) on it never empties the selection', () => {
    const t = rmake({ rule: refuse(['r4']), settings: { selection: { mode: 'multi', checkbox: true, click: true, canSelect: refuse(['r4']) } } });
    t.clickBox('r1');
    t.clickBox('r2');
    t.rowEl('r4')!.querySelector<HTMLElement>('.dzg-cell')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(held(t.g.kernel.selection)).toEqual(['r1', 'r2']);
  });

  it('a string the rule returns is said inside the refusal', async () => {
    const t = rmake({ rule: refuse(['r1'], 'Row 4 is ticked') });
    t.clickBox('r1');
    expect(await heard(t)).toBe('Row 4 is ticked');
  });

  it('an empty string from the rule is a plain refusal: "Not selectable", never an empty sentence', async () => {
    const t = rmake({ rule: refuse(['r1'], '') });
    t.clickBox('r1');
    expect(await heard(t)).toBe('Not selectable');
    expect(t.refusals()).toEqual([{ type: 'selectionRefused', source: 'user', rows: [k('r1')], reason: null, cause: 'rule' }]);
  });

  it('is greyed on its box (data-dzg-refused), never aria-disabled', () => {
    const t = rmake({ rule: refuse(['r3', 'r5']) });
    expect(t.check('r3')!.hasAttribute('data-dzg-refused')).toBe(true);
    expect(t.check('r5')!.hasAttribute('data-dzg-refused')).toBe(true);
    expect(t.check('r4')!.hasAttribute('data-dzg-refused')).toBe(false);
    expect(t.host.querySelector('[aria-disabled]')).toBeNull();
  });

  it('the look follows the selection: "if row 4 is ticked, row 8 cannot be"', () => {
    const rule: Rule = (row, s) => !(row.data.id === 'r8' && s.keys.has(k('r4')));
    const t = rmake({ rule });
    expect(t.check('r8')!.hasAttribute('data-dzg-refused')).toBe(false);
    t.clickBox('r4');
    expect(t.check('r8')!.hasAttribute('data-dzg-refused')).toBe(true);
    t.clickBox('r4');
    expect(t.check('r8')!.hasAttribute('data-dzg-refused')).toBe(false);
  });

  it('a selected row is never greyed, even when the rule would refuse it now', () => {
    const t = rmake({ rule: null, settings: { selection: { mode: 'multi', checkbox: true } } });
    t.clickBox('r2');
    t.g.update({ selection: { mode: 'multi', checkbox: true, canSelect: refuse(['r2']) } });
    expect(t.check('r2')!.hasAttribute('data-dzg-refused')).toBe(false);
  });
});

describe('several rows at once', () => {
  it('a Shift range ticks the allowed rows in screen order and says one combined sentence', async () => {
    const rule: Rule = (row, s) => !(row.data.id === 'r8' && s.keys.has(k('r4')));
    const t = rmake({ rule });
    t.clickBox('r2');
    t.clickBox('r9', { shiftKey: true });
    expect(held(t.g.kernel.selection)).toEqual(['r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r9']);
    expect(await heard(t)).toBe('7 rows selected, 1 not selectable');
    expect(t.events.filter((e) => e.type === 'selectionChanged' || e.type === 'selectionRefused').slice(-2).map((e) => e.type)).toEqual(['selectionChanged', 'selectionRefused']);
  });

  it('Ctrl+A takes the rows shown, skipping refused ones; the box then reads ticked', async () => {
    const t = rmake({ rule: refuse(['r1', 'r5']), rows: ROWS.slice(0, 8) });
    t.focusRow('r0');
    t.press('a', { ctrlKey: true });
    expect(held(t.g.kernel.selection)).toEqual(['r0', 'r2', 'r3', 'r4', 'r6', 'r7']);
    expect(await heard(t)).toBe('6 rows selected, 2 not selectable');
    expect(t.headerBox()!.getAttribute('aria-checked')).toBe('true');
  });

  it('the header box ticks what is allowed; a second click clears', () => {
    const t = rmake({ rule: refuse(['r1']), rows: ROWS.slice(0, 4) });
    t.headerBox()!.click();
    expect(held(t.g.kernel.selection)).toEqual(['r0', 'r2', 'r3']);
    expect(t.headerBox()!.getAttribute('aria-checked')).toBe('true');
    t.headerBox()!.click();
    expect(t.g.kernel.selection.keys.size).toBe(0);
  });

  it('nothing accepted: no "selected" sentence, the plural refusal', async () => {
    const t = rmake({ rule: refuse(['r0', 'r1', 'r2']), rows: ROWS.slice(0, 3) });
    t.headerBox()!.click();
    expect(t.events.some((e) => e.type === 'selectionChanged')).toBe(false);
    expect(await heard(t)).toBe('3 not selectable');
  });

  it('unticking is always allowed', () => {
    const t = rmake({ rule: null, settings: { selection: { mode: 'multi', checkbox: true } } });
    t.clickBox('r1');
    t.g.update({ selection: { mode: 'multi', checkbox: true, canSelect: () => false } });
    t.clickBox('r1');
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.refusals()).toEqual([]);
  });
});

describe('pages and servers', () => {
  it('on browser pages the box takes the page; the footer offers no "Select all N rows"', () => {
    const t = rmake({ mode: 'paged', rule: refuse(['r3']) });
    t.headerBox()!.click();
    expect(held(t.g.kernel.selection)).toEqual(['r0', 'r1', 'r2', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9']);
    const all = t.host.querySelector<HTMLElement>('.dzg-footer button[data-act="all"]');
    expect(all === null || all.hidden).toBe(true);
  });

  it('without a rule, the same page offers "Select all N rows" (the guard of the test above)', () => {
    const t = rmake({ mode: 'paged', rule: null });
    t.headerBox()!.click();
    expect(t.host.querySelector<HTMLElement>('.dzg-footer button[data-act="all"]')!.hidden).toBe(false);
  });

  it('on server pages the box and Ctrl+A take the rows shown, other pages keep their keys', () => {
    const t = rmake({ mode: 'offset', rule: refuse(['r12']) });
    t.answer(0, 10, { total: 40 });
    t.clickBox('r1');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    t.answer(10, 10, { total: 40 });
    t.headerBox()!.click();
    expect(t.g.kernel.selection.mode).toBe('include');
    expect(held(t.g.kernel.selection)).toEqual(['r1', 'r10', 'r11', 'r13', 'r14', 'r15', 'r16', 'r17', 'r18', 'r19']);
    expect(t.headerBox()!.getAttribute('aria-checked')).toBe('true');
    // The box again: that page's rows only leave.
    t.headerBox()!.click();
    expect(held(t.g.kernel.selection)).toEqual(['r1']);
  });

  it('select all matching (the API) is refused under a rule, and said', async () => {
    const t = rmake({ mode: 'paged', rule: refuse([]) });
    t.g.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(t.g.kernel.selection.mode).toBe('include');
    expect(t.refusals().at(-1)).toMatchObject({ cause: 'needs-rows' });
    expect(await heard(t)).toBe('30 not selectable');
  });

  it('a host selection.set refused is told as a problem, not said', async () => {
    const t = rmake({ rule: refuse(['r2']) });
    t.g.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('r1'), k('r2')]) } }, 'host');
    expect(held(t.g.kernel.selection)).toEqual(['r1']);
    expect(t.problems()).toContainEqual({ code: 'selection-refused', severity: 'warning', path: 'selection', detail: 'rule' });
    expect(t.said().some((s) => /selectable/.test(s))).toBe(false);
  });
});

describe('the rule and its context', () => {
  it('gets the row, the selection it would join and settings.context', () => {
    const seen: unknown[] = [];
    const ctxA = { ward: 'A' };
    const t = rmake({ rule: (row, s, c) => (seen.push([row.data.id, held(s), c]), true), settings: { context: ctxA } });
    seen.length = 0;
    t.clickBox('r1');
    t.clickBox('r2');
    expect(seen.filter((x) => (x as unknown[])[0] === 'r2')).toContainEqual(['r2', ['r1'], ctxA]);
  });

  it('a new rule or a new context applies at once, without re-vetting what is selected', () => {
    const t = rmake({ rule: refuse([]) });
    t.clickBox('r1');
    t.g.update({ selection: { mode: 'multi', checkbox: true, canSelect: refuse(['r1', 'r2']) } });
    expect(held(t.g.kernel.selection)).toEqual(['r1']);
    expect(t.check('r2')!.hasAttribute('data-dzg-refused')).toBe(true);
    const byCtx: Rule = (row, _s, c) => (c as { off: string }).off !== row.data.id;
    t.g.update({ selection: { mode: 'multi', checkbox: true, canSelect: byCtx }, context: { off: 'r3' } });
    expect(t.check('r3')!.hasAttribute('data-dzg-refused')).toBe(true);
    expect(t.check('r2')!.hasAttribute('data-dzg-refused')).toBe(false);
    t.g.update({ context: { off: 'r4' } });
    expect(t.check('r3')!.hasAttribute('data-dzg-refused')).toBe(false);
    expect(t.check('r4')!.hasAttribute('data-dzg-refused')).toBe(true);
    t.clickBox('r4');
    expect(held(t.g.kernel.selection)).toEqual(['r1']);
  });

  it('a rule that throws refuses that row, and the error is reported', () => {
    const reported: unknown[] = [];
    (window as unknown as { reportError: unknown }).reportError = (e: unknown) => { reported.push(e); };
    const t = rmake({ rule: (row) => { if (row.data.id === 'r2') throw new Error('rule broke'); return true; } });
    t.clickBox('r2');
    t.clickBox('r1');
    expect(held(t.g.kernel.selection)).toEqual(['r1']);
    expect(reported.some((e) => (e as Error).message === 'rule broke')).toBe(true);
  });

  it('asks the rule for the rows mounted only, and not again on a scroll back', () => {
    const calls: string[] = [];
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: `r${i}`, name: `n${i}`, n: i }));
    const t = rmake({ rows, rule: (row) => (calls.push(row.data.id), true), block: 320 });
    const first = calls.length;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(40);
    t.scrollTo(32 * 500);
    const after = calls.length;
    expect(after - first).toBeLessThan(40);
    t.scrollTo(0);
    expect(calls.length).toBe(after);
  });
});

describe('fail closed and the texts', () => {
  it('canSelect without rules() is an error problem and no row can be selected', () => {
    const t = rmake({ rule: refuse([]), features: [] });
    expect(t.problems()).toContainEqual({ code: 'missing-feature', severity: 'error', path: 'settings.selection.canSelect', detail: 'rules' });
    // No box column: the mode is none.
    expect(t.check('r1')).toBeNull();
    t.focusRow('r2');
    t.press(' ');
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.vp.hasAttribute('aria-multiselectable')).toBe(false);
  });

  it('a rule given later to a grid without rules() clears the selection and is told once', () => {
    const t = rmake({ rule: null, features: [] });
    t.clickBox('r1');
    expect(t.g.kernel.selection.keys.size).toBe(1);
    t.g.update({ selection: { mode: 'multi', checkbox: true, canSelect: () => true } });
    t.g.update({ selection: { mode: 'multi', checkbox: true, canSelect: () => true } });
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.problems().filter((p) => p.path === 'settings.selection.canSelect')).toHaveLength(1);
    expect(t.check('r1')).toBeNull();
    t.focusRow('r1');
    t.press(' ');
    expect(t.g.kernel.selection.keys.size).toBe(0);
  });

  it('rules() without a rule changes nothing', () => {
    const t = rmake({ rule: null, mode: 'offset' });
    t.answer(0, 10, { total: 40 });
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(t.g.kernel.selection.mode).toBe('exclude');
    expect(t.check('r1')!.hasAttribute('data-dzg-refused')).toBe(false);
  });

  it('rules() names a missing text', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const messages: GridMessages = { locale: 'en', text: { ...EN.text } };
    expect(() => grids.push(createGrid<R>(host, { rows: ROWS, getRowId: (r) => r.id, columns: [{ id: 'name' }], messages, features: [rules()] }) as never)).toThrow(/rules: missing rules\.refused/);
  });

  it('every bundle has every key', () => {
    for (const b of [EN_RULES, FR_RULES, AR_RULES]) expect(Object.keys(b.text).sort()).toEqual([...RULES_KEYS].sort());
  });

  it('says the sentences in French and Arabic', async () => {
    const fr = rmake({ lang: 'fr', rule: refuse(['r1']) });
    fr.clickBox('r1');
    expect(await heard(fr)).toBe('Non sélectionnable');
    const ar = rmake({ lang: 'ar', rule: refuse(['r1']) });
    ar.clickBox('r1');
    expect(await heard(ar)).toBe('غير قابل للتحديد');
  });

  it('the feature taken down removes the gate', () => {
    const t = rmake({ rule: refuse(['r1']) });
    for (const h of t.ctx.features) h.destroy();
    t.g.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    expect(held(t.g.kernel.selection)).toEqual(['r1']);
  });
});

describe('single mode', () => {
  it('Space on a refused row keeps the row selected before', () => {
    const t = rmake({ selection: 'single', rule: refuse(['r2']) });
    t.focusRow('r1');
    t.press(' ');
    t.focusRow('r2');
    t.press(' ');
    expect(held(t.g.kernel.selection)).toEqual(['r1']);
    vi.restoreAllMocks();
  });
});

describe('the size lines (owner, 2026-10-20, step 21; reset at the Phase 3 close, step 25)', () => {
  it('hold the budgets set at the close (measure + 10 %, rounded up to 50 B, owner Q2)', () => {
    const b = (JSON.parse(readFileSync(`${process.cwd()}/size-budget.json`, 'utf8')) as { entries: Record<string, { file?: string; maxGzip: number | null; external?: string[]; over?: string }> }).entries;
    expect(b['@dzgrid/core']!.maxGzip).toBe(29150); // Phase 6 step 8b-1 (owner Q2): 29 150; before: the owner's grant, Phase 4 close (Q17b)
    expect(b['@dzgrid/dom']!.maxGzip).toBe(22400); // Phase 6 step 8b-1 (owner Q2): 22 400; before: Phase 5 close (Q-C2): the measure 21 565 + 10 %, capped at the T7 grant 21 980
    // Owner S6-O6 (Phase 5 step 6): the filters' loader moved in, its measure + 50 (1 184 → 1 234), ceiling 1 250;
    // Phase 5 close (Q-C2): the measure 1 184 + 10 %, capped at that ceiling → 1 250.
    expect(b['@dzgrid/dom/internal']!.maxGzip).toBe(1250);
    expect(b['@dzgrid/dom/slots']!.maxGzip).toBe(1400);
    expect(b['@dzgrid/core/rules']).toEqual({ file: 'packages/core/src/rules.ts', maxGzip: 600, over: '@dzgrid/core' }); // Phase 4 close: 492 + 10 % = 550; Phase 5 close (Q-C3): 512 + 10 % = 600
    expect(b['@dzgrid/dom/rules']).toEqual({ file: 'packages/dom/src/rules.ts', maxGzip: 750, external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal'] });
    expect([b['@dzgrid/dom/locales/en-rules']!.maxGzip, b['@dzgrid/dom/locales/fr-rules']!.maxGzip, b['@dzgrid/dom/locales/ar-rules']!.maxGzip]).toEqual([200, 200, 250]);
    expect(b['@dzgrid/dom/filters']!.maxGzip).toBe(10100); // the owner's grant (Q17b), §5.2's /filters 10 kB; 10 100 since the owner's look (2026-10-27)
    expect(b['@dzgrid/theme']!.maxGzip).toBe(2850); // the owner's third look (decisions.md « Comfort stylesheet »); Phase 5 close (Q-C2): 2 750, the measure 2 494 + 10 %
    expect(b['@dzgrid/dom/pagination']!.maxGzip).toBe(3550); // Phase 4 close: 3 211 + 10 %
    expect(b['@dzgrid/dom/export']!.maxGzip).toBe(1350); // a raise: it was at its cap
  });
});
