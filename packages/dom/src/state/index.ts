import { problem, type ChangeSource, type GridKernel, type Problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { captureState, checkState, restoreState, stateText, type GridState, type StateEnv, type StatePart } from '@dzgrid/core/state';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import { ROW_HEIGHT } from '../settings.js';

/** What `gridState()` adds to a grid (`feature.api(grid)`). */
export interface GridStateApi {
  /** The state now (grid-state.md 4): `captureState` with the grid's density. */
  state(): GridState;
  /** Applies a state (G 6): one `stateRestored` event; the focus not moved, nothing said, no `stateChanged`. */
  setState(state: unknown): Problem[];
}

export interface GridStateOptions {
  /** The pause after a gesture before `stateChanged` (ms; 300). */
  readonly debounce?: number;
  /** The browser storage at creation (G 17): read before the first request, written after each gesture (`include`: the parts kept). */
  readonly persist?: { readonly key: string; readonly include?: readonly StatePart[] };
}

export interface GridStateFeature extends GridFeature {
  api(grid: { readonly kernel: GridKernel<any> }): GridStateApi | null;
}

type Kernel = GridKernel<unknown>;
/** Every grid's state API and environment, by kernel: `persistLocal` finds them without the feature object. */
const APIS = new WeakMap<object, GridStateApi & { env: StateEnv }>();
/** The events of the parts a state keeps (a group opened or closed is a `columnsChanged`). */
const SAVED = ['columnsChanged', 'columnResized', 'sortChanged', 'filterChanged', 'quickChanged', 'pageChanged', 'densityChanged'];
const tell = (k: Kernel, p: Problem): void => emit(k, { type: 'problems', source: 'host', problems: [p] });

/**
 * Reads `key` and restores it: nothing there, nothing said; one warning `state-storage` (never the content) when the
 * storage is blocked, holds something that is not JSON, or a state of another version (the rest of a bad state is the
 * restore's own `state-*` problems). Then saves the parts `include` names after each gesture until `stop()`. Never a
 * cookie, never the history.
 */
function keep(k: Kernel, api: GridStateApi & { env: StateEnv }, key: string, include?: readonly StatePart[]): () => void {
  let warned = false;
  const warn = (): void => void (warned || tell(k, problem('state-storage', 'warning', 'storage')), (warned = true));
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null && api.setState(JSON.parse(raw))[0]?.code === 'state-version') throw 0;
  } catch {
    warn();
  }
  return k.subscribe((e) => {
    if (e.type === 'stateChanged') try {
      localStorage.setItem(key, stateText(include ? captureState(k, api.env, { include }) : e.state));
    } catch {
      warn();
    }
  });
}

/**
 * `gridState(o?)` (Phase 6 step 5, docs/behaviors/grid-state.md): `state()` / `setState()` on the grid, the `stateChanged`
 * event (once per gesture, after `debounce` ms; never for the host's changes nor a restore) and `stateRestored`; with
 * `persist`, the state kept in the browser's storage, read before the grid's first request.
 */
export function gridState(o: GridStateOptions = {}): GridStateFeature {
  return {
    id: 'state',
    held: !!o.persist,
    api: (grid) => APIS.get(grid.kernel) ?? null,
    setup(g: GridContext<unknown>) {
      const k = g.kernel;
      const env: StateEnv = {
        density: () => g.settings.density ?? 'comfortable',
        // Not one of the three: refused (the restore says `state-field`); as the menu does, through the live settings (density.md 1).
        setDensity: (d) => (typeof d == 'string' && ROW_HEIGHT[d as 'compact'] > 0 ? ((g.settings = { ...g.settings, density: d as 'compact' }), g.schedule()) : false),
        // The collapsible groups (`@dzgrid/dom/spans`, Phase 6 step 7), read when used: none without them.
        get groups() { return g.groups; },
      };
      let quiet = false;
      let source: ChangeSource;
      let cancel = (): void => {};
      const text = (): string => stateText(captureState(k, env));
      let last = '';
      const arm = (s: ChangeSource): void => {
        source = s;
        cancel();
        cancel = g.scope.timeout(() => {
          const t = text();
          if (t !== last) emit(k, { type: 'stateChanged', source, state: JSON.parse((last = t)) });
        }, o.debounce ?? 300);
      };
      const api = {
        env,
        state: () => captureState(k, env),
        setState(s: unknown) {
          quiet = true;
          let problems: Problem[];
          try {
            problems = restoreState(k, s, env);
          } finally {
            quiet = false;
          }
          last = text();
          emit(k, { type: 'stateRestored', source: 'host', problems });
          return problems;
        },
      };
      APIS.set(k, api);
      g.scope.add(k.subscribe((e) => void (!quiet && e.source !== 'host' && SAVED.includes(e.type) && arm(e.source))));
      // The storage restored, then a server model this feature held asks: what was restored, or the grid as defined.
      // Without `persist` the hold is someone else's (the Angular wrapper's `[state]`, Phase 6 step 12): theirs to end.
      // With `persist` and another feature holding too (that wrapper's `[state]`), the storage's restore keeps the hold
      // (the rows have no `hold` meanwhile): the other ends it, one request in all (Phase 6 close review).
      if (o.persist) {
        const r = g.rows;
        const h = r.hold;
        const own = !g.settings.features!.filter((f) => f.held)[1]; // this feature holds; a second one too?
        // Without `hold`, a restore applies its commands one by one, each load still held.
        own || delete r.hold;
        try {
          g.scope.add(keep(k, api, o.persist.key, o.persist.include));
        } finally {
          r.hold = h!;
          own && h?.(() => {});
        }
      }
      last = text();
      // Its timer and listeners go with the grid's scope.
      return { destroy() {} };
    },
  };
}

/**
 * The browser storage, later (G 17): restores `key` now — on a server grid, one more request than at creation (prefer
 * `gridState({ persist })`) — and saves after each gesture until `stop()`. Needs `gridState()`: `missing-feature` otherwise.
 */
export function persistLocal(grid: { readonly kernel: GridKernel<any> }, key: string, o: { readonly include?: readonly StatePart[] } = {}): () => void {
  const api = APIS.get(grid.kernel);
  if (api) return keep(grid.kernel, api, key, o.include);
  tell(grid.kernel, problem('missing-feature', 'error', 'features', 'state'));
  return () => {};
}

/** The largest state an address carries (owner E5-3): 4 KB of JSON. */
const MAX = 4096;
const utf8 = new TextEncoder();
type Loose = { -readonly [K in keyof GridState]?: GridState[K] };
/** Typed filters and the search out of `s` (in place) unless `include` names them (O6). */
const strip = (s: Loose, o: { readonly include?: readonly ('filter' | 'quick')[] }): Loose => {
  const inc = Array.isArray(o.include) ? o.include : [];
  if (!inc.includes('filter')) delete s.filter;
  if (!inc.includes('quick')) delete s.quick;
  return s;
};

/**
 * The state as ONE parameter of an address (G 18, 19, O6, O7): `name` = `1.` + base64url of its text (`stateText`). Typed
 * filters and the search stay out unless `include` names them. Over 4 KB, only the columns and the sort, and a warning
 * (`state-field`, E5-3). The application writes it into the address itself (`history.replaceState`): never done here.
 */
export function toSearchParams(state: GridState, o: { readonly name?: string; readonly include?: readonly ('filter' | 'quick')[] } = {}): { params: URLSearchParams; problems: Problem[] } {
  const name = o.name ?? 'grid';
  const problems: Problem[] = [];
  let bytes = utf8.encode(stateText(strip({ ...state }, o) as GridState));
  if (bytes.length > MAX) {
    problems.push(problem('state-field', 'warning', name, 'too-large'));
    bytes = utf8.encode(stateText({ v: 1, columns: state.columns, sort: state.sort } as GridState));
  }
  // Still over: the sort alone (columns never cut in half), told again.
  if (bytes.length > MAX) {
    problems.push(problem('state-field', 'warning', name, 'sort-only'));
    bytes = utf8.encode(stateText({ v: 1, sort: state.sort } as GridState));
  }
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { params: new URLSearchParams([[name, `1.${b64}`]]), problems };
}

/**
 * The state an address carries (G 18): null and nothing said when it has none; null and `state-version` when the parameter
 * was edited, cut, is not version `1.` of the encoding, or holds over 4 KB. Typed filters and the search are left out
 * unless `include` names them, as when writing (O6: a hand-edited address cannot slip them in). The parts it does not
 * hold are not applied by `setState` (the grid's own filters and search stay, G 19).
 */
export function fromSearchParams(params: URLSearchParams, o: { readonly name?: string; readonly include?: readonly ('filter' | 'quick')[] } = {}): { state: GridState | null; problems: Problem[] } {
  const name = o.name ?? 'grid';
  const v = params.get(name);
  if (v === null) return { state: null, problems: [] };
  try {
    if (!/^1\.[\w-]+$/.test(v)) throw 0;
    const bin = atob(v.slice(2).replace(/-/g, '+').replace(/_/g, '/'));
    if (bin.length > MAX) throw 0;
    const s = checkState(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))).state as Loose | null;
    if (s) return { state: strip(s, o) as GridState, problems: [] };
  } catch {
    // Edited, cut, or not a state: below.
  }
  return { state: null, problems: [problem('state-version', 'error', name)] };
}
