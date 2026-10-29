// Merged cells inside a tree (1.1.0, step 15; docs/behaviors/spans.md « In a tree », tree-keys.md, tree-sticky.md;
// owner Q15-1…Q15-5): the refusal lifted, siblings only, the tree column merging leaves only, a column span touching
// it refused, the toggle kept out of a merged label, keys on a merged leaf cell (left to right and right to left), the
// label sticking under the pinned parents, grouped headers in a treegrid, full-width rows still refused. Behaviour
// only (jsdom); the layout is checked in Chrome (`--only tree-spans`). Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { isSelected, type ColumnDef, type ColumnOrGroup, type Problem } from '@dzgrid/core';
import { BUNDLES, cleanup, k, tmake, type T, type TMake } from './support-tree.js';
import { spans } from '../src/spans.js';
import { SPANS_CSS } from '../src/spans/styles.js';
import { tree } from '../src/tree.js';
import { csvExport } from '../src/export.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { read } from './support-export.js';

afterEach(cleanup);

type L = T & { lab: string };
const problemsOf = (events: { type: string }[]) => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);

/**
 * A (root, closed) › a1, a2, a3 (leaves, one name); B, C (roots, leaves). Labels: A, B, C « Table »; a1–a3 « Line ».
 * Shown closed: A, B, C. Open: A, a1, a2, a3, B, C.
 */
const ROWS: L[] = [
  { id: 'A', parent: null, name: 'Same', n: 0, lab: 'Table' },
  { id: 'a1', parent: 'A', name: 'Line', n: 1, lab: 'Line' },
  { id: 'a2', parent: 'A', name: 'Line', n: 2, lab: 'Line' },
  { id: 'a3', parent: 'A', name: 'Line', n: 3, lab: 'Line' },
  { id: 'B', parent: null, name: 'Same', n: 4, lab: 'Table' },
  { id: 'C', parent: null, name: 'Same', n: 5, lab: 'Table' },
];
const COLS: ColumnOrGroup<T>[] = [
  { id: 'name', header: 'Name', width: 160, merge: true },
  { id: 'lab', header: 'Label', value: (r: T) => (r as L).lab, merge: true, width: 100 },
  { id: 'n', header: 'N', type: 'number', width: 100 },
];

function make(o: Partial<TMake> & { columns?: ColumnOrGroup<T>[]; spansFirst?: boolean } = {}) {
  const settings = { columns: (o.columns ?? COLS) as ColumnDef<T, any>[], ...o.settings };
  // spans() before tree() in the features, or after (the default puts tree() first).
  return o.spansFirst
    ? tmake({ rows: ROWS, ...o, tree: null, features: [spans(), tree<T>({ parentId: (r) => r.parent }), ...(o.features ?? [])], settings })
    : tmake({ rows: ROWS, ...o, features: [spans(), ...(o.features ?? [])], settings });
}

const span = (c: HTMLElement | null) => c?.getAttribute('aria-rowspan') ?? null;
const toggles = (c: HTMLElement | null) => c?.querySelectorAll('.dzg-toggle').length ?? -1;

describe('the refusal lifted', () => {
  it('no unsupported-combination for spans; the label column merges the roots A, B, C (closed)', () => {
    const t = make();
    expect(problemsOf(t.events).filter((p) => p.code === 'unsupported-combination')).toEqual([]);
    expect(t.vp.getAttribute('role')).toBe('treegrid');
    expect(span(t.cell('A', 'lab'))).toBe('3');
    // Covered places absent.
    expect([t.cell('B', 'lab'), t.cell('C', 'lab')]).toEqual([null, null]);
  });

  it('A open: A alone, a1–a3 merge, B–C merge; every row keeps its tree attributes', () => {
    const t = make();
    t.expand(['A']);
    expect(t.shown()).toEqual(['A', 'a1', 'a2', 'a3', 'B', 'C']);
    expect(['A', 'a1', 'B'].map((id) => span(t.cell(id, 'lab')))).toEqual([null, '3', '2']);
    expect(t.cell('a2', 'lab')).toBeNull();
    const attrs = (id: string) => ['aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded'].map((a) => t.row(id)!.getAttribute(a));
    expect(['A', 'a1', 'a2', 'a3', 'B', 'C'].map(attrs)).toEqual([
      ['1', '1', '3', 'true'], ['2', '1', '3', null], ['2', '2', '3', null], ['2', '3', '3', null], ['1', '2', '3', null], ['1', '3', '3', null],
    ]);
  });

  it('closing joins the roots again', () => {
    const t = make();
    t.expand(['A']);
    t.expand(['A'], false);
    expect(span(t.cell('A', 'lab'))).toBe('3');
  });
});

describe('the tree column: leaves only, the toggle kept', () => {
  it('a parent keeps its own cell and its toggle; the leaves merge; B and C (leaves) merge', () => {
    const t = make();
    t.expand(['A']);
    expect(['A', 'a1', 'B'].map((id) => span(t.cell(id)))).toEqual([null, '3', '2']);
    expect(t.toggle('A')!.hasAttribute('data-open')).toBe(true);
  });

  it('one toggle per tree-column cell, first, through five paints, both feature orders', () => {
    for (const spansFirst of [false, true]) {
      const t = make({ spansFirst, block: 120 });
      t.expand(['A']);
      for (let p = 0; p < 5; p++) t.scroll(p % 2 ? 0 : 1);
      for (const id of ['A', 'a1', 'B']) {
        const c = t.cell(id)!;
        expect([spansFirst, id, toggles(c), c.firstElementChild?.classList.contains('dzg-toggle')]).toEqual([spansFirst, id, 1, true]);
      }
      // The merged label keeps the text, after the toggle; the aria-rowspan as with tree() first.
      expect(t.cell('a1')!.querySelector('.dzg-span-label')?.textContent).toBe('Line');
      expect(span(t.cell('a1'))).toBe('3');
      cleanup();
    }
  });

  it('a column span starting on or covering the tree column is refused (invalid-span, tree), drawn unmerged', () => {
    const t = make({ columns: [{ id: 'name', header: 'Name', width: 160, colSpan: () => 2 }, { id: 'n', header: 'N', type: 'number', width: 100 }] });
    expect(t.cell('A')!.getAttribute('aria-colspan')).toBeNull();
    expect(t.cell('A', 'n')).not.toBeNull();
    expect(problemsOf(t.events)).toContainEqual(expect.objectContaining({ code: 'invalid-span', path: 'rows[0].name.colSpan', detail: 'tree' }));
  });

  it('a column span after the tree column is kept', () => {
    const t = make({ columns: [{ id: 'name', header: 'Name', width: 160 }, { id: 'n', header: 'N', type: 'number', width: 100, colSpan: () => 2 }, { id: 'x', header: 'X', value: () => 1, width: 50 }] });
    expect(t.cell('A', 'n')!.getAttribute('aria-colspan')).toBe('2');
  });
});

describe('keys on a merged leaf cell', () => {
  for (const lang of ['en', 'ar'] as const) {
    const back = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    it(`${lang}: back (${back}) goes to the parent from any covered sibling; Down steps over the cell`, () => {
      const t = make({ lang });
      t.expand(['A']);
      t.focus('A');
      t.press('ArrowDown');
      expect(t.where()).toBe('a1/name');
      t.press('ArrowDown');
      expect(t.where()).toBe('B/name');
      t.press('ArrowUp');
      expect(t.where()).toBe('a1/name');
      t.press(back);
      expect(t.where()).toBe('A/name');
      expect(t.shown()).toEqual(['A', 'a1', 'a2', 'a3', 'B', 'C']);
    });
  }

  it('`*` on a merged leaf cell opens its closed siblings with children', () => {
    // a3 holds a31: a1 and a2 (leaves) merge; a3 is a parent, alone.
    const t = make({ rows: [...ROWS, { id: 'a31', parent: 'a3', name: 'Sub', n: 9, lab: 'Sub' }] });
    t.expand(['A']);
    expect(span(t.cell('a1'))).toBe('2');
    t.focus('a1');
    t.press('*');
    expect(t.shown()).toEqual(['A', 'a1', 'a2', 'a3', 'a31', 'B', 'C']);
  });

  it('folding the parent of a focused merged cell moves the focus to the parent', () => {
    const t = make();
    t.expand(['A']);
    t.focus('a2');
    expect(t.where()).toBe('a1/name');
    t.expand(['A'], false, 'user');
    expect(t.where()).toBe('A/name');
  });
});

describe('the pointer', () => {
  it('a click on a covered row of a merged cell selects that row', () => {
    const t = make({ settings: { selection: { mode: 'multi', click: true } } });
    t.expand(['A']);
    const c = t.cell('a1', 'lab')!;
    const H = t.ctx.rowHeight();
    c.getBoundingClientRect = () => ({ top: 100, bottom: 100 + 3 * H, left: 0, right: 100, width: 100, height: 3 * H, x: 0, y: 100, toJSON() {} }) as DOMRect;
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientY: 100 + 2 * H + 5 }));
    expect(isSelected(t.g.kernel.selection, k('a3'))).toBe(true);
    expect(isSelected(t.g.kernel.selection, k('a1'))).toBe(false);
  });
});

describe('the travelling label under the pinned parents', () => {
  it('its sticky top adds the copies\' height (--dzg-inset), written by the tree from its stack', () => {
    expect(SPANS_CSS).toContain('var(--dzg-inset');
    const many: L[] = [ROWS[0]!, ...Array.from({ length: 40 }, (_, i): L => ({ id: `x${i}`, parent: 'A', name: 'Line', n: i, lab: 'Line' })), ROWS[4]!];
    const t = make({ rows: many });
    t.expand(['A']);
    expect(t.ctx.el.root.style.getPropertyValue('--dzg-inset')).toBe('0px');
    t.scroll(10 * t.ctx.rowHeight());
    expect(t.ctx.inset).toBe(t.ctx.rowHeight());
    expect(t.ctx.el.root.style.getPropertyValue('--dzg-inset')).toBe(`${t.ctx.rowHeight()}px`);
    const root = t.ctx.el.root;
    t.g.destroy();
    expect(root.style.getPropertyValue('--dzg-inset')).toBe('');
  });

  it('pinned copies stay text only, unmerged', () => {
    const many: L[] = [ROWS[0]!, ...Array.from({ length: 40 }, (_, i): L => ({ id: `x${i}`, parent: 'A', name: 'Line', n: i, lab: 'Line' })), ROWS[4]!];
    const t = make({ rows: many });
    t.expand(['A']);
    t.scroll(10 * t.ctx.rowHeight());
    const copies = [...t.host.querySelectorAll<HTMLElement>('.dzg-sticky .dzg-cell')];
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.some((c) => c.hasAttribute('aria-rowspan') || c.querySelector('.dzg-span-label'))).toBe(false);
  });
});

describe('grouped headers in a treegrid (Q15-4)', () => {
  it('the group row is drawn, counted in aria-rowcount', () => {
    const t = make({ columns: [{ id: 'name', header: 'Name', width: 160 }, { id: 'grp', header: 'Numbers', children: [{ id: 'n', header: 'N', type: 'number', width: 100 }, { id: 'lab', header: 'Label', value: (r: T) => (r as L).lab, width: 100 }] }] });
    expect(t.vp.getAttribute('role')).toBe('treegrid');
    expect(t.host.querySelector('.dzg-hgroup')?.textContent).toContain('Numbers');
    // 3 rows shown + the group row + the column headers.
    expect(t.vp.getAttribute('aria-rowcount')).toBe('5');
  });
});

describe('full-width rows stay refused beside a tree (Q15-5)', () => {
  it('one unsupported-combination (settings.fullWidth, tree), no row full width', () => {
    const t = make({ settings: { fullWidth: () => true } as never });
    const told = problemsOf(t.events).filter((p) => p.code === 'unsupported-combination');
    expect(told).toEqual([{ code: 'unsupported-combination', severity: 'warning', path: 'settings.fullWidth', detail: 'tree' }]);
    expect(t.host.querySelector('[data-full]')).toBeNull();
    t.expand(['A']);
    expect(problemsOf(t.events).filter((p) => p.code === 'unsupported-combination')).toHaveLength(1);
  });
});


describe('export over a tree (A-D10)', () => {
  it('the map of the rows written follows the tree rules: a column span over the tree column is refused there too (each row writes its own values)', async () => {
    const got: { blob?: Blob }[] = [];
    const f = csvExport({ canExport: true, deliver: (d) => void got.push(d), loadRun: () => import('../src/export/run/index.js') });
    const messages = { locale: 'en', text: { ...BUNDLES.en.text, ...EN_EXPORT.text } };
    const t = make({ columns: [{ id: 'name', header: 'Name', width: 160, colSpan: () => 2 }, { id: 'n', header: 'N', type: 'number', width: 60 }], features: [f], settings: { messages } as never });
    expect(t.cell('A')!.getAttribute('aria-colspan')).toBeNull();
    expect(await f.run()).toBe('done');
    expect((await read(got[0]!.blob!)).text).toBe('Level,Name,N\r\n1,Same,0\r\n1,Same,4\r\n1,Same,5\r\n');
  });
});
