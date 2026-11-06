import { problem, type Problem } from '../problems.js';

/**
 * Where a panel of the dock stands (Phase 9, docs/behaviors/dock.md 2, 12): beside the rows (`start`, `end`, logical),
 * under them (`bottom`), or in a window of its own (`float`: in the model and the state's shape; the DOM refuses it until
 * the floating window comes).
 */
export type DockArea = 'start' | 'end' | 'bottom' | 'float';

/** One panel's place: its area, whether it is shown there (its tab), and a floating window's corner (from the inline start). */
export interface DockPanelState {
  readonly area: DockArea;
  readonly open: boolean;
  readonly at?: { readonly inline: number; readonly block: number };
}
/** One area: the panel it shows (a tab), its size in CSS px (inline beside, block under), collapsed to its strip. */
export interface DockAreaState {
  readonly active?: string;
  readonly size?: number;
  readonly collapsed?: boolean;
}
/** The dock's part of a grid's state (dock.md 11): ids, areas and numbers only — never a row, a value or a title. */
export interface DockState {
  readonly panels: Readonly<Record<string, DockPanelState>>;
  readonly areas: { readonly start?: DockAreaState; readonly end?: DockAreaState; readonly bottom?: DockAreaState };
}

export const DOCK_AREAS: readonly DockArea[] = ['start', 'end', 'bottom', 'float'];
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v == 'object' && !Array.isArray(v);
const fin = (n: unknown): n is number => typeof n == 'number' && Number.isFinite(n);

/**
 * A raw layout (any JSON) checked (dock.md 11): never throws. Not an object: null and `state-field` at `dock` (the dock
 * keeps its own). Otherwise a layout of what is right — an unknown area drops its panel, a flag, a corner, a tab or a size
 * that is not one is skipped, each told (`state-field`, a path, never a value); a size is kept between `min` and `max`;
 * any panel id is kept (the grid may have it later); an area left empty is dropped.
 */
export function checkDock(raw: unknown, lim: { readonly min: number; readonly max: number }): { dock: DockState | null; problems: Problem[] } {
  const problems: Problem[] = [];
  const bad = (path: string): undefined => void problems.push(problem('state-field', 'warning', `dock${path}`));
  if (!isObj(raw)) return bad(''), { dock: null, problems };
  const obj = (k: string): Record<string, any> => (raw[k] === undefined ? {} : isObj(raw[k]) ? raw[k] : (bad(`.${k}`), {}));
  const panels: Record<string, DockPanelState> = {};
  for (const [id, p] of Object.entries(obj('panels'))) {
    const at = `.panels.${id}`;
    // A built-in of every object (`__proto__`, `constructor`…) is never a key: it would change the layout or read as a panel.
    if (id in {} || !isObj(p)) bad(at);
    else if (!DOCK_AREAS.includes(p.area)) bad(`${at}.area`);
    else {
      const c = p.at;
      panels[id] = {
        area: p.area,
        open: p.open === !!p.open ? p.open : (p.open !== undefined && bad(`${at}.open`), false),
        ...(c !== undefined && (isObj(c) && fin(c.inline) && fin(c.block) ? { at: { inline: c.inline, block: c.block } } : bad(`${at}.at`))),
      };
    }
  }
  const areas: Record<string, DockAreaState> = {};
  for (const [k, a] of Object.entries(obj('areas'))) {
    const at = `.areas.${k}`;
    if (!isObj(a) || !['start', 'end', 'bottom'].includes(k)) {
      bad(at);
      continue;
    }
    const s: Record<string, unknown> = {};
    if (a.size !== undefined) s.size = fin(a.size) ? Math.min(lim.max, Math.max(lim.min, a.size)) : bad(`${at}.size`);
    if (a.collapsed !== undefined) s.collapsed = a.collapsed === !!a.collapsed ? a.collapsed : bad(`${at}.collapsed`);
    if (a.active !== undefined) s.active = typeof a.active == 'string' ? a.active : bad(`${at}.active`);
    for (const f in s) if (s[f] === undefined) delete s[f];
    if (Object.keys(s).length) areas[k] = s;
  }
  return { dock: { panels, areas }, problems };
}
