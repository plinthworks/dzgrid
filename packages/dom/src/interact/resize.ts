import { logicalX, type Dir } from '../dir.js';
import type { Scope } from '../render/scope.js';

export interface ResizeHost {
  readonly scope: Scope;
  readonly header: HTMLElement;
  dir(): Dir;
  /** The column's width when the drag starts. */
  widthOf(column: string): number;
  /** Dragging toward the end narrows it: the last column pinned to the end has its handle on its start edge (S2). */
  reversed(column: string): boolean;
  /** Once per frame while dragging, then once with `finished` on release. */
  resize(column: string, width: number, finished: boolean): void;
  /** Runs `fn` at the next frame (the grid's scheduler). */
  nextFrame(fn: () => void): void;
}

/**
 * Column resize by pointer. The header's box is read once, at pointerdown:
 * nothing is measured during the gesture. Widths go by logical distance, so
 * one code serves both directions. Returns a check the header's click
 * handler asks, so the click that ends a drag does not also sort.
 */
export function attachResize(h: ResizeHost): { consumeClick(): boolean } {
  let drag: { column: string; startX: number; start: number; sign: 1 | -1; rect: DOMRectReadOnly; id: number; width: number; queued: boolean } | null = null;
  let suppress = false;

  const widthAt = (d: NonNullable<typeof drag>, e: PointerEvent) => Math.max(1, d.start + d.sign * (logicalX(e, d.rect, h.dir()) - d.startX));

  h.scope.on(h.header, 'pointerdown', (e: PointerEvent) => {
    suppress = false;
    const handle = (e.target as HTMLElement).closest<HTMLElement>('.dzg-resize');
    const column = handle?.closest<HTMLElement>('.dzg-hcell')?.dataset['col'];
    if (!handle || !column || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture?.(e.pointerId);
    const rect = h.header.getBoundingClientRect();
    drag = { column, rect, id: e.pointerId, start: h.widthOf(column), sign: h.reversed(column) ? -1 : 1, startX: 0, width: h.widthOf(column), queued: false };
    drag.startX = logicalX(e, rect, h.dir());
  });
  h.scope.on(h.header, 'pointermove', (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.width = widthAt(drag, e);
    if (drag.queued) return;
    drag.queued = true;
    const d = drag;
    h.nextFrame(() => {
      d.queued = false;
      if (drag === d) h.resize(d.column, d.width, false);
    });
  });
  const end = (e: PointerEvent, commit: boolean) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (commit) d.width = widthAt(d, e);
    h.resize(d.column, commit ? d.width : d.start, true);
    suppress = true;
  };
  h.scope.on(h.header, 'pointerup', (e: PointerEvent) => end(e, true));
  h.scope.on(h.header, 'pointercancel', (e: PointerEvent) => end(e, false));

  return {
    consumeClick() {
      const was = suppress;
      suppress = false;
      return was;
    },
  };
}
