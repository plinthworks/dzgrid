import { checkPage } from '@dzgrid/core/internal';
import { liveChangeProblems, messageProblems, partNameFor, resolveOperations, resolveColumns, type Problem } from '@dzgrid/core';
import { createRowStore, compileFilter, missingFeatureProblems, sortIndices } from '@dzgrid/core/internal';
import { refusalProblems } from '@dzgrid/core/rules';
// The Angular wrapper's registry rule (step 22): a pure module of that package, no Angular in it.
import { shadowedParts } from '../../../packages/angular/src/shadow.js';
import { harness } from '../harness.js';
import { runTree } from './tree.js';
import { kindsOf } from '../kinds.js';
import { runSource } from './source.js';
import { columnOf, runBands, runSpans } from './spans.js';
import { FULL_WIDTH } from '../spans-fixtures.js';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };
/** A tree problem names its row by id in `detail` (its place shifts on a removal). */
const shape = (ps: readonly Problem[]) => ps.map((p) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.code.startsWith('tree-') && { detail: p.detail }) }));

export const problems: Record<string, Suite> = {
  problems: (input) => {
    switch (input.op) {
      case 'replaceAll':
        return { problems: shape(createRowStore<Row>((r) => r.id).replaceAll(input.rows).problems) };
      case 'tx': {
        const s = createRowStore<Row>((r) => r.id);
        s.replaceAll(input.rows);
        return { problems: shape(s.apply(input.tx).problems) };
      }
      case 'page':
        return { problems: shape(checkPage(input.page)) };
      case 'message':
        return { problems: shape(messageProblems(input.key, new Set(input.available))) };
      case 'part-name':
        return { problems: shape(partNameFor(input.slot, input.column, new Set(input.available)).problems) };
      case 'live-change':
        return { problems: shape(liveChangeProblems(input.policy, input.prev, input.patch)) };
      case 'operations':
        return { problems: shape(resolveOperations(input.operations, input.hasSource).problems) };
      case 'columns':
        return { problems: shape(resolveColumns(input.columns).problems) };
      case 'filter': {
        const h = harness({ locale: 'en-US', ...input });
        return { problems: shape(compileFilter(input.filter, h.env(), kindsOf(input.kinds)).problems) };
      }
      case 'source':
        return { problems: runSource(input).problems };
      case 'values': {
        // A script that opens value lists: the last list's problems.
        const r = runSource(input) as { lists?: { problems?: unknown[] }[] };
        return { problems: r.lists?.at(-1)?.problems ?? [] };
      }
      // Span rules (step 9b): the map's problems, the header bands', or rules with no spans feature.
      case 'spans':
        return { problems: runSpans(input).problems };
      case 'bands':
        return { problems: runBands(input).problems };
      case 'missing-feature':
        return { problems: shape(missingFeatureProblems({ columns: input.columns.map(columnOf), fullWidth: input.fullWidth ? FULL_WIDTH[input.fullWidth] : undefined })) };
      // A host's selection refused by a rule (step 21): the warning the rules feature tells.
      case 'selection-refused':
        return { problems: refusalProblems(input.refusal) };
      // A part name hidden by a later layer of an Angular grid's registry (step 22).
      case 'part-shadowed':
        return { problems: shadowedParts(input.layers) };
      // A tree's repairs and what it refuses beside it (Phase 4 step 3).
      case 'tree':
        return { problems: runTree(input).problems };
      case 'sort': {
        const h = harness({ locale: 'en-US', ...input });
        return { problems: shape(sortIndices(input.sort, null, h.env()).problems) };
      }
    }
    throw new Error(`unknown op ${input.op}`);
  },
};
