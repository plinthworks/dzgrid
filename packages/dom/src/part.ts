import type { LocaleCtx, PartSlot, Problem, ResolvedColumn, RowKey, SortItem } from '@dzgrid/core';
import type { AppMessageKey, MessageKey } from './messages.js';

/**
 * One contract for everything a host may draw in the grid (Phase 3, the
 * plug-in design): a part mounts into a host element the grid gives it,
 * updates with a new context, and is destroyed before its host is reused
 * elsewhere. The grid never writes HTML; a part writes its own DOM.
 */
export interface Part<C> {
  mount(host: HTMLElement, c: C): PartHandle<C>;
}

export interface PartHandle<C> {
  /** Same host, new context: a pooled cell rebound to another row, a changed state. */
  update?(c: C): void;
  /** Remove listeners; the grid empties the host after. */
  destroy?(): void;
  /** The grid asks the part to take focus; false when it has nothing focusable. */
  focus?(): boolean;
}

/** What every part gets. */
export interface PartBase {
  readonly ctx: LocaleCtx;
  readonly dir: 'ltr' | 'rtl';
  /** The grid's messages, and the host's own `app.*` ones (a missing one shows its key, told once). */
  msg(key: MessageKey | AppMessageKey, params?: Readonly<Record<string, string | number>>): string;
  announce(text: string): void;
  readonly doc: Document;
}

export interface SlotContext {
  cell: PartBase & {
    /** The cell's value, read and coerced by the column's codec; null when blank or unreadable. */
    readonly value: unknown;
    /** The text the grid would show. */
    readonly text: string;
    readonly row: Readonly<unknown>;
    readonly key: RowKey;
    readonly column: ResolvedColumn<unknown>;
    /** The grid's focus is on this cell. */
    readonly focused: boolean;
  };
  /** A column header's label (`@dzgrid/dom/slots`): the grid keeps the role, the sort state, the mark and the grip. */
  header: PartBase & {
    readonly column: ResolvedColumn<unknown>;
    /** The column's `header`, or its id. */
    readonly label: string;
    /** This column's place in the sort, or null. */
    readonly sort: SortItem | null;
    /** Its precedence in the sort, from 0, or null. */
    readonly sortIndex: number | null;
    /** Sorts by this column as the user would (`multi`: adds to the sort, as Shift does). */
    toggleSort(multi: boolean): void;
  };
  /** The overlay (`@dzgrid/dom/slots`). */
  overlay: PartBase & {
    readonly phase: 'loading' | 'empty' | 'no-match' | 'error';
    /** What the server's fetch failed with; null outside an error. */
    readonly failure: unknown;
    /** Asks for the rows again, puts the focus back on the grid and says it loads (the retry button's). */
    retry(): void;
    /** Empties every column filter and the quick search, as the user. */
    clearFilters(): void;
  };
  /** The tooltip, shown only when the host gave text (`@dzgrid/dom/slots`). */
  tooltip: PartBase & {
    /** The host's text (`headerTooltip`, `tooltip(value, row)`). */
    readonly text: string;
    /** The cell's value as the column's codec reads it; null for a header. */
    readonly value: unknown;
    /** The cell's row; null for a header. */
    readonly row: Readonly<unknown> | null;
    readonly column: ResolvedColumn<unknown>;
  };
}

export type WiredSlot = keyof SlotContext;

/** A part for a slot, registered by name in `settings.parts`. */
export interface SlotPart<S extends WiredSlot = WiredSlot> {
  readonly slot: S;
  readonly part: Part<SlotContext[S]>;
}

export function definePart<S extends WiredSlot>(slot: S, part: Part<SlotContext[S]>): SlotPart<S> {
  return { slot, part };
}

/** Header, overlay and tooltip parts given to a grid without `slots()`: told, one warning each. */
export const unslotted = (parts: Readonly<Record<string, SlotPart>> = {}): Problem[] =>
  Object.keys(parts).filter((n) => parts[n]!.slot !== 'cell').map((n) => ({ code: 'missing-feature', severity: 'warning', path: `parts.${n}`, detail: 'slots' }));

export type { PartSlot };
