// The « Colonnes » band, the « + » of both bands and the column menu's pivot items (Phase 10, DOM batch): pivot.md 19, 20;
// group-drop-zone.md 18, 19; column-menu.md « Pivot »; WCAG 2.5.7. Expectations by hand from the sheets and support-pivot.ts.
import { describe, it, expect, afterEach } from 'vitest';
import { groupZone } from '../src/group-zone.js';
import { grouping } from '../src/grouping.js';
import { columnMenu } from '../src/column-menu.js';
import { pivot } from '../src/pivot.js';
import { spans } from '../src/spans.js';
import { EN_COLUMN_MENU } from '../src/locales/en-column-menu.js';
import { cleanup, click, gmake } from './support-grouping.js';
import { JAN, PIVOT_BUNDLES, SALES, SALE_COLUMNS, SUD } from './support-pivot.js';

afterEach(cleanup);

function zmake(o: { menu?: boolean } = {}) {
  const p = pivot({ columns: ['month'], values: { amount: 'sum' } });
  const g = grouping({ by: ['region'], pivot: p });
  const menu = columnMenu({ use: { grouping: g, pivot: p } });
  const messages = { ...PIVOT_BUNDLES.en, text: { ...PIVOT_BUNDLES.en.text, ...EN_COLUMN_MENU.text } };
  const t = gmake({
    // The sales fixture's row type, not the grouping fixture's.
    rows: SALES as never, columns: SALE_COLUMNS as never, grouping: null, settings: { messages },
    features: [spans(), g, groupZone({ use: { grouping: g } }), groupZone({ use: { grouping: p }, texts: 'pivot' }), ...(o.menu ? [menu] : [])],
  });
  const zones = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-gzone[role=toolbar]')];
  const plus = (i: number) => zones()[i]!.querySelector<HTMLButtonElement>('.dzg-zadd')!;
  const items = () => [...document.querySelectorAll<HTMLElement>('[role=menu] [role=menuitem]')].map((x) => x.textContent);
  const item = (id: string) => document.querySelector<HTMLElement>(`[role=menu] [data-id="${id}"]`);
  const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return { ...t, p, g, papi: () => p.api(t.g)!, gapi: () => g.api(t.g)!, zones, plus, items, item, key, open: (c: string) => menu.api(t.g)!.open(c) };
}

describe('the « Colonnes » band (pivot.md 19; group-drop-zone.md 18, 19)', () => {
  it('a second band under « Regrouper par », with its own texts and the pivot columns as chips, each band ending with « + »', () => {
    const t = zmake();
    const [rows, cols] = t.zones();
    expect([rows!.getAttribute('aria-label'), cols!.getAttribute('aria-label')]).toEqual(['Row grouping', 'Pivot columns']);
    expect(rows!.nextElementSibling).toBe(cols);
    expect(cols!.querySelector('.dzg-chip')!.textContent).toBe('Month');
    expect(cols!.querySelector('.dzg-chip-x')!.getAttribute('aria-label')).toBe('Remove Month from the columns');
    expect([t.plus(0).getAttribute('aria-label'), t.plus(1).getAttribute('aria-label'), t.plus(1).getAttribute('aria-haspopup')]).toEqual(['Add a column', 'Add a column', 'menu']);
  });

  it('« + » of the « Colonnes » band lists the columns it accepts, by name in the grid\'s order; Enter adds one, said, the focus back on « + »', () => {
    const t = zmake();
    t.plus(1).focus();
    t.plus(1).click();
    // Not Region (grouping the rows), not Month (in the band), never a created column.
    expect(t.items()).toEqual(['Title', 'Qty', 'Sold', 'Code', 'Amount']);
    const qty = t.item('qty')!;
    qty.focus();
    t.key(qty, 'Enter');
    expect(t.papi().by()).toEqual(['month', 'qty']);
    expect(t.said()).toContain('Spread across: Qty');
    expect(document.querySelector('[role=menu]')).toBeNull();
    expect(document.activeElement).toBe(t.plus(1));
  });

  it('Escape closes the list, the focus back on « + »; the « Regrouper par » band\'s list leaves out the pivot columns', () => {
    const t = zmake();
    t.plus(0).focus();
    t.plus(0).click();
    expect(t.items()).toEqual(['Title', 'Qty', 'Sold', 'Code', 'Amount']);
    t.key(document.querySelector('[role=menu] [role=menuitem]')!, 'Escape');
    expect(document.querySelector('[role=menu]')).toBeNull();
    expect(document.activeElement).toBe(t.plus(0));
  });

  it('× on a pivot chip removes it, said with the pivot\'s words; « + » is in the band\'s roving order', () => {
    const t = zmake();
    const cols = t.zones()[1]!;
    const x = cols.querySelector<HTMLElement>('.dzg-chip-x')!;
    x.click();
    expect(t.papi().by()).toEqual([]);
    expect(t.said()).toContain('Month removed from the columns');
    expect(t.zones()[1]!.textContent).toContain('Add a column here to spread it across');
    expect([...t.zones()[1]!.querySelectorAll<HTMLElement>('.dzg-chip, .dzg-chip-x, .dzg-zadd')].map((b) => b.tabIndex)).toEqual([0]);
  });
});

describe('the column menu in pivot mode (pivot.md 20)', () => {
  it('a created column: « Total » radios for its value, the function checked; another one changes every column of the value, said', () => {
    const t = zmake({ menu: true });
    t.open(JAN);
    expect([...document.querySelectorAll('[role=menu] [role=group]')].map((x) => x.getAttribute('aria-label'))).toContain('Total');
    expect(['fn.sum', 'fn.avg', 'fn.min', 'fn.max', 'fn.count'].map((id) => t.item(id)?.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    expect(t.item('group.by')).toBeNull();
    click(t.item('fn.avg')!);
    expect(t.papi().values()).toEqual({ amount: 'avg' });
    expect(t.said()).toContain('Amount: Average');
    expect(t.cell(SUD, JAN)!.textContent).toBe('3');
  });

  it('a row total (a value column under « Total ») has the same radios', () => {
    const t = zmake({ menu: true });
    t.open('amount');
    expect(t.item('fn.sum')!.getAttribute('aria-checked')).toBe('true');
  });

  it('pivot off: « Mettre en colonnes » on a data column, « Ne plus mettre en colonnes » on a pivot column', () => {
    const t = zmake({ menu: true });
    t.papi().setOn(false);
    t.open('qty');
    expect(t.item('pivot.by')!.textContent).toContain('Spread across columns');
    click(t.item('pivot.by')!);
    expect(t.papi().by()).toEqual(['month', 'qty']);
    expect(t.said()).toContain('Spread across: Qty');
    t.open('month');
    click(t.item('pivot.off')!);
    expect(t.papi().by()).toEqual(['qty']);
  });
});
