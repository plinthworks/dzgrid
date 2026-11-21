import { formattersFor, type ResolvedColumn, type SparklineOptions, type SparklineValues } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { SlotContext, SlotPart } from '../part.js';
import type { SparklineMessageKey } from '../part-texts.js';
import { logicalX } from '../dir.js';

/** The texts `sparklines()` needs, in `locales/<lang>-sparkline`. */
export const SPARKLINE_KEYS = ['sparkline.summary', 'sparkline.point'] as const satisfies readonly SparklineMessageKey[];

const NS = 'http://www.w3.org/2000/svg';
// The drawing's box: 100 × 100, stretched to the cell (sparklines.md 15); the line's ends and dots kept off its edges.
const X0 = 3;
const X1 = 97;
const Y0 = 8;
const Y1 = 92;

type Opts = SparklineOptions & { readonly kind: NonNullable<SparklineOptions['kind']>; readonly markers: NonNullable<SparklineOptions['markers']> };

/** What a drawing holds for its tooltip: each point's place across (NaN for a gap) and up, its options, its numbers' format. */
interface Drawn {
  readonly v: SparklineValues;
  readonly at: readonly number[];
  readonly ys: readonly number[];
  readonly o: Opts;
  readonly fmt: (n: number) => string;
  readonly col: ResolvedColumn<unknown>;
  summary: string;
}

/** By drawing: what its pointer reads. Only the cells shown hold one. */
const drawn = new WeakMap<Element, Drawn>();

const fin = (n: unknown): n is number => typeof n == 'number' && Number.isFinite(n);
const r2 = (n: number): number => Math.round(n * 100) / 100;
// The smallest and the largest of a list, without a spread (a huge list would pass the engine's argument limit).
const least = (a: readonly number[]): number => a.reduce((m, x) => (x < m ? x : m), Infinity);
const most = (a: readonly number[]): number => a.reduce((m, x) => (x > m ? x : m), -Infinity);

/** The options of a column: its own `sparkline`, key by key over the grid's (sparklines.md 6). */
function optionsOf(col: ResolvedColumn<unknown>, base: SparklineOptions): Opts {
  const o = { ...base, ...col.def.sparkline };
  return { ...o, kind: ['area', 'bar', 'winloss'].includes(o.kind!) ? o.kind! : 'line', markers: o.markers === 'minmax' || o.markers === 'none' ? o.markers : 'last' };
}

/** The shapes of one list (sparklines.md 3–5), in the 100 × 100 box. */
export function shapes(v: SparklineValues, o: Opts): { line: string; area: string; bars: { bx: number; by: number; w: number; h: number; neg: boolean; mark: boolean }[]; dots: [number, number][]; at: number[]; ys: number[] } {
  const n = v.length;
  const nums = v.filter(fin);
  const bar = o.kind === 'bar';
  let lo = fin(o.min) ? o.min : Math.min(least(nums), bar ? 0 : Infinity);
  let hi = fin(o.max) ? o.max : Math.max(most(nums), bar ? 0 : -Infinity);
  if (hi < lo) [lo, hi] = [hi, lo];
  // Halves first: at the ends of the number range, hi - lo would overflow to Infinity.
  const yOf = (a: number): number => (hi === lo ? 50 : r2(Y1 - ((Math.min(Math.max(a, lo), hi) / 2 - lo / 2) / (hi / 2 - lo / 2)) * (Y1 - Y0)));
  // The marked points: the last, or the smallest and the largest (their first time).
  const lastAt = v.findLastIndex(fin);
  const marked = new Set(o.markers === 'none' ? [] : o.markers === 'last' ? [lastAt] : [v.indexOf(least(nums)), v.indexOf(most(nums))]);
  const at: number[] = [];
  const ys: number[] = [];
  const out = { line: '', area: '', bars: [] as { bx: number; by: number; w: number; h: number; neg: boolean; mark: boolean }[], dots: [] as [number, number][], at, ys };
  if (o.kind === 'line' || o.kind === 'area') {
    const base = yOf(0);
    let seg: [number, number][] = [];
    const close = (): void => {
      if (!seg.length) return;
      out.line += `M${seg.map((p) => p.join(' ')).join('L')}${seg.length === 1 ? 'h0' : ''}`;
      if (o.kind === 'area') out.area += `M${seg[0]![0]} ${base}L${seg.map((p) => p.join(' ')).join('L')}L${seg.at(-1)![0]} ${base}Z`;
      seg = [];
    };
    v.forEach((a, i) => {
      const px = n === 1 ? 50 : r2(X0 + (i * (X1 - X0)) / (n - 1));
      if (!fin(a)) return void (at.push(NaN), ys.push(NaN), close());
      const py = yOf(a);
      at.push(px);
      ys.push(py);
      seg.push([px, py]);
      if (marked.has(i)) out.dots.push([px, py]);
    });
    close();
    return out;
  }
  const slot = 100 / n;
  const zero = o.kind === 'winloss' ? 50 : yOf(0);
  v.forEach((a, i) => {
    const bx = r2(i * slot + slot * 0.15);
    at.push(r2(i * slot + slot / 2));
    if (!fin(a) || (o.kind === 'winloss' && a === 0)) return void ys.push(NaN);
    // A win / loss bar: half the box above or below the middle. A bar: from zero, a value other than zero never of no height.
    const h = o.kind === 'winloss' ? 50 - Y0 - 2 : Math.max(r2(Math.abs(zero - yOf(a))), a === 0 ? 0 : 2);
    const top = o.kind === 'winloss' ? (a > 0 ? Y0 + 2 : 52) : a < 0 ? zero : r2(zero - h);
    // The pointer's ring at the bar's far end.
    ys.push(a < 0 ? r2(top + h) : top);
    out.bars.push({ bx, by: top, w: r2(slot * 0.7), h, neg: a < 0, mark: marked.has(i) });
  });
  return out;
}

const el = (doc: Document, name: string, cls: string): SVGElement => {
  const e = doc.createElementNS(NS, name) as SVGElement;
  e.setAttribute('class', cls);
  return e;
};

/** A dot: a zero-length line with round caps, round whatever the cell's stretch (sparkline.css: non-scaling stroke). */
const dot = (doc: Document, cls: string, [px, py]: [number, number]): SVGElement => {
  const d = el(doc, 'path', cls);
  d.setAttribute('d', `M${px} ${py}h0`);
  return d;
};

/** The summary of a list for screen readers (sparklines.md 7); '' when every point is a gap. */
function summaryOf(c: SlotContext['cell'], v: SparklineValues, fmt: (n: number) => string): string {
  const nums = v.filter(fin);
  if (!nums.length) return '';
  return c.msg('sparkline.summary', { n: nums.length, min: fmt(least(nums)), max: fmt(most(nums)), last: fmt(nums.at(-1)!) });
}

/** The cell part: the words in a hidden span, the drawing hidden from assistive technologies. */
function part(base: SparklineOptions): SlotPart<'cell'> {
  return {
    slot: 'cell',
    part: {
      mount(host, c0) {
        const doc = c0.doc;
        const sr = doc.createElement('span');
        sr.className = 'dzg-sr';
        const svg = el(doc, 'svg', 'dzg-spark');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        host.append(sr, svg);
        let key = '';
        const paint = (c: SlotContext['cell']): void => {
          const v = Array.isArray(c.value) ? (c.value as SparklineValues) : [];
          const o = optionsOf(c.column, base);
          const fmt = formattersFor(c.ctx).number(c.column.def.numberFormat ?? {});
          const summary = summaryOf(c, v, fmt);
          if (sr.textContent !== summary) sr.textContent = summary;
          const k = summary && `${o.kind}|${o.min}|${o.max}|${o.markers}|${v.join(',')}`;
          if (k === key) {
            const d = drawn.get(svg);
            if (d) (d.summary = summary), Object.assign(d, { fmt, col: c.column });
            return;
          }
          key = k;
          svg.replaceChildren();
          svg.setAttribute('data-kind', o.kind);
          if (!summary) return void drawn.delete(svg);
          const s = shapes(v, o);
          for (const [cls, d] of [['dzg-spark-area', s.area], ['dzg-spark-line', s.line]]) {
            if (!d) continue;
            const p = el(doc, 'path', cls!);
            p.setAttribute('d', d);
            svg.append(p);
          }
          for (const b of s.bars) {
            const r = el(doc, 'rect', `dzg-spark-bar${b.neg ? ' dzg-spark-neg' : ''}${b.mark ? ' dzg-spark-mark' : ''}`);
            for (const [a, n] of [['x', b.bx], ['y', b.by], ['width', b.w], ['height', b.h]] as const) r.setAttribute(a, String(n));
            svg.append(r);
          }
          for (const p of s.dots) svg.append(dot(doc, 'dzg-spark-dot', p));
          drawn.set(svg, { v, at: s.at, ys: s.ys, o, fmt, col: c.column, summary });
        };
        paint(c0);
        return { update: paint, destroy: () => (drawn.delete(svg), sr.remove(), svg.remove()) };
      },
    },
  };
}

/** The point nearest the pointer, `fx` across the box (0–100): a line's nearest point, a bar's slot; -1 for none. */
function pointAt(d: Drawn, fx: number): number {
  if (d.o.kind === 'bar' || d.o.kind === 'winloss') {
    const i = Math.min(d.v.length - 1, Math.max(0, Math.floor((fx / 100) * d.v.length)));
    return fin(d.v[i]) ? i : -1;
  }
  let best = -1;
  d.at.forEach((px, i) => {
    if (!Number.isNaN(px) && (best < 0 || Math.abs(px - fx) < Math.abs(d.at[best]! - fx))) best = i;
  });
  return best;
}

function setup(g: GridContext<unknown>): FeatureHandle {
  const missing = SPARKLINE_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`sparklines: missing ${missing.join(', ')}`);
  const { scope, tip } = g;
  const vp = g.el.viewport;
  let ring: SVGElement | null = null;
  let at: { svg: Element; i: number } | null = null;
  // The cell the pointer came into, and when: the tooltip's first show waits the hover delay from there.
  let came: { cell: Element; t: number } | null = null;
  const unring = (): void => {
    ring?.remove();
    ring = null;
    at = null;
  };
  /** The cell's drawing and what it holds; none when the column has its own tooltip or turned the point tooltip off. */
  const drawingIn = (cell: Element | null): [Element, Drawn] | null => {
    const svg = cell?.querySelector(':scope > svg.dzg-spark');
    const d = svg && drawn.get(svg);
    return d && d.o.tooltip !== false && d.col.def.tooltip == null ? [svg, d] : null;
  };
  const tipFor = (cell: HTMLElement, d: Drawn, text: string, said: boolean) => {
    const key = g.rowRenderer.keyOf(cell.closest('.dzg-row')!);
    return { text, col: d.col as ResolvedColumn<any>, row: key ? g.rows.row(key)?.data ?? null : null, value: d.v, ...(said && { said }) };
  };
  scope.on(vp, 'pointermove', (e: PointerEvent) => {
    const cell = e.pointerType === 'touch' ? null : (e.target as Element).closest?.<HTMLElement>('.dzg-cell') ?? null;
    if (cell !== came?.cell) came = cell && { cell, t: g.now() };
    const found = drawingIn(cell);
    if (!found || !(e.target as Element).closest('svg.dzg-spark')) return unring();
    const [svg, d] = found;
    const r = svg.getBoundingClientRect();
    const i = r.width ? pointAt(d, (logicalX(e, r, 'ltr') / r.width) * 100) : -1;
    if (i < 0) return unring();
    if (at?.svg === svg && at.i === i && tip.anchor === cell) return;
    unring();
    at = { svg, i };
    ring = dot(g.doc, 'dzg-spark-hover', [d.at[i]!, d.ys[i]!]);
    svg.append(ring);
    const text = g.msg('sparkline.point', { value: d.fmt(d.v[i]!), i: i + 1, n: d.v.length });
    const wait = tip.anchor === cell ? 0 : Math.max(0, (g.settings.tooltips?.delayMs ?? 500) - (g.now() - came!.t));
    tip.showFor(cell!, tipFor(cell!, d, text, false), g.dir, wait);
  });
  scope.on(vp, 'pointerleave', unring);
  // A keyboard focus: the summary at once (sparklines.md 9), already the cell's words (no second description).
  scope.on(vp, 'focusin', (e: FocusEvent) => {
    const cell = e.target as HTMLElement;
    const found = cell.classList?.contains('dzg-cell') && g.now() - g.keyboardAt < 1000 ? drawingIn(cell) : null;
    if (found && found[1].summary) tip.showFor(cell, tipFor(cell, found[1], found[1].summary, true), g.dir, 0);
  });
  return { destroy: unring };
}

/**
 * `sparklines(options)`: draws every `type: 'sparkline'` column — a list of numbers in time order — as a small line,
 * area, bar or win / loss chart (1.16.0, docs/behaviors/sparklines.md). The options are the grid's defaults; a column's
 * `sparkline: { … }` wins, key by key. The cell's words are a summary for screen readers (« 12 values, from 3 to 41,
 * last 27 »); the pointer over the drawing shows the point's value in the grid's tooltip, a keyboard focus the summary.
 * Time runs left to right in both directions. Files, the clipboard and print write the numbers.
 *
 * ```ts
 * import { sparklines } from '@dzgrid/dom/sparkline';
 * import { EN_SPARKLINE } from '@dzgrid/dom/locales/en-sparkline';
 * createGrid(host, { …, columns: [{ id: 'trend', type: 'sparkline', sparkline: { kind: 'area' } }],
 *   messages: { ...EN, text: { ...EN.text, ...EN_SPARKLINE.text } }, features: [sparklines()] });
 * ```
 */
export function sparklines(options: SparklineOptions = {}): GridFeature {
  return { id: 'sparkline', parts: { 'cell.sparkline': part(options) }, setup };
}
