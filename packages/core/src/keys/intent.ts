/**
 * Keys as the grid understands them, before any DOM: one table, mirrored for
 * right to left, so the DOM layer never reads an arrow's physical side.
 *
 * The command key is Cmd on a Mac and Ctrl elsewhere; on a Mac, Ctrl is not
 * a command key (Ctrl+A moves to the line start in text fields there).
 */

/** Who has focus when the key is pressed: only `cell` and `header` are the grid's in Phase 2. */
export type KeyOwner = 'cell' | 'header' | 'editor' | 'filter-input' | 'popup' | 'cell-widget' | 'outside';

export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  /** The physical key: Ctrl+A still selects all on a layout where that key is another letter. */
  readonly code?: string;
}

export interface IntentContext {
  readonly dir: 'ltr' | 'rtl';
  readonly owner: KeyOwner;
  readonly mac: boolean;
}

/** `col` deltas and edges are logical: +1 and `last` go toward the end of the reading direction. */
export type Intent =
  | { readonly kind: 'move'; readonly axis: 'row' | 'col'; readonly delta: -1 | 1 }
  | { readonly kind: 'edge'; readonly axis: 'row' | 'col' | 'both'; readonly to: 'first' | 'last' }
  | { readonly kind: 'page'; readonly delta: -1 | 1 }
  | { readonly kind: 'toggleSelect' }
  | { readonly kind: 'selectAll' }
  | { readonly kind: 'sort'; readonly multi: boolean };

/** Where each intent may come from; a new intent kind does not compile until it is listed. */
export const INTENT_OWNERS: { readonly [K in Intent['kind']]: readonly KeyOwner[] } = {
  move: ['cell', 'header'],
  edge: ['cell', 'header'],
  page: ['cell', 'header'],
  toggleSelect: ['cell'],
  selectAll: ['cell', 'header'],
  sort: ['header'],
};

const isSpace = (k: string): boolean => k === ' ' || k === 'Spacebar';

function raw(e: KeyLike, ctx: IntentContext): Intent | null {
  const cmd = ctx.mac ? e.metaKey : e.ctrlKey;
  // A modifier that is not the command key belongs to the system or the browser.
  const other = e.altKey || (ctx.mac ? e.ctrlKey : e.metaKey);
  if (other) return null;
  // Toward the end of the line: right in LTR, left in RTL.
  const forward = ctx.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const back = ctx.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';

  if (e.key === 'Enter') return cmd ? null : { kind: 'sort', multi: e.shiftKey };
  if (e.shiftKey) return null;   // ranges come in Phase 4
  if (cmd && (e.key === 'a' || e.key === 'A' || e.code === 'KeyA')) return { kind: 'selectAll' };
  switch (e.key) {
    case 'ArrowDown': return cmd ? { kind: 'edge', axis: 'row', to: 'last' } : { kind: 'move', axis: 'row', delta: 1 };
    case 'ArrowUp': return cmd ? { kind: 'edge', axis: 'row', to: 'first' } : { kind: 'move', axis: 'row', delta: -1 };
    case forward: return cmd ? { kind: 'edge', axis: 'col', to: 'last' } : { kind: 'move', axis: 'col', delta: 1 };
    case back: return cmd ? { kind: 'edge', axis: 'col', to: 'first' } : { kind: 'move', axis: 'col', delta: -1 };
    case 'PageDown': return cmd ? null : { kind: 'page', delta: 1 };
    case 'PageUp': return cmd ? null : { kind: 'page', delta: -1 };
    case 'Home': return { kind: 'edge', axis: cmd ? 'both' : 'col', to: 'first' };
    case 'End': return { kind: 'edge', axis: cmd ? 'both' : 'col', to: 'last' };
  }
  if (isSpace(e.key) && !cmd) return { kind: 'toggleSelect' };
  return null;
}

export function intentFor(e: KeyLike, ctx: IntentContext): Intent | null {
  const i = raw(e, ctx);
  if (!i || !INTENT_OWNERS[i.kind].includes(ctx.owner)) return null;
  // A header has no row above it.
  if (ctx.owner === 'header' && ((i.kind === 'move' && i.axis === 'row' && i.delta < 0) || (i.kind === 'edge' && i.axis === 'row' && i.to === 'first') || (i.kind === 'page' && i.delta < 0))) return null;
  return i;
}
