// `rowGaps({ before, size })` (1.1.0, step 15; docs/behaviors/row-gaps.md; owner Q15-6…Q15-8): an empty space above some
// rows, outside every row — the base's one seam in `rowLayout()`, `data-gap` / `--dzg-gap` on the row under a gap,
// never above the first row, scaled with the text, kept by sort, filter and folding, cutting merges, refused beside
// details, the problems. Behaviour and the layout's numbers only (jsdom); the pixels are checked in Chrome
// (`--only row-gaps`). Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, Problem } from '@dzgrid/core';
import { BUNDLES, cleanup, k, SMALL, tmake, type T, type TMake } from './support-tree.js';
import { rowGaps, roots } from '../src/row-gaps.js';
import { spans } from '../src/spans.js';
import { autoHeight } from '../src/auto-height.js';
import { detail } from '../src/detail.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { EN_PINNED } from '../src/locales/en-pinned.js';
import { pinnedRows } from '../src/pinned-rows.js';
import { csvExport } from '../src/export.js';
import { measureStub } from './support-auto-height.js';
import { read, xmake } from './support-export.js';

afterEach(cleanup);

const problemsOf = (events: { type: string }[]) => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);
/** S0 and S1 always open (step 14): shown S0, P1, P2, S1, P3, S2 (P1 closed). */
const top = (r: T) => r.id === 'S0' || r.id === 'S1';

function make(o: Partial<TMake> & { gaps?: Parameters<typeof rowGaps<T>>[0] | null } = {}) {
  const g = o.gaps === null ? [] : [rowGaps<T>(o.gaps ?? { before: roots })];
  return tmake({ tree: { fixedOpen: top }, ...o, features: [...(o.features ?? []), ...g] });
}
/** A row's box top in the body: the layer's place plus the row's own. */
const topOf = (t: ReturnType<typeof make>, id: string) => parseFloat(t.ctx.el.layer.style.insetBlockStart || '0') + parseFloat(t.row(id)!.style.insetBlockStart);

describe('where the gaps are', () => {
  it('before each root but the first: the boxes after them, heights unchanged, the body taller', () => {
    const t = make();
    const H = t.ctx.rowHeight();
    expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'P3', 'S2']);
    expect(['S0', 'P1', 'P2', 'S1', 'P3', 'S2'].map((id) => topOf(t, id))).toEqual([0, H, 2 * H, 3 * H + 16, 4 * H + 16, 5 * H + 32]);
    expect(t.ctx.layout!.total).toBe(6 * H + 32);
    expect(t.row('S1')!.style.blockSize).toBe(`${H}px`);
    expect(t.ctx.el.body.style.blockSize).toBe(`${6 * H + 32}px`);
  });

  it('data-gap and --dzg-gap on the row under a gap only; no element added; aria-rowcount unchanged', () => {
    const t = make();
    const marked = ['S0', 'P1', 'P2', 'S1', 'P3', 'S2'].filter((id) => t.row(id)!.hasAttribute('data-gap'));
    expect(marked).toEqual(['S1', 'S2']);
    expect(t.row('S1')!.style.getPropertyValue('--dzg-gap')).toBe('16px');
    expect(t.row('P1')!.style.getPropertyValue('--dzg-gap')).toBe('');
    expect(t.ctx.el.layer.children.length).toBe(6);
    expect(t.vp.getAttribute('aria-rowcount')).toBe('7');
    expect(t.row('S1')!.getAttribute('aria-rowindex')).toBe('5');
  });

  it('never above the first row: a rule true everywhere gives gaps from the second row on', () => {
    const t = make({ gaps: { before: () => true, size: 10 } });
    const H = t.ctx.rowHeight();
    expect(topOf(t, 'S0')).toBe(0);
    expect(t.row('S0')!.hasAttribute('data-gap')).toBe(false);
    expect(topOf(t, 'P1')).toBe(H + 10);
    expect(t.ctx.layout!.total).toBe(6 * H + 50);
  });

  it('a number is that many pixels for that row (at the default text size)', () => {
    const t = make({ gaps: { before: (c) => (c.row?.id === 'S2' ? 40 : roots(c)) } });
    const H = t.ctx.rowHeight();
    expect(topOf(t, 'S2')).toBe(5 * H + 56);
    expect(t.row('S2')!.style.getPropertyValue('--dzg-gap')).toBe('40px');
  });

  it('scaled with the text: 32 px text doubles the gap (the rows grow too)', () => {
    const t = make();
    (t.box as { remPx?: number }).remPx = 32;
    t.scroll(0);
    t.scroll(1);
    t.scroll(0);
    const H = t.ctx.rowHeight();
    expect(t.ctx.remPx).toBe(32);
    expect(topOf(t, 'S1')).toBe(3 * H + 32);
    expect(t.row('S1')!.style.getPropertyValue('--dzg-gap')).toBe('32px');
  });

  it('right to left: the same offsets', () => {
    const t = make({ lang: 'ar' });
    const H = t.ctx.rowHeight();
    expect(['S1', 'S2'].map((id) => topOf(t, id))).toEqual([3 * H + 16, 5 * H + 32]);
  });
});

describe('the gaps follow the rows, by rule', () => {
  it('a sort moves the gaps with the roots; a filter too; folding keeps a root\'s gap', () => {
    const t = make({ tree: { fixedOpen: (r) => r.id === 'S0' } });
    const H = t.ctx.rowHeight();
    // S0 open (fixed), S1 closed: S0, P1, P2, S1, S2.
    expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'S2']);
    expect(['S1', 'S2'].map((id) => topOf(t, id))).toEqual([3 * H + 16, 4 * H + 32]);
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] } as never, 'user');
    expect(t.shown()).toEqual(['S2', 'S1', 'S0', 'P2', 'P1']);
    expect(['S2', 'S1', 'S0'].map((id) => [id, topOf(t, id), t.row(id)!.hasAttribute('data-gap')])).toEqual([['S2', 0, false], ['S1', H + 16, true], ['S0', 2 * H + 32, true]]);
    t.expand(['S1']);
    expect(t.shown()).toEqual(['S2', 'S1', 'P3', 'S0', 'P2', 'P1']);
    expect(topOf(t, 'S0')).toBe(3 * H + 32);
    t.expand(['S1'], false);
    expect(topOf(t, 'S1')).toBe(H + 16);
  });

  it('Down from the row above a gap lands on the row under it', () => {
    const t = make();
    t.focus('P2');
    t.press('ArrowDown');
    expect(t.where()).toBe('S1/name');
  });

  it('without a tree, on a flat grid: a rule on the data', () => {
    const t = make({ tree: null, gaps: { before: (c) => c.row!.n === 5 } });
    const H = t.ctx.rowHeight();
    expect(t.shown()).toEqual(SMALL.map((r) => r.id));
    expect(topOf(t, 'S1')).toBe(5 * H + 16);
  });
});

describe('with other features', () => {
  it('auto height before or after rowGaps: P3 measured tall (150 px) and S1, S2 gapped, by hand, both orders', () => {
    // The note column wraps; P3's note is 150 characters: the stub gives 7 lines × 20 + 9 = 149, + 0.4, read as 150.
    const cols: ColumnDef<T, any>[] = [
      { id: 'name', header: 'Name', width: 160 },
      { id: 'note', header: 'Note', width: 200, wrap: true, value: (r: T) => (r.id === 'P3' ? 'word '.repeat(30) : 'short') },
    ];
    for (const first of [true, false]) {
      measureStub();
      const g = rowGaps<T>({ before: roots });
      const t = tmake({ tree: { fixedOpen: top }, settings: { columns: cols }, features: first ? [autoHeight(), g] : [g, autoHeight()] });
      const H = t.ctx.rowHeight();
      expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'P3', 'S2']);
      const L = t.ctx.layout!;
      const at = (id: string) => t.g.kernel.rows.displayed.indexOf(k(id)) as never;
      expect([first, L.heightOf(at('P3')), L.offsetOf(at('S1')), L.offsetOf(at('P3')), L.offsetOf(at('S2')), L.total]).toEqual([first, 150, 3 * H + 16, 4 * H + 16, 4 * H + 150 + 32, 5 * H + 150 + 32]);
      cleanup();
    }
  });

  it('export, spans « first »: a gap cuts the merged run there too (row-gaps.md B-D5)', async () => {
    const got: { blob?: Blob }[] = [];
    const f = csvExport({ canExport: true, spans: 'first', deliver: (d) => void got.push(d), loadRun: () => import('../src/export/run/index.js') });
    const t = xmake({ rows: [0, 1, 2, 3, 4].map((i) => ({ id: `r${i}`, name: 'same', n: i })), columns: [{ id: 'name', header: 'Name', merge: true }, { id: 'n', header: 'N', type: 'number' }], features: [spans(), rowGaps({ before: (c) => c.index === 3 }), f] });
    expect([...t.host.querySelectorAll('.dzg-layer [aria-rowspan]')].map((c) => c.getAttribute('aria-rowspan'))).toEqual(['3', '2']);
    expect(await f.run()).toBe('done');
    expect((await read(got[0]!.blob!)).text).toBe('Name,N\r\nsame,0\r\n,1\r\n,2\r\nsame,3\r\n,4\r\n');
  });

  it('a merged run is cut by a gap (B-D5)', () => {
    const cols: ColumnDef<T, any>[] = [{ id: 'name', header: 'Name', width: 160 }, { id: 'g', header: 'G', value: () => 'same', merge: true, width: 100 }];
    const t = make({ tree: null, features: [spans()], gaps: { before: (c) => c.index === 3 }, settings: { columns: cols } });
    expect([...t.host.querySelectorAll('.dzg-layer .dzg-cell[aria-rowspan]')].map((c) => c.getAttribute('aria-rowspan'))).toEqual(['3', '5']);
  });

  it('beside master/detail: refused (unsupported-combination, rowGaps, detail), no gap', () => {
    const messages = { locale: 'en', text: { ...BUNDLES.en.text, ...EN_DETAIL.text } };
    const t = make({ tree: null, features: [detail<T>({ part: { mount: () => ({}) } } as never)], settings: { messages } as never });
    expect(problemsOf(t.events)).toContainEqual({ code: 'unsupported-combination', severity: 'warning', path: 'rowGaps', detail: 'detail' });
    expect(t.host.querySelector('[data-gap]')).toBeNull();
  });

  it('pinned rows: never a gap in the bands', () => {
    const messages = { locale: 'en', text: { ...BUNDLES.en.text, ...EN_PINNED.text } };
    const t = make({ tree: null, gaps: { before: () => true }, features: [pinnedRows<T>({ top: [{ ...SMALL[0]!, id: 'X' }], bottom: [{ ...SMALL[1]!, id: 'Y' }, { ...SMALL[2]!, id: 'Z' }] })], settings: { messages } as never });
    // Body rows gapped from the second on; the band rows never.
    const band = [...t.host.querySelectorAll<HTMLElement>('.dzg-row')].filter((r) => r.parentElement !== t.ctx.el.layer);
    expect(band.length).toBe(3);
    expect(band.some((r) => r.hasAttribute('data-gap'))).toBe(false);
    // The body's rows from the second on are gapped (as many as are mounted).
    const body = [...t.ctx.el.layer.querySelectorAll<HTMLElement>(':scope > .dzg-row')];
    expect(body.filter((r) => !r.hasAttribute('data-gap')).map((r) => t.ctx.rowRenderer.keyOf(r))).toEqual([t.ctx.rows.displayed.keyAt(0 as never)]);
  });
});

describe('problems (never the row data)', () => {
  it('before not a function: invalid-setting, no gap', () => {
    const t = make({ gaps: { before: 'roots' as never } });
    expect(problemsOf(t.events)).toContainEqual({ code: 'invalid-setting', severity: 'warning', path: 'rowGaps.before' });
    expect(t.host.querySelector('[data-gap]')).toBeNull();
  });

  it('size not a non-negative finite number: invalid-setting, 16', () => {
    const t = make({ gaps: { before: roots, size: -3 } });
    expect(problemsOf(t.events)).toContainEqual({ code: 'invalid-setting', severity: 'warning', path: 'rowGaps.size' });
    expect(t.row('S1')!.style.getPropertyValue('--dzg-gap')).toBe('16px');
  });

  it('a rule that throws or answers no size: no gap there, told once per kind across paints', () => {
    const t = make({ gaps: { before: (c) => { if (c.row?.id === 'S1') throw new Error('secret'); return c.row?.id === 'S2' ? -1 : false; } } });
    t.expand(['P1']);
    t.expand(['P1'], false);
    const told = problemsOf(t.events).filter((p) => p.code === 'invalid-gap');
    expect(told).toEqual([
      { code: 'invalid-gap', severity: 'warning', path: 'rowGaps.before', detail: 'threw' },
      { code: 'invalid-gap', severity: 'warning', path: 'rowGaps.before', detail: 'not a size' },
    ]);
    expect(t.host.querySelector('[data-gap]')).toBeNull();
    expect(JSON.stringify(told)).not.toContain('secret');
  });
});

describe('destroy', () => {
  it('the grid lays out without gaps once the feature is gone', () => {
    const t = make();
    t.g.destroy();
    expect(t.ctx.gapsFor).toBeUndefined();
  });
});
