import type { GridKernel } from '@dzgrid/core';

/** What a menu reaches of its grid (the column menu's and the cell menu's items). */
export type MenuGrid = { readonly kernel: GridKernel<any, any> };
type Grid = MenuGrid;
/** An item, or a separator between two sections (never drawn first, last or twice in a row). */
export type MenuEntry<C = MenuContext> = MenuItem<C> | { readonly separator: true };
export interface MenuItem<C = MenuContext> {
  /** Built-ins: `sort.asc` `sort.desc` `sort.none` `pin.start` `pin.end` `pin.none` `size.auto` `size.autoAll` `size.widen` `size.narrow` `size.resize` `move.start` `move.end` `fill.down` `fill.end` `filter` `hide` `choose` `reset` `density.<d>`; an application's own is free. */
  readonly id: string;
  readonly label: string;
  /** `menuitem` (default), `menuitemradio` (radios of one `group` in one named `role="group"`), `menuitemcheckbox`. */
  readonly kind?: 'item' | 'radio' | 'check';
  readonly group?: string;
  readonly checked?: boolean;
  /** Focusable, `aria-disabled`, does nothing (APG). */
  readonly disabled?: boolean;
  /** `aria-keyshortcuts` words; shown as a hint (Ctrl, ⌘). */
  readonly keys?: string;
  /** Stays open after it acts (« Widen » / « Narrow »); in a submenu, ignored. */
  readonly keepOpen?: boolean;
  /** A class for an icon the host's CSS draws; never HTML. */
  readonly icon?: string;
  /**
   * A part of slot `menuItem` by name (`settings.parts`, an Angular `dzgPart` template; Phase 6 step 12, owner Q12-2): it
   * paints the item's content in an `inert`, `aria-hidden` host; the item keeps `label` as its name. Unknown: `unknown-part`.
   */
  readonly part?: string;
  /**
   * A submenu (Phase 9): the item opens it beside itself, toward the inline end (forward arrow, Enter, Space, a click, a
   * 300 ms hover); its `action` is ignored. One level is advised.
   */
  readonly submenu?: readonly MenuEntry<C>[];
  readonly action?: (c: C) => void;
}
export interface MenuContext {
  readonly column: string;
  readonly grid: Grid;
  /** A sentence for the grid's live region. */
  say(text: string): void;
}
