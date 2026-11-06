import type { ChangeSource, Problem } from '@dzgrid/core';
import type { DockArea, DockState } from '@dzgrid/core/dock';

/**
 * A panel the dock hosts (dock.md 1, 3): handed by a feature on its handle (`handle.dock`, read by shape: no feature
 * imports the dock's code, nor the dock theirs) or made from `dock({ panels })`. Types only.
 */
export interface DockPanelSpec {
  readonly id: string;
  /** Its title now (the head, the tab, the names of the head's buttons and of the region). */
  title(): string;
  /** Its body, built once; the dock moves it between areas. */
  readonly el: HTMLElement;
  /** Where it goes first (`end` when absent), when neither `dock({ open })` nor a restored state places it. */
  readonly area?: DockArea;
  /** Shown in its area at first (its tab), collapsed to the strip when `collapsed` and the area holds no other. */
  readonly open?: boolean;
  readonly collapsed?: boolean;
  /** The head's × collapses the area instead of hiding the panel (the filters panel's strip, dock.md 6). */
  readonly keep?: boolean;
  /** Told when its body becomes seen or unseen (another tab, collapsed, hidden, moved). */
  shown?(on: boolean): void;
}

/** What a grid's dock gives the other features (`g.dock`, set at its setup). */
export interface DockHost {
  /** Shown in `area` (else its own), its tab selected, the area restored; false: no such panel, or `float`. */
  show(id: string, area?: DockArea, source?: ChangeSource): boolean;
  hide(id: string, source?: ChangeSource): boolean;
  /** The head's ×: hidden, or its area collapsed for a kept panel. */
  close(id: string): boolean;
  /** Its body is seen now (shown, its tab selected, the area not collapsed). */
  seen(id: string): boolean;
  /** The layout as a state keeps it, and a restore (checked, nothing said: problems returned). */
  get(): DockState;
  set(raw: unknown): readonly Problem[];
  /** The layout once the grid's panels came (before any gesture): what `reset()` goes back to. */
  readonly initial: DockState | undefined;
}
