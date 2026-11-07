// The pivot's one bar (owner feedback 2026-11-07): pivot.md 31–37. Three named parts, the values' chips and menu, the
// order of a pivot column, moves between parts, the columns panel's sections. Expectations by hand from the sheet and
// support-pivot.ts (Nord: Jan 10, Feb 5; Sud: Jan 2 + 4; no region: Feb 1).
import { describe, it, expect, afterEach } from 'vitest';
import { grouping } from '../src/grouping.js';
import { pivot, type PivotFeatureOptions } from '../src/pivot.js';
import { pivotBar } from '../src/pivot-bar.js';
import { spans } from '../src/spans.js';
import { gridState } from '../src/state.js';
import { columnsChooser } from '../src/columns-panel.js';
import { EN_PIVOT_BAR } from '../src/locales/en-pivot-bar.js';
import { AR_PIVOT_BAR } from '../src/locales/ar-pivot-bar.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { EN_COLUMN_MENU } from '../src/locales/en-column-menu.js';
import type { GridFeature } from '../src/features.js';
import { cleanup, gmake } from './support-grouping.js';
import { FEB, JAN, PIVOT_BUNDLES, SALES, SALE_COLUMNS } from './support-pivot.js';

afterEach(cleanup);

type Target = { accept(column: string): boolean; drop(column: string): void; readonly label?: string };
function bmake(o: { pivot?: PivotFeatureOptions; more?: GridFeature[]; ar?: boolean; panel?: boolean; targets?: [Element, Target][] } = {}) {
  const p = pivot(o.pivot ?? { columns: ['month'], values: { amount: 'sum' } });
  const gf = grouping({ by: ['region'], pivot: p });
  // A stand-in for `columns()`: the drop targets the bar registers, kept for the test.
  const cols = o.targets && { api: () => ({ dropTargets: { add: (el: Element, x: Target) => (o.targets!.push([el, x]), () => {}) } }) };
  const bar = pivotBar({ use: { grouping: gf, pivot: p, ...(cols && { columns: cols }) }, ...(o.panel === false && { panel: false }) });
  const b = PIVOT_BUNDLES[o.ar ? 'ar' : 'en'];
  const messages = { ...b, text: { ...b.text, ...(o.ar ? AR_PIVOT_BAR : EN_PIVOT_BAR).text, ...EN_COLUMNS.text, ...EN_COLUMN_MENU.text } };
  const t = gmake({
    // The sales fixture's rows and columns, not the grouping fixture's.
    rows: SALES as never, columns: SALE_COLUMNS as never, grouping: null,
    settings: { messages, ...(o.ar && { direction: 'rtl' as const }) }, features: [spans(), gf, bar, ...(o.more ?? [])],
  });
  const parts = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-pzone > .dzg-ppart')];
  const part = (i: number, root: ParentNode = t.host) => [...root.querySelectorAll<HTMLElement>('.dzg-ppart')][i]!;
  const chips = (i: number, root?: ParentNode) => [...part(i, root).querySelectorAll<HTMLElement>('.dzg-chip')].map((c) => c.textContent);
  const chip = (i: number, col: string, cls = 'dzg-chip', root?: ParentNode) => part(i, root).querySelector<HTMLElement>(`.dzg-gchip[data-col="${col}"] .${cls}`)!;
  const key = (el: Element, k: string, mods: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
  const menu = () => [...document.querySelectorAll<HTMLElement>('[role=menu] [role^=menuitem]')];
  return { ...t, p, papi: () => p.api(t.g)!, gapi: () => gf.api(t.g)!, parts, part, chips, chip, key, menu };
}

describe('one bar, three named parts (pivot.md 31)', () => {
  it('« Rows │ Columns │ Values », each a toolbar named by its visible name, one tab stop each; the pivot\'s strip at its end', () => {
    const t = bmake({ pivot: { columns: ['month'], values: { amount: 'sum' }, toggle: 'inside' } });
    const parts = t.parts();
    expect(parts.map((p) => [p.getAttribute('role'), document.getElementById(p.getAttribute('aria-labelledby')!)!.textContent])).toEqual([['toolbar', 'Rows'], ['toolbar', 'Columns'], ['toolbar', 'Values']]);
    expect([t.chips(0), t.chips(1), t.chips(2)]).toEqual([['Region'], ['Month'], ['sum(Amount)']]);
    expect(parts.map((p) => [...p.querySelectorAll<HTMLElement>('button')].filter((b) => b.tabIndex === 0).length)).toEqual([1, 1, 1]);
    const zone = t.host.querySelector('.dzg-pzone')!;
    expect(zone.lastElementChild!.classList.contains('dzg-pbar')).toBe(true);
    expect(zone.querySelector('[role=switch]')!.getAttribute('aria-checked')).toBe('true');
    // Above the rows, and no other band.
    expect(zone.nextElementSibling).toBe(t.vp);
  });

  it('empty parts show their hint; destroyed, the bar goes', () => {
    const t = bmake({ pivot: { columns: [], values: {} } });
    expect(t.part(1).querySelector('.dzg-gzone-empty')!.textContent).toBe('Add a column here to spread it across');
    expect(t.part(2).querySelector('.dzg-gzone-empty')!.textContent).toBe('Add a value to total');
    t.g.destroy();
    expect(t.host.querySelector('.dzg-pzone')).toBeNull();
  });
});

describe('« Values » (pivot.md 32)', () => {
  it('a click on a value\'s chip opens the « Total » radios that fit; one chosen sets it, said, the focus back on the chip', () => {
    const t = bmake();
    const c = t.chip(2, 'amount');
    expect(c.getAttribute('aria-haspopup')).toBe('menu');
    c.focus();
    c.click();
    expect(t.menu().map((x) => [x.textContent, x.getAttribute('aria-checked')])).toEqual([['Sum', 'true'], ['Average', 'false'], ['Min', 'false'], ['Max', 'false'], ['Count', 'false']]);
    t.menu()[1]!.click();
    expect(t.papi().values()).toEqual({ amount: 'avg' });
    expect(t.said()).toContain('Amount: Average');
    expect(t.chips(2)).toEqual(['average(Amount)']);
    expect(document.activeElement).toBe(t.chip(2, 'amount'));
  });

  it('« + » offers the columns that can be totalled; one added with its function; × removes, said', () => {
    const t = bmake();
    const plus = t.part(2).querySelector<HTMLElement>('.dzg-zadd')!;
    expect(plus.getAttribute('aria-label')).toBe('Add a value');
    plus.click();
    // Qty: a number not yet a value; never Title, Month, Sold (no aggFunc), Region.
    expect(t.menu().map((x) => x.textContent)).toEqual(['Qty']);
    t.menu()[0]!.click();
    expect(t.papi().values()).toEqual({ amount: 'sum', qty: 'sum' });
    expect(t.said()).toContain('Value added: Qty');
    t.chip(2, 'amount', 'dzg-chip-x').click();
    expect(t.papi().values()).toEqual({ qty: 'sum' });
    expect(t.said()).toContain('Amount removed from the values');
  });

  it('Ctrl+Shift+arrows move a value one place, said', () => {
    const t = bmake({ pivot: { columns: ['month'], values: { amount: 'sum', qty: 'count' } } });
    t.key(t.chip(2, 'amount'), 'ArrowRight', { ctrlKey: true, shiftKey: true });
    expect(Object.keys(t.papi().values())).toEqual(['qty', 'amount']);
    expect(t.said()).toContain('Amount: place 2 of 2');
    expect(t.chips(2)).toEqual(['count(Qty)', 'sum(Amount)']);
  });
});

describe('the order of a pivot column (pivot.md 33)', () => {
  it('↑ / ↓ after the name, aria-pressed; a click reverses the created columns, said; saved with the pivot', () => {
    const st = gridState();
    const t = bmake({ more: [st] });
    const o = t.chip(1, 'month', 'dzg-chip-o');
    expect([o.textContent, o.getAttribute('aria-pressed'), o.getAttribute('aria-label')]).toEqual(['↑', 'false', 'Reverse order: Month']);
    o.click();
    expect(t.papi().desc()).toEqual(['month']);
    expect(t.ctx.columns.visible().map((c) => c.id)).toEqual(['~p:rows', JAN, FEB, 'amount']);
    expect([t.chip(1, 'month', 'dzg-chip-o').textContent, t.chip(1, 'month', 'dzg-chip-o').getAttribute('aria-pressed')]).toEqual(['↓', 'true']);
    expect(t.said()).toContain('Month: reverse order');
    expect(st.api(t.g)!.state().pivot).toEqual({ on: true, columns: ['month'], desc: ['month'], values: { amount: 'sum' } });
  });

  it('the roving order of a pivot chip is name, order, ×', () => {
    const t = bmake();
    const items = [...t.part(1).querySelectorAll<HTMLElement>('.dzg-chip, .dzg-chip-o, .dzg-chip-x')].map((b) => b.className);
    expect(items).toEqual(['dzg-chip', 'dzg-chip-o', 'dzg-chip-x', 'dzg-chip-x dzg-zadd']);
    t.chip(1, 'month').focus();
    t.key(t.chip(1, 'month'), 'ArrowRight');
    expect(document.activeElement).toBe(t.chip(1, 'month', 'dzg-chip-o'));
  });
});

describe('moving a column between parts (pivot.md 37)', () => {
  it('Ctrl+Shift+ArrowDown moves Region from « Rows » to « Columns », said, the focus on its chip there', () => {
    const t = bmake();
    t.chip(0, 'region').focus();
    t.key(t.chip(0, 'region'), 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect([t.gapi().by(), t.papi().by()]).toEqual([[], ['month', 'region']]);
    expect(t.said()).toContain('Spread across: Region');
    expect(document.activeElement).toBe(t.chip(1, 'region'));
  });

  it('a column that cannot be totalled is refused by « Values », nothing changes, said; a value goes up to « Columns »', () => {
    const t = bmake();
    t.key(t.chip(1, 'month'), 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect([t.papi().by(), t.papi().values()]).toEqual([['month'], { amount: 'sum' }]);
    expect(t.said()).toContain('Month cannot go in Values');
    t.key(t.chip(2, 'amount'), 'ArrowUp', { ctrlKey: true, shiftKey: true });
    expect([t.papi().by(), t.papi().values()]).toEqual([['month', 'amount'], {}]);
  });

  it('a chip dragged and released over another part moves there', () => {
    const t = bmake();
    const target = t.part(0);
    const was = document.elementFromPoint;
    // jsdom draws nothing: the part under the pointer is the « Rows » part.
    document.elementFromPoint = () => target;
    try {
      const c = t.chip(1, 'month').closest<HTMLElement>('.dzg-gchip')!;
      c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 0, clientY: 0, pointerType: 'mouse' }));
      c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 30, clientY: 0, pointerType: 'mouse' }));
      expect(target.getAttribute('data-dzg-drop')).toBe('over');
      c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 30, clientY: 0, pointerType: 'mouse' }));
    } finally {
      document.elementFromPoint = was;
    }
    expect([t.gapi().by(), t.papi().by()]).toEqual([['region', 'month'], []]);
  });

  it('a header dropped on a part (with columns()): a column of the other band leaves it; « Values » takes a number only', () => {
    const targets: [Element, Target][] = [];
    const t = bmake({ targets });
    expect(targets.map(([el, x]) => [el, x.label])).toEqual([[t.part(0), 'Rows'], [t.part(1), 'Columns'], [t.part(2), 'Values']]);
    const [, cols] = targets[1]!;
    expect([cols.accept('region'), cols.accept('month'), targets[2]![1].accept('title'), targets[2]![1].accept('qty')]).toEqual([true, false, false, true]);
    cols.drop('region');
    expect([t.gapi().by(), t.papi().by()]).toEqual([[], ['month', 'region']]);
  });

  it('right to left: the arrows between items follow the reading direction', () => {
    const t = bmake({ ar: true });
    t.chip(1, 'month').focus();
    t.key(t.chip(1, 'month'), 'ArrowLeft');
    expect(document.activeElement).toBe(t.chip(1, 'month', 'dzg-chip-o'));
    expect(document.getElementById(t.part(2).getAttribute('aria-labelledby')!)!.textContent).toBe('القيم');
  });
});

describe('the columns panel (pivot.md 35, 36)', () => {
  it('its top holds « Pivot mode » and the three parts; the switch flips the mode; Tab goes through them before the search', () => {
    const chooser = columnsChooser();
    const t = bmake({ more: [chooser] });
    chooser.api(t.g)!.open();
    const top = document.querySelector<HTMLElement>('.dzg-cp-top')!;
    const sw = top.querySelector<HTMLButtonElement>('[role=switch]')!;
    expect([sw.textContent, sw.getAttribute('aria-checked')]).toEqual(['Pivot mode', 'true']);
    expect(t.chips(0, top)).toEqual(['Region']);
    expect(t.chips(2, top)).toEqual(['sum(Amount)']);
    const search = document.querySelector<HTMLInputElement>('.dzg-cp-q input')!;
    search.focus();
    t.key(search, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(t.part(2, top).querySelector('[tabindex="0"]'));
    sw.click();
    expect(t.papi().on()).toBe(false);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('a value\'s menu from inside the dialog: the dialog stays open, the function set', () => {
    const chooser = columnsChooser();
    const t = bmake({ more: [chooser] });
    chooser.api(t.g)!.open();
    const top = document.querySelector<HTMLElement>('.dzg-cp-top')!;
    t.chip(2, 'amount', 'dzg-chip', top).click();
    t.menu()[4]!.click();
    expect(t.papi().values()).toEqual({ amount: 'count' });
    expect(chooser.api(t.g)!.isOpen).toBe(true);
  });

  it('`panel: false`: the panel as before', () => {
    const chooser = columnsChooser();
    const t = bmake({ more: [chooser], panel: false });
    chooser.api(t.g)!.open();
    expect(document.querySelector('.dzg-cp-top')!.childElementCount).toBe(0);
  });
});
