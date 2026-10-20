import { isSelected } from '@dzgrid/core';
import { emit, setSelectionGate } from '@dzgrid/core/internal';
import { refusalProblems, ruleGate } from '@dzgrid/core/rules';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { RulesMessageKey } from '../part-texts.js';

/** The texts `rules()` needs, from `@dzgrid/dom/locales/<lang>-rules`. */
export const RULES_KEYS = ['rules.refused', 'rules.refusedReason', 'rules.partly'] as const satisfies readonly RulesMessageKey[];

/**
 * `rules()`: selection rules (docs/behaviors/selection-rules.md, step 21). Reads
 * `settings.selection.canSelect` and `settings.context` live: every addition is vetted through the
 * kernel's gate, a refusal is said (a host's is told as a problem), and the boxes of rows the rule
 * refuses now are greyed (`data-dzg-refused` on `.dzg-check`, never `aria-disabled`).
 *
 * ```ts
 * import { rules } from '@dzgrid/dom/rules';
 * import { FR_RULES } from '@dzgrid/dom/locales/fr-rules';
 * createGrid(host, { selection: { mode: 'multi', checkbox: true, canSelect: (row, s, ctx) => … }, features: [rules()], … });
 * ```
 */
export function rules(): GridFeature {
  return { id: 'rules', setup };
}

function setup(g: GridContext<unknown>): FeatureHandle {
  const missing = RULES_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`rules: missing ${missing.join(', ')}`);
  const k = g.kernel;
  const gate = ruleGate(() => g.settings.selection?.canSelect, (key) => g.rows.row(key), () => k.selection, () => g.settings.context, g.report);
  setSelectionGate(k, gate);

  // The user's refusal said, every time (the live region empties first); with what was accepted in
  // the same command, one sentence. A host's is told as a problem, never said.
  let count: number | null | undefined;
  const off = k.subscribe((e) => {
    if (e.type === 'selectionChanged') return void (count = e.source === 'user' ? e.count : undefined);
    const got = count;
    count = undefined;
    if (e.type !== 'selectionRefused') return;
    if (e.source !== 'user') return emit(k, { type: 'problems', source: e.source, problems: refusalProblems(e) });
    const n = e.rows.length || (g.rows.counts.filtered ?? 1);
    g.live.announce(
      // Under a rule the selection is an include one: its count is known.
      got != null ? g.msg('rules.partly', { selected: g.msg('announce.selected', { n: got }), n })
        : e.reason !== null ? g.msg('rules.refusedReason', { reason: e.reason })
        : g.msg('rules.refused', { n }),
    );
  });

  return {
    // The refused look, on the rows mounted: unselected rows the rule refuses now.
    afterRows() {
      const on = gate.on;
      for (const [key, v] of g.rowRenderer.mounted) v.check?.toggleAttribute('data-dzg-refused', on && !isSelected(k.selection, key) && gate.refused(key));
    },
    destroy() {
      off();
      setSelectionGate(k);
    },
  };
}
