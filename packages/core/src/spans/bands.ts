import { leaves, type ColumnGroupDef, type ColumnOrGroup } from '../columns/defs.js';
import { problem, type Problem } from '../problems.js';

/** One piece of a group's header over consecutive visible columns of one segment. */
export interface BandFragment {
  /** The group's id. */
  readonly group: string;
  /** Its first visible column (start, centre, end order) and how many it spans. */
  readonly first: number;
  readonly count: number;
  /** The group's header, repeated on each of its fragments (O7); empty when it has none. */
  readonly label: string;
}

export interface HeaderBands {
  /** Group rows above the column headers: the deepest nesting of the valid groups. */
  readonly depth: number;
  /** Per group row, top first (`levels[0]` is level -depth): its fragments, by column. */
  readonly levels: readonly (readonly BandFragment[])[];
  readonly problems: readonly Problem[];
}

interface Segments {
  readonly start: { readonly columns: readonly { readonly id: string }[] };
  readonly center: { readonly columns: readonly { readonly id: string }[] };
  readonly end: { readonly columns: readonly { readonly id: string }[] };
}

const isGroup = <T>(d: ColumnOrGroup<T> | null | undefined): d is ColumnGroupDef<T> => !!d && Array.isArray((d as ColumnGroupDef<T>).children);

/**
 * The grouped headers over the visible columns (step 9b blueprint A.3). A
 * group is cut where a segment ends and where a column of another group (or
 * of none) stands between its leaves; a hidden leaf only shrinks it; a column
 * outside any group at a level has no cell there (its header is stretched
 * upward). A group with no leaf, a duplicate id (of a group or a column) or no
 * id is refused (`invalid-column-group`): its leaves stay, as if ungrouped at
 * that level. A problem's path follows the tree (`columns[1].children[0]`).
 */
export function headerBands<T>(tree: readonly ColumnOrGroup<T>[], layout: Segments): HeaderBands {
  const problems: Problem[] = [];
  const leafIds = new Set(leaves(tree).flatMap((d) => (d && typeof d.id === 'string' ? [d.id] : [])));
  const groups = new Set<string>();
  // Each leaf's valid groups, outermost first.
  const chain = new Map<string, { readonly id: string; readonly label: string }[]>();
  let depth = 0;
  const walk = (defs: readonly ColumnOrGroup<T>[], path: string, up: { readonly id: string; readonly label: string }[]): void =>
    defs.forEach((d, i) => {
      const at = `${path}[${i}]`;
      if (!isGroup(d)) {
        if (d && typeof d.id === 'string' && !chain.has(d.id)) chain.set(d.id, up);
        return;
      }
      let next = up;
      const why = !leaves(d.children).some(Boolean) ? 'empty' : typeof d.id !== 'string' || d.id === '' ? 'id' : groups.has(d.id) || leafIds.has(d.id) ? 'duplicate' : null;
      if (why) problems.push(problem('invalid-column-group', 'error', at, why));
      else {
        groups.add(d.id);
        next = [...up, { id: d.id, label: typeof d.header === 'string' ? d.header : '' }];
        depth = Math.max(depth, next.length);
      }
      walk(d.children, `${at}.children`, next);
    });
  walk(tree, 'columns', []);

  const segs = [layout.start.columns, layout.center.columns, layout.end.columns];
  const levels: BandFragment[][] = Array.from({ length: depth }, () => []);
  for (let k = 0; k < depth; k++) {
    let i = 0;
    let open: { group: string; first: number; count: number; label: string } | null = null;
    for (const seg of segs) {
      open = null;
      for (const col of seg) {
        const g = chain.get(col.id)?.[k];
        if (!g) open = null;
        else if (open && open.group === g.id) open.count++;
        else levels[k]!.push((open = { group: g.id, first: i, count: 1, label: g.label }));
        i++;
      }
    }
  }
  return { depth, levels, problems };
}
