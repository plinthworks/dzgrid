import type { ChangeSource } from '@dzgrid/core';
import type { GridContext } from '../context.js';

/** `filters().floating`: the floating row shown or hidden live (Phase 4 step 12, docs/behaviors/floating-toggle.md). */
export interface FloatingToggle {
  /** The row shown; before the grid exists, the state it will start with. */
  get(): boolean;
  /** Shows or hides the row (nothing when it already is); before the grid exists, the state it starts with. */
  set(on: boolean): void;
  /**
   * The host's button as the row's toggle: a click shows or hides it (said, as the user's act); the button
   * gets `aria-pressed` (kept in step with every change), `aria-controls` (the grid) and, when it has no
   * words of its own, the bundle's name (`filter.floatingToggle`). Bound before or after the grid. Returns the unbind.
   */
  bind(button: HTMLElement): () => void;
}

export interface Toggle {
  readonly api: FloatingToggle;
  /** Set up with a grid: the state it starts with (unless set before), and what a change does there. */
  attach(g: GridContext<unknown>, first: boolean, show: (on: boolean, source: ChangeSource) => void): void;
  detach(g: GridContext<unknown>): void;
  /** At each paint: the buttons' names follow the language. */
  paint(): void;
}

let uid = 0;

/** The toggle's state lives with the feature object: like `openFilter`, it acts on the last grid set up. */
export function toggle(start: boolean): Toggle {
  let on = start;
  let set = false;
  let at: { readonly g: GridContext<unknown>; readonly show: (on: boolean, source: ChangeSource) => void } | null = null;
  let words: unknown = null;
  /** Each bound button, and whether its name is ours (it had no words of its own). */
  const buttons = new Map<HTMLElement, boolean>();
  const mark = (b: HTMLElement, own: boolean): void => {
    b.setAttribute('aria-pressed', String(on));
    if (!at) return;
    const g = at.g;
    b.setAttribute('aria-controls', (g.el.viewport.id ||= `dzg-g${uid++}`));
    if (own) b.setAttribute('aria-label', g.msg('filter.floatingToggle'));
  };
  const change = (next: boolean, source: ChangeSource): void => {
    set = true;
    if ((next = !!next) === on) return;
    on = next;
    at?.show(on, source);
    buttons.forEach((own, b) => mark(b, own));
  };
  return {
    api: {
      get: () => on,
      set: (next) => change(next, 'api'),
      bind(b) {
        const own = !b.textContent?.trim() && !b.hasAttribute('aria-label');
        const click = (): void => change(!on, 'user');
        b.addEventListener('click', click);
        buttons.set(b, own);
        mark(b, own);
        return () => {
          b.removeEventListener('click', click);
          buttons.delete(b);
          b.removeAttribute('aria-pressed');
          b.removeAttribute('aria-controls');
          if (own) b.removeAttribute('aria-label');
        };
      },
    },
    attach(g, first, show) {
      if (!set) on = first;
      at = { g, show };
      words = null;
    },
    detach(g) {
      if (at?.g === g) at = null;
    },
    paint() {
      if (!at || words === at.g.settings.messages) return;
      words = at.g.settings.messages;
      buttons.forEach((own, b) => mark(b, own));
    },
  };
}
