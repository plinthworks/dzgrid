import type { ClientModel, ColumnModel, GridKernel, LocaleCtx, RowKey } from '@dzgrid/core';
import type { LiveRegion } from './a11y/live-region.js';
import type { Dir } from './dir.js';
import type { ScrollController } from './interact/scroll.js';
import type { HeaderRenderer } from './render/header.js';
import type { Geometry } from './render/measure.js';
import type { RowRenderer } from './render/rows.js';
import type { FrameScheduler } from './render/scheduler.js';
import type { Scope } from './render/scope.js';
import type { Tooltip } from './render/tooltip.js';
import type { GridSettings } from './settings.js';
import type { MessageKey } from './messages.js';
import type { HeaderRowSpec } from './render/header.js';

/** Test seams: what a test without layout replaces. */
export interface GridEnv {
  /** A fake for tests without layout (jsdom); the viewport's own otherwise. */
  readonly geometry?: Geometry;
  /** Render at once instead of on the next frame (tests). */
  readonly sync?: boolean;
  /** The physical cap above which scrolling is mapped (tests lower it). */
  readonly maxPhysical?: number;
  /** Where a pointer is, for the scrollbar drag (tests without layout). */
  readonly isOnScrollbar?: (e: PointerEvent) => boolean;
  /** Frames, when not the window's (tests). */
  readonly raf?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
}

/** A cell or a header to focus once it is mounted. */
export type PendingFocus = { readonly row: RowKey; readonly column: string } | { readonly header: string; readonly level?: number };

/**
 * What the grid's parts share: its elements, its model, its services, and
 * the little state that crosses them (the direction, the focus waiting for
 * its cell, the time of the last key or scroll). One object, so the modules
 * that make the grid are plain functions of it.
 */
export interface GridContext<T> {
  readonly doc: Document;
  readonly win: Window | null;
  readonly env: GridEnv;
  readonly scope: Scope;
  readonly el: {
    readonly root: HTMLElement;
    readonly viewport: HTMLElement;
    readonly header: HTMLElement;
    readonly body: HTMLElement;
    readonly layer: HTMLElement;
    readonly overlay: HTMLElement;
    readonly tooltip: HTMLElement;
  };
  readonly live: LiveRegion;
  readonly tip: Tooltip;
  readonly columns: ColumnModel<T>;
  readonly rows: ClientModel<T>;
  readonly kernel: GridKernel<T, ClientModel<T>>;
  readonly geometry: Geometry;
  readonly scheduler: FrameScheduler;
  readonly scroll: ScrollController;
  readonly headerRenderer: HeaderRenderer;
  readonly rowRenderer: RowRenderer<T>;
  readonly mac: boolean;

  settings: GridSettings<T>;
  /** Header rows the features add under the column headers. */
  headerRows: readonly HeaderRowSpec[];
  ctx: LocaleCtx;
  dir: Dir;
  pendingFocus: PendingFocus | null;
  /** A paint is waiting for its frame. */
  queued: boolean;
  /** The grid holds the user's focus (a removed focused row hands it on). */
  hasFocus: boolean;
  /** When focus last moved or a grid key was pressed (D4: a native scroll right after is redone). */
  intentAt: number;
  /** When a key was last pressed (a focus that follows a key shows its tooltip at once). */
  keyboardAt: number;
  /** When the view last scrolled, and how fast (the overscan follows it). */
  scrolledAt: number;
  speed: number;

  schedule(): void;
  /** A host callback's error: reported, never swallowed, never stopping the grid. */
  report(err: unknown): void;
  now(): number;
  rowHeight(): number;
  msg(key: MessageKey, params?: Readonly<Record<string, string | number>>): string;
}
