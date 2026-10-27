import type { FocusPos, Intent, RowKey } from '@dzgrid/core';
// The pure key table of `@dzgrid/dom/pinned-rows` (Phase 6 step 8b-1): no DOM in it, so it runs here with the core.
import { crossBand } from '../../../packages/dom/src/pinned-rows/band.js';
import type { Suite } from './index.js';

/** A position in a case: `{ "row": "t0", "column": "c" }`, or `{ "header": "c", "level": 1 }` (level 0 when absent). */
type At = { row: string; column: string } | { header: string; level?: number };
const pos = (a: At): FocusPos => ('row' in a ? { kind: 'cell', row: a.row as RowKey, column: a.column } : a.level ? { kind: 'header', column: a.header, level: a.level } : { kind: 'header', column: a.header });
const back = (f: FocusPos | undefined): At | null => (!f ? null : f.kind === 'cell' ? { row: f.row, column: f.column } : f.level ? { header: f.column, level: f.level } : { header: f.column });

export const pinned: Record<string, Suite> = {
  /**
   * `top`, `bottom`: the bands' row names; `body`: how many body rows (named b0, b1…); `level`: the last header row; `page`;
   * `cols`. Each move: from `at`, by `intent` (`inside`: the editors' Enter). Expected per move: where it leads, or null
   * when the grid's own move decides (inside the body, Left / Right in a pinned row).
   */
  'pinned-rows': (input) => {
    const keys = Array.from({ length: input.body as number }, (_, i) => `b${i}` as RowKey);
    const body = { count: keys.length, index: (i: number) => (i >= 0 && i < keys.length ? i : null) as never, keyAt: (i: number) => keys[i as number]!, indexOf: (k: RowKey) => keys.indexOf(k) as never };
    const s = { top: input.top as RowKey[], bottom: input.bottom as RowKey[], body, level: input.level ?? 0, page: input.page ?? 10, cols: input.cols };
    return { moves: (input.moves as { at: At; intent: Intent; inside?: boolean }[]).map((m) => back(crossBand(s, pos(m.at), m.intent, m.inside))) };
  },
};
