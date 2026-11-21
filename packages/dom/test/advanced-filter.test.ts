// The advanced filter's builder (docs/behaviors/advanced-filter.md 9–17): a modal dialog beside filters(), groups and
// conditions with the popup's own forms, a draft applied in one filter.set, keys, names, announcements, texts, right
// to left. Expectations written by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { advancedOf, makeQuery, type ColumnOrGroup, type FilterExpression } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { advancedFilter, ADVANCED_FILTER_KEYS, type AdvancedFilterFeature } from '../src/advanced-filter.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { EN_ADVANCED_FILTER } from '../src/locales/en-advanced-filter.js';
import { FR_ADVANCED_FILTER } from '../src/locales/fr-advanced-filter.js';
import { AR_ADVANCED_FILTER } from '../src/locales/ar-advanced-filter.js';
import type { GridMessages } from '../src/messages.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);

const join = (...b: { readonly locale: string; readonly text: object }[]): GridMessages => ({ locale: b[0]!.locale, text: Object.assign({}, ...b.map((x) => x.text)) });
const MSG = join(EN, EN_FILTERS, EN_ADVANCED_FILTER);
type RS = R & { s?: string };
const STATUS = ['Error', 'Warning', 'OK'];
/** 30 rows: name ann0 / bob1 / bob2 …, n = 0…29, s cycling Error, Warning, OK. */
const ROWS: RS[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: i % 3 ? `bob${i}` : `ann${i}`, n: i, s: STATUS[i % 3]! }));
const COLS: ColumnOrGroup<RS>[] = [
  { id: 'name', header: 'Name' },
  { id: 'n', header: 'Number', type: 'number' },
  { id: 's', header: 'Status', type: 'enum', enumOptions: STATUS.map((v) => ({ value: v, label: v })) },
  { id: 'x', header: 'Nope', filter: false },
];

function builder(o: { withFilters?: boolean; messages?: GridMessages; dir?: 'rtl' } = {}) {
  vi.useFakeTimers();
  const a: AdvancedFilterFeature = advancedFilter();
  const t = make({
    columns: COLS as never, // the support's row type has no `s`
    rows: ROWS,
    features: [...(o.withFilters === false ? [] : [filters()]), a],
    settings: { messages: o.messages ?? MSG, ...(o.dir && { direction: o.dir }) },
  });
  const k = t.g.kernel;
  const btn = document.createElement('button');
  btn.textContent = 'Advanced';
  document.body.append(btn);
  const api = () => a.api(t.g)!;
  const dlg = () => document.querySelector<HTMLElement>('.dzg-adv-pop');
  const conds = () => [...dlg()!.querySelectorAll<HTMLElement>('.dzg-adv-c')];
  const groups = () => [...dlg()!.querySelectorAll<HTMLElement>('.dzg-adv-g')];
  const sel = (i: number) => conds()[i]!.querySelector<HTMLSelectElement>('.dzg-adv-col select')!;
  const pick = (i: number, col: string) => {
    sel(i).value = col;
    sel(i).dispatchEvent(new Event('change', { bubbles: true }));
  };
  const fill = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
    el.value = v;
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  const op = (i: number) => conds()[i]!.querySelector<HTMLSelectElement>('select.dzg-fop')!;
  const val = (i: number) => conds()[i]!.querySelector<HTMLInputElement>('input.dzg-fval')!;
  const click = (el: Element | null | undefined) => (el as HTMLElement).click();
  const button = (text: string, scope: Element = dlg()!) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
  const shown = () => Array.from({ length: k.rows.displayed.count }, (_, i) => (k.rows.displayed.nodeAt(k.rows.displayed.index(i)!) as { id: string }).id);
  const said = () => t.live.said;
  return { ...t, a, k, btn, api, dlg, conds, groups, sel, pick, fill, op, val, click, button, shown, said };
}

const EXAMPLE: FilterExpression = {
  join: 'and',
  items: [
    { join: 'or', items: [{ column: 'name', filter: { type: 'text', op: 'startsWith', value: 'ann' } }, { column: 'n', filter: { type: 'number', op: 'lt', value: 3 } }] },
    { column: 'n', filter: { type: 'number', op: 'gte', value: 1 } },
  ],
};

describe('opt-in, the api (advanced-filter.md 9)', () => {
  it('without filters(): nothing opens, one missing-feature warning; get and set still work', () => {
    const t = builder({ withFilters: false });
    expect(t.api().open()).toBe(false);
    expect(t.dlg()).toBeNull();
    expect(t.problems().filter((p) => p.code === 'missing-feature' && p.path === 'features.advancedFilter')).toHaveLength(1);
    expect(t.api().set(EXAMPLE)).toBe(true);
    expect(t.api().get()).toEqual(EXAMPLE);
    expect(t.shown()).toEqual(['r1', 'r2', 'r3', 'r6', 'r9', 'r12', 'r15', 'r18', 'r21', 'r24', 'r27']);
  });

  it('set(null) removes it, the column filters kept; « clear all » removes it too', () => {
    const t = builder();
    t.k.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'lt', value: 10 } }, 'api');
    t.api().set(EXAMPLE);
    expect(Object.keys(t.k.query.filter).sort()).toEqual(['', 'n']);
    t.api().set(null);
    expect(Object.keys(t.k.query.filter)).toEqual(['n']);
    t.api().set(EXAMPLE);
    t.k.dispatch({ type: 'query.set', query: makeQuery({}) }, 'user');
    expect(t.api().get()).toBeNull();
  });

  it('bind(): the button says it opens a dialog and whether it is open; a click toggles it', () => {
    const t = builder();
    const off = t.api().bind(t.btn);
    expect([t.btn.getAttribute('aria-haspopup'), t.btn.getAttribute('aria-expanded')]).toEqual(['dialog', 'false']);
    t.click(t.btn);
    expect(t.dlg()).not.toBeNull();
    expect(t.btn.getAttribute('aria-expanded')).toBe('true');
    expect(t.api().isOpen).toBe(true);
    t.click(t.btn);
    expect(t.dlg()).toBeNull();
    expect(t.btn.getAttribute('aria-expanded')).toBe('false');
    off();
    t.click(t.btn);
    expect(t.dlg()).toBeNull();
  });
});

describe('the dialog (advanced-filter.md 10–13)', () => {
  it('a modal dialog named by its title, one empty condition in an AND group, the focus on its column', () => {
    const t = builder();
    t.api().bind(t.btn);
    t.click(t.btn);
    const d = t.dlg()!;
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)!.textContent).toBe('Advanced filter');
    expect(t.groups().map((g) => g.getAttribute('aria-label'))).toEqual(['Group: all (AND)']);
    const rg = t.groups()[0]!.querySelector('[role=radiogroup]')!;
    expect(rg.getAttribute('aria-label')).toBe('Keep the rows matching');
    expect([...rg.querySelectorAll('label')].map((l) => l.textContent)).toEqual(['All (AND)', 'Any (OR)']);
    expect(t.conds().map((c) => [c.getAttribute('role'), c.getAttribute('aria-label')])).toEqual([['group', 'Condition 1']]);
    expect(document.activeElement).toBe(t.sel(0));
    // Filterable columns with a form, by their header; « Nope » (filter: false) is not offered.
    expect([...t.sel(0).options].map((o) => o.textContent)).toEqual(['Choose a column', 'Name', 'Number', 'Status']);
    expect(t.conds()[0]!.querySelector<HTMLElement>('.dzg-adv-form')!.hidden).toBe(true);
    expect([...d.querySelectorAll('.dzg-adv-foot button')].map((b) => b.textContent)).toEqual(['Clear', 'Cancel', 'Apply']);
  });

  it('builds (name starts with ann OR n < 3) AND n >= 1 by gestures and applies it in one filter.set', () => {
    const t = builder();
    t.api().open();
    t.pick(0, 'n');
    t.fill(t.op(0), 'gte');
    t.fill(t.val(0), '1');
    t.click(t.button('+ Group'));
    expect(t.said()).toBe('Group added');
    expect(document.activeElement).toBe(t.sel(1));
    t.pick(1, 'name');
    t.fill(t.op(1), 'startsWith');
    t.fill(t.val(1), 'ann');
    const inner = t.groups()[1]!;
    t.click(inner.querySelectorAll<HTMLInputElement>('[role=radiogroup] input')[1]!);
    expect(inner.getAttribute('aria-label')).toBe('Group: any (OR)');
    t.click(t.button('+ Condition', inner.querySelector('.dzg-adv-acts')!));
    expect(t.said()).toBe('Condition added');
    expect(document.activeElement).toBe(t.sel(2));
    t.pick(2, 'n');
    t.fill(t.op(2), 'lt');
    t.fill(t.val(2), '3');
    expect(t.conds().map((c) => c.getAttribute('aria-label'))).toEqual(['Condition 1', 'Condition 2', 'Condition 3']);
    const seen: unknown[] = [];
    t.k.subscribe((e) => void (e.type === 'filterChanged' && seen.push(e.filter)));
    expect(t.api().get()).toBeNull();
    t.click(t.button('Apply'));
    expect(t.dlg()).toBeNull();
    expect(seen).toHaveLength(1);
    expect(t.api().get()).toEqual({ join: 'and', items: [{ column: 'n', filter: { type: 'number', op: 'gte', value: 1 } }, EXAMPLE.items[0]] });
    expect(t.shown()).toEqual(['r1', 'r2', 'r3', 'r6', 'r9', 'r12', 'r15', 'r18', 'r21', 'r24', 'r27']);
  });

  it('Enter in a value field applies the draft', () => {
    const t = builder();
    t.api().open();
    t.pick(0, 'name');
    t.fill(t.val(0), 'bob1');
    t.val(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(t.dlg()).toBeNull();
    expect(t.api().get()).toEqual({ join: 'and', items: [{ column: 'name', filter: { type: 'text', op: 'contains', value: 'bob1' } }] });
  });

  it('Cancel, Escape drop the draft; the focus goes back to the button', () => {
    const t = builder();
    t.api().set(EXAMPLE);
    t.api().bind(t.btn);
    for (const how of ['cancel', 'escape']) {
      t.click(t.btn);
      t.pick(0, 'name');
      t.click(t.button('Remove the condition'));
      if (how === 'cancel') t.click(t.button('Cancel'));
      else t.dlg()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(t.dlg()).toBeNull();
      expect(t.api().get()).toEqual(EXAMPLE);
      expect(document.activeElement).toBe(t.btn);
    }
  });

  it('reopening shows the expression in force, each condition in its form, the focus on the first column (nested)', () => {
    const t = builder();
    t.api().set(EXAMPLE);
    t.api().open();
    expect(document.activeElement).toBe(t.sel(0));
    expect(t.groups().map((g) => g.getAttribute('aria-label'))).toEqual(['Group: all (AND)', 'Group: any (OR)']);
    expect(t.conds().map((_, i) => [t.sel(i).value, t.op(i).value, t.val(i).value])).toEqual([['name', 'startsWith', 'ann'], ['n', 'lt', '3'], ['n', 'gte', '1']]);
    // Applied untouched: the same expression.
    t.click(t.button('Apply'));
    expect(t.api().get()).toEqual(EXAMPLE);
  });

  it('removing: said, the focus on the item before, else the next, else « + Condition »; an empty group is left out', () => {
    const t = builder();
    t.api().set(EXAMPLE);
    t.api().open();
    const rm = (i: number) => t.click(t.conds()[i]!.querySelector('.dzg-adv-rm'));
    rm(1);
    expect(t.said()).toBe('Removed');
    expect(document.activeElement).toBe(t.sel(0));
    rm(0);
    // The inner group is empty: the focus on its « + Condition ».
    expect(document.activeElement).toBe(t.groups()[1]!.querySelector('.dzg-adv-add'));
    t.click(t.button('Apply'));
    expect(t.api().get()).toEqual({ join: 'and', items: [EXAMPLE.items[1]] });
    t.api().open();
    expect(t.groups()).toHaveLength(1);
    t.click(t.conds()[0]!.querySelector('.dzg-adv-rm'));
    expect(document.activeElement).toBe(t.groups()[0]!.querySelector('.dzg-adv-add'));
    t.click(t.button('Apply'));
    expect(t.api().get()).toBeNull();
    expect(t.k.query.filter).toEqual({});
  });

  it('a condition without a column or a value is left out; a number that does not read keeps the dialog, focused', () => {
    const t = builder();
    t.api().open();
    t.click(t.button('+ Condition'));
    t.pick(1, 'n');
    t.fill(t.val(1), '12abc');
    vi.runAllTimers();
    t.click(t.button('Apply'));
    expect(t.dlg()).not.toBeNull();
    expect(document.activeElement).toBe(t.val(1));
    expect(t.val(1).getAttribute('aria-invalid')).toBe('true');
    t.fill(t.val(1), '');
    vi.runAllTimers();
    t.click(t.button('Apply'));
    expect(t.dlg()).toBeNull();
    expect(t.api().get()).toBeNull();
  });

  it('choosing another column empties the condition; Clear empties the draft (applied only by Apply)', () => {
    const t = builder();
    t.api().set(EXAMPLE);
    t.api().open();
    t.pick(0, 'n');
    expect(t.val(0).value).toBe('');
    t.click(t.button('Clear'));
    expect(t.conds()).toHaveLength(1);
    expect(t.sel(0).value).toBe('');
    expect(document.activeElement).toBe(t.sel(0));
    expect(t.api().get()).toEqual(EXAMPLE);
  });

  it('an enum column takes the value list (kind set)', () => {
    const t = builder();
    t.api().open();
    t.pick(0, 's');
    const form = t.conds()[0]!.querySelector<HTMLElement>('.dzg-adv-form')!;
    expect([form.hidden, form.dataset['kind']]).toEqual([false, 'set']);
  });

  it('Alt+ArrowDown / Alt+ArrowUp on a column list go to the next / previous condition', () => {
    const t = builder();
    t.api().set(EXAMPLE);
    t.api().open();
    const key = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
    t.sel(0).focus();
    key(t.sel(0), 'ArrowDown');
    expect(document.activeElement).toBe(t.sel(1));
    key(t.sel(1), 'ArrowDown');
    expect(document.activeElement).toBe(t.sel(2));
    key(t.sel(2), 'ArrowUp');
    expect(document.activeElement).toBe(t.sel(1));
  });

  it('groups stop at the 5th level: no « + Group » there; « Remove the group » takes it whole', () => {
    const t = builder();
    t.api().open();
    for (let i = 0; i < 4; i++) t.click(t.groups().at(-1)!.querySelector('.dzg-adv-addg'));
    expect(t.groups().map((g) => g.dataset['level'])).toEqual(['1', '2', '3', '4', '5']);
    expect(t.groups().at(-1)!.querySelector('.dzg-adv-addg')).toBeNull();
    expect(t.conds()).toHaveLength(5);
    t.click(t.groups()[1]!.querySelector(':scope > .dzg-adv-acts > .dzg-adv-rmg'));
    expect(t.groups()).toHaveLength(1);
    expect(t.conds()).toHaveLength(1);
    expect(document.activeElement).toBe(t.sel(0));
  });
});

describe('texts and direction (advanced-filter.md 17)', () => {
  it('French; Arabic right to left; every key in the three bundles', () => {
    const fr = builder({ messages: join(FR, FR_FILTERS, FR_ADVANCED_FILTER) });
    fr.api().open();
    expect(fr.groups()[0]!.getAttribute('aria-label')).toBe('Groupe\u202F: tous (ET)');
    expect(fr.button('Appliquer')).toBeTruthy();
    cleanup();
    const ar = builder({ messages: join(AR, AR_FILTERS, AR_ADVANCED_FILTER), dir: 'rtl' });
    ar.api().open();
    expect(ar.dlg()!.dir).toBe('rtl');
    expect(ar.conds()[0]!.getAttribute('aria-label')).toBe('الشرط 1');
    for (const b of [EN_ADVANCED_FILTER, FR_ADVANCED_FILTER, AR_ADVANCED_FILTER]) expect(Object.keys(b.text).sort()).toEqual([...ADVANCED_FILTER_KEYS].sort());
  });

  it('a missing text stops the setup, naming the keys, as for every feature', () => {
    const { 'adv.removed': _, ...rest } = EN_ADVANCED_FILTER.text;
    expect(() => builder({ messages: { locale: 'en', text: { ...EN.text, ...EN_FILTERS.text, ...rest } } as GridMessages })).toThrow(/advanced-filter: missing adv\.removed$/);
  });
});

describe('the model behind (advanced-filter.md 3, 7)', () => {
  it('the value list of a condition ignores the expression in force', () => {
    const t = builder();
    t.api().set({ column: 'name', filter: { type: 'text', op: 'equals', value: 'ann0' } });
    expect(t.shown()).toEqual(['r0']);
    const h = t.k.values('s');
    expect(h.result!.values.map((v) => v.value).sort()).toEqual(['Error', 'OK', 'Warning']);
    h.close();
    expect(advancedOf(t.k.query.filter)).not.toBeNull();
  });
});
