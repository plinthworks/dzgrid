import { problem, type Problem } from '@dzgrid/core';

/**
 * One layer of an Angular grid's part registry, lowest first: the features' parts,
 * `provideDzGrid({ parts })`, `[parts]`, the `dzgPart` templates (step 22). No Angular here:
 * the conformance runner loads this module in node (case `problems/part-shadowed`).
 */
export interface PartLayer {
  readonly from: string;
  readonly names: readonly string[];
}

/**
 * `part-shadowed`: each name a later layer takes from an earlier one, once (`told` remembers the
 * names already said, one set per grid), a warning at `parts.<name>`, the detail naming the layer
 * just under the one that wins. A name given twice in one layer (two templates, two features) is
 * told too, the detail naming that layer.
 */
export function shadowedParts(layers: readonly PartLayer[], told: Set<string> = new Set()): Problem[] {
  const owner = new Map<string, string>();
  const hidden = new Map<string, string>();
  for (const l of layers) {
    for (const n of l.names) {
      const o = owner.get(n);
      if (o !== undefined) hidden.set(n, o);
      owner.set(n, l.from);
    }
  }
  const out: Problem[] = [];
  for (const [n, d] of hidden) if (!told.has(n)) out.push((told.add(n), problem('part-shadowed', 'warning', `parts.${n}`, d)));
  return out;
}
