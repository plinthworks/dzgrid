import { isBlank, problem, type ResolvedColumn, type RowKey, type RowShape } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { DetailShape } from '@dzgrid/core/detail';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { SlotPart } from '../part.js';
import { detail } from '../detail/index.js';

export interface ResponsiveOptions {
  /** A collapse priority by column id, over the columns' own `collapsePriority`: the highest collapse first; 0 never. */
  readonly priority?: Readonly<Record<string, number>>;
}

/**
 * The lines' layout, injected by the feature (no colour, logical sides, zero specificity, in the base's layer): the
 * detail's empty slot gone while nothing is collapsed; one line per collapsed column, its title then its value, the
 * colon drawn here (a narrow space before it in French); a value read in its own direction (`B-1` in Arabic).
 */
const CSS =
  '@layer dzgrid.layout{' +
  ':where([data-dzg-responsive] .dzg-toggle[data-none]){display:none}' +
  ':where(.dzg-rlines){margin:0;padding:.375rem var(--dzg-cell-padding-inline,.75rem)}' +
  ':where(.dzg-rlines>div){display:flex;flex-wrap:wrap;gap:0 .5rem;padding-block:.125rem}' +
  ':where(.dzg-rlines dt){font-weight:600}:where(.dzg-rlines dt)::after{content:":"}:where(.dzg-rlines:lang(fr) dt)::after{content:"\\202f:"}' +
  ':where(.dzg-rlines dd){margin:0;unicode-bidi:plaintext}' +
  '}';

/** One grid's: whether something is collapsed, how to show the rows again, the panels to draw, the grid. */
interface State {
  on: boolean;
  redo?: () => void;
  readonly draws: Set<() => void>;
  g?: GridContext<unknown>;
  readonly inner: GridFeature;
}

/**
 * `responsive({ priority })` (docs/behaviors/responsive-columns.md): when the columns do not fit the view, centre columns
 * collapse — the highest `collapsePriority` first, the last on screen among equals, never the first, a pinned one or a
 * priority 0 — and each row's chevron (the detail's) opens « Title: value » lines under it. Followed at each paint; not
 * the columns' state; the search, filters, files and print still read every column.
 *
 * ```ts
 * import { responsive } from '@dzgrid/dom/responsive';
 * import { FR_DETAIL } from '@dzgrid/dom/locales/fr-detail';
 * createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_DETAIL.text } }, features: [responsive()] });
 * ```
 */
export function responsive(o: ResponsiveOptions = {}): GridFeature {
  // Made by `shape()` for the grid being created (as the detail's sizes): none when another shape is the grid's.
  let st: State | null = null;
  const me: GridFeature = {
    id: 'responsive',
    shape() {
      const s: State = { on: false, draws: new Set(), inner: detail({ part: lines(() => s), height: 'auto' }) };
      st = s;
      const d = s.inner.shape!() as DetailShape<unknown>;
      const none: ReadonlySet<RowKey> = new Set();
      // Nothing collapsed: no row opens, none shows its panel; the open set kept for when columns collapse again (4).
      return {
        ...d,
        opens: (key) => s.on && d.opens!(key),
        parents: (snap, depth, now) => (s.on ? d.parents!(snap, depth, now) : []),
        build: (i) => Object.assign(d.build(s.on ? i : { ...i, expansion: none }), { isMaster: () => s.on }),
        attach: (_, redraw) => void (s.redo = redraw),
      } satisfies RowShape<unknown>;
    },
    setup(x) {
      const g = x as GridContext<unknown>;
      const s = st;
      st = null;
      const fs = g.settings.features ?? [];
      // One row shape a grid (14): another's, or the application's own details beside these, told; the first listed wins.
      if (!s || fs.some((f) => f.id === 'detail')) emit(g.kernel, { type: 'problems', source: 'host', problems: [problem('unsupported-combination', 'warning', 'responsive', s ? 'detail' : fs.find((f) => f !== me && f.shape)?.id ?? 'shape')] });
      return s ? setup(g, s, o) : { destroy() {} };
    },
  };
  return me;
}

function setup(g: GridContext<unknown>, s: State, o: ResponsiveOptions): FeatureHandle {
  s.g = g;
  const h = s.inner.setup(g);
  const { columns, kernel, el, doc } = g;
  const root = el.root.getRootNode() as Document | ShadowRoot;
  if (g.settings.injectStyles !== false && !root.querySelector?.('style[data-dzgrid-responsive]')) {
    const st = doc.createElement('style');
    st.setAttribute('data-dzgrid-responsive', '');
    if (g.settings.nonce) st.setAttribute('nonce', g.settings.nonce);
    st.textContent = CSS;
    ('head' in root ? root.head : root).append(st);
  }
  el.root.setAttribute('data-dzg-responsive', '');
  const p = o.priority ?? {};
  columns.collapse!((c) => p[c.id] ?? c.def.collapsePriority ?? 1);
  g.schedule();
  const first = (): string | undefined => columns.visible()[0]?.id;
  return {
    beforeRows: () => h.beforeRows?.(),
    afterRows(f) {
      // Something collapsed or not any more: the rows built again (their panels, 4); a frame later.
      if (columns.collapsed!.size > 0 !== s.on) (s.on = !s.on), s.redo?.();
      h.afterRows!(f);
      // The focus on a column that went under the rows: its row's first cell, or the first header (8).
      const fo = kernel.focus;
      const c0 = first();
      if (fo && c0 && columns.collapsed!.has(fo.column)) kernel.dispatch({ type: 'focus.set', focus: { ...fo, column: c0 } }, 'data');
      for (const d of s.draws) d();
    },
    keys(e, at, owner) {
      // Enter or Space on a row's first cell opens or closes its lines while columns are collapsed (6).
      if (s.on && owner === 'cell' && at?.kind === 'cell' && at.column === first() && at.row[0] === 'd' && (e.key === 'Enter' || e.key === ' ') && !(e.ctrlKey || e.altKey || e.metaKey || e.shiftKey)) {
        kernel.dispatch({ type: 'rows.expand', rows: [at.row], expanded: !kernel.expansion.has(at.row) }, 'user');
        return true;
      }
      return h.keys!(e, at, owner);
    },
    destroy() {
      h.destroy();
      columns.collapse!(null);
      el.root.removeAttribute('data-dzg-responsive');
    },
  };
}

/** The panel's part: a description list of the collapsed columns, title then value as the cell shows it (2, 7, 15). */
function lines(state: () => State): SlotPart<'detail'> {
  return {
    slot: 'detail',
    part: {
      mount(box, c) {
        const s = state();
        const g = s.g!;
        const dl = box.appendChild(g.doc.createElement('dl'));
        dl.className = 'dzg-rlines';
        let ctx = c;
        let last = '';
        const text = (col: ResolvedColumn<unknown>): string => {
          try {
            const raw = g.edit ? g.edit.read(col, ctx.row, ctx.master) : col.read(ctx.row);
            const v = isBlank(raw) ? null : col.codec.coerce(raw, g.ctx);
            return v === null ? '' : col.codec.format(v, g.ctx);
          } catch {
            return '';
          }
        };
        const draw = (): void => {
          const m = g.columns;
          const items = m.withCollapsed!().filter((col) => m.collapsed!.has(col.id)).map((col) => [col.def.header ?? col.id, text(col)]);
          const k = JSON.stringify(items);
          if (k === last) return;
          last = k;
          dl.replaceChildren(...items.map(([t, v]) => {
            const line = g.doc.createElement('div');
            line.appendChild(g.doc.createElement('dt')).textContent = t!;
            line.appendChild(g.doc.createElement('dd')).textContent = v!;
            return line;
          }));
        };
        s.draws.add(draw);
        draw();
        return {
          update(n) {
            ctx = n;
            draw();
          },
          destroy: () => void s.draws.delete(draw),
        };
      },
    },
  };
}
