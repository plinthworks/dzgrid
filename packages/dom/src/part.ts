import type { LocaleCtx, PartSlot, ResolvedColumn, RowKey } from '@dzgrid/core';
import type { MessageKey } from './messages.js';

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
  msg(key: MessageKey, params?: Readonly<Record<string, string | number>>): string;
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

export type { PartSlot };
