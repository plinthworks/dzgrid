import type { KeyOwner } from '@dzgrid/core';

const MARKED = new Set<string>(['filter-input', 'popup', 'cell-widget', 'editor']);
/** What a person interacts with on its own: inside a cell or a header, it owns its keys. */
export const INTERACTIVE = 'button, a[href], input, textarea, select, [contenteditable=""], [contenteditable="true"], [tabindex]:not(.dzg-cell):not(.dzg-hcell):not(.dzg-check)';

/**
 * Who a key belongs to, from where it was pressed. A part marks its own
 * controls (`data-dzg-owner`: a filter input, a popup); otherwise an editable
 * element is an editor, and any other control inside a cell is the cell's
 * widget. The scroller itself counts as the focus cell (D5).
 */
export function ownerOf(target: EventTarget | null, viewport: HTMLElement): KeyOwner {
  const el = target as HTMLElement | null;
  if (!el || !viewport.contains(el)) return 'outside';
  if (el === viewport) return 'cell';
  const marked = el.closest<HTMLElement>('[data-dzg-owner]');
  if (marked && viewport.contains(marked)) {
    const owner = marked.dataset['dzgOwner'] ?? '';
    return MARKED.has(owner) ? (owner as KeyOwner) : 'outside';
  }
  // A control a part drew in a cell, a text field included, is the cell's widget: its keys are its
  // own, Escape goes back to the cell. The grid's own editor marks itself (Phase 4).
  if (el.closest('.dzg-cell') && el.matches(INTERACTIVE)) return 'cell-widget';
  if (el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return 'editor';
  if (el.closest('.dzg-hcell')) return el.matches(INTERACTIVE) && !el.matches('.dzg-box') ? 'cell-widget' : 'header';
  if (el.closest('.dzg-cell')) return 'cell';
  return 'outside';
}

/** Cmd is the command key on Apple systems. */
export function isMac(nav: Navigator | undefined): boolean {
  if (!nav) return false;
  const platform = (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? nav.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}
