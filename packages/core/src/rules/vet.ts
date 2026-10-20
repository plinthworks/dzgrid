import type { RowKey } from '../ids.js';
import type { SelectionGate, SelectionRefusal } from '../kernel.js';
import { problem, type Problem } from '../problems.js';
import type { RowNode } from '../row/node.js';
import { isSelected, type SelectionState } from '../selection/rows.js';

/**
 * A selection rule (docs/behaviors/selection-rules.md): `true` allows the row; `false` refuses it;
 * a string refuses it and is the sentence said. `selection` is what the row would join: the rows
 * kept, then those accepted before it in the same command. Pure and fast; it may be asked often.
 */
export type SelectionRule<T> = (row: RowNode<T>, selection: SelectionState) => boolean | string;

/**
 * What a command may add of `next` (step 21): each added row asked in `next`'s order (screen order
 * for the grid's own commands) against a running selection, greedily; a key whose row is not held
 * is refused unasked (`unknown-row`); an everything-except selection made from an include one is
 * refused whole (`needs-rows`: no rows to judge), while one that stays everything-except has the
 * rows it ticks again vetted. A command whose every addition is refused changes nothing (`prev`).
 * Unticking is never asked.
 */
export function vetSelection<T>(rule: SelectionRule<T>, rowOf: (key: RowKey) => RowNode<T> | undefined, prev: SelectionState, next: SelectionState): { readonly state: SelectionState; readonly refused: SelectionRefusal | null } {
  const rows: RowKey[] = [];
  let reason: string | null = null;
  let cause: SelectionRefusal['cause'] = 'unknown-row';
  const ex = next.mode === 'exclude';
  if (ex && prev.mode !== 'exclude') return { state: prev, refused: { rows, reason, cause: 'needs-rows' } };
  // The running selection: what `next` keeps of `prev`; then what is asked, in order.
  const keys = new Set<RowKey>(ex ? next.keys : []);
  const asked: RowKey[] = [];
  if (ex) for (const k of prev.keys) !next.keys.has(k) && (keys.add(k), asked.push(k));
  else for (const k of next.keys) isSelected(prev, k) ? keys.add(k) : asked.push(k);
  const running: SelectionState = { mode: next.mode, keys };
  let took = false;
  for (const k of asked) {
    const row = rowOf(k);
    const v = row ? rule(row, running) : false;
    if (v === true) {
      ex ? keys.delete(k) : keys.add(k);
      took = true;
    } else {
      rows.push(k);
      if (row) cause = 'rule';
      if (reason === null && typeof v === 'string') reason = v;
    }
  }
  if (!rows.length) return { state: next, refused: null };
  return { state: took ? running : prev, refused: { rows, reason, cause } };
}

/** A host's selection refused (its `selection.set`): told, never said; the cause only, never a key. */
export const refusalProblems = (r: SelectionRefusal): Problem[] => [problem('selection-refused', 'warning', 'selection', r.cause)];

/**
 * The kernel's gate over a host's rule (step 21; `@dzgrid/dom/rules` sets it with
 * `setSelectionGate`): `rule()`, the rule in force (none: the gate is off and lets all through),
 * handed `context()` third; a rule that throws refuses the row (fail closed), the error given to
 * `report`. `refused(key)`: an unselected row the rule refuses now, asked once per selection, rule
 * and context (a row not held is refused); `skip` is it, a new function when the rule or the
 * context changed, so the kernel reads its box again.
 */
export function ruleGate<T>(
  rule: () => ((row: RowNode<T>, selection: SelectionState, context: unknown) => boolean | string) | undefined,
  rowOf: (key: RowKey) => RowNode<T> | undefined, selection: () => SelectionState, context: () => unknown, report: (err: unknown) => void,
): SelectionGate & { refused(key: RowKey): boolean } {
  const ask: SelectionRule<T> = (row, s) => {
    try {
      return rule()!(row, s, context());
    } catch (err) {
      report(err);
      return false;
    }
  };
  let seen: unknown[] = [];
  let said = new Map<RowKey, boolean>();
  const refused = (key: RowKey): boolean => {
    fresh();
    let v = said.get(key);
    if (v === undefined) {
      const row = rowOf(key);
      said.set(key, (v = !row || ask(row, selection()) !== true));
    }
    return v;
  };
  let skip = (key: RowKey): boolean => refused(key);
  const fresh = (): void => {
    const now = [rule(), context(), selection()];
    if (now.every((v, i) => v === seen[i])) return;
    if (now[0] !== seen[0] || now[1] !== seen[1]) skip = (key) => refused(key);
    seen = now;
    said = new Map();
  };
  return {
    get on() {
      return !!rule();
    },
    vet: (prev, next) => (rule() ? vetSelection(ask, rowOf, prev, next) : null),
    get skip() {
      fresh();
      return skip;
    },
    refused,
  };
}
