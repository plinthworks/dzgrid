import { leaves, type ColumnOrGroup } from '../columns/defs.js';
import { problem, type Problem } from '../problems.js';
import { groupChains } from './bands.js';

/** One collapsible group (docs/behaviors/header-groups.md 1–4). */
export interface GroupEntry {
  /** Its definition's state (`open`, true by default). */
  readonly open: boolean;
  /** Every column under it, at any depth, in the definitions' order. */
  readonly leaves: readonly string[];
  /** The columns it shows open (all but `groupShow: 'closed'`) and closed (all but `'open'`; its first when none, rule 2). */
  readonly shownOpen: readonly string[];
  readonly shownClosed: readonly string[];
}

export interface GroupTable {
  /** The valid groups with `collapsible: true`, by id. */
  readonly groups: ReadonlyMap<string, GroupEntry>;
  /** `invalid-column-group` warnings `empty-closed` (rule 2); the refused groups are `headerBands`' to tell. */
  readonly problems: readonly Problem[];
}

/** The collapsible groups of a tree (Phase 6 step 7): pure, from the definitions only. */
export function groupTable<T>(tree: readonly ColumnOrGroup<T>[]): GroupTable {
  const show = new Map(leaves(tree).map((d) => [d?.id, d?.groupShow]));
  const groups = new Map<string, { open: boolean; leaves: string[]; shownOpen: string[]; shownClosed: string[]; at: string }>();
  const problems: Problem[] = [];
  for (const [id, up] of groupChains(tree).chain) {
    for (const { id: g, def, at } of up) {
      if (def.collapsible !== true) continue;
      let e = groups.get(g);
      if (!e) groups.set(g, (e = { open: def.open !== false, leaves: [], shownOpen: [], shownClosed: [], at }));
      e.leaves.push(id);
      if (show.get(id) !== 'closed') e.shownOpen.push(id);
      if (show.get(id) !== 'open') e.shownClosed.push(id);
    }
  }
  for (const e of groups.values()) {
    if (e.shownClosed.length) continue;
    e.shownClosed.push(e.leaves[0]!);
    problems.push(problem('invalid-column-group', 'warning', `${e.at}.children`, 'empty-closed'));
  }
  return { groups, problems };
}

/**
 * The columns the groups' states hide (header-groups.md 3, 4): a column is folded when some collapsible group above it
 * does not show it in its state now. Ids that are not collapsible groups change nothing.
 */
export function foldedColumns(t: GroupTable, state: ReadonlyMap<string, boolean>): Set<string> {
  const out = new Set<string>();
  for (const [id, e] of t.groups) {
    // Its state now: the user's (`state`, by id), else its definition's.
    const s = (state.get(id) ?? e.open) ? e.shownOpen : e.shownClosed;
    for (const l of e.leaves) if (!s.includes(l)) out.add(l);
  }
  return out;
}

/** The groups whose state differs from their definition: what a GridState keeps (header-groups.md 6). */
export function diffState(t: GroupTable, state: ReadonlyMap<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, e] of t.groups) if ((state.get(id) ?? e.open) !== e.open) out[id] = !e.open;
  return out;
}
