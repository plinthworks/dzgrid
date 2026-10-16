import type { KeyOwner } from '@dzgrid/core';

/** Who a key belongs to, from where it was pressed. The scroller itself counts as the focus cell (D5). */
export function ownerOf(target: EventTarget | null, viewport: HTMLElement): KeyOwner {
  const el = target as HTMLElement | null;
  if (!el || !viewport.contains(el)) return 'outside';
  if (el === viewport) return 'cell';
  if (el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return 'editor';
  if (el.closest('.dzg-hcell')) return 'header';
  if (el.closest('.dzg-cell')) return 'cell';
  return 'outside';
}

/** Cmd is the command key on Apple systems. */
export function isMac(nav: Navigator | undefined): boolean {
  if (!nav) return false;
  const platform = (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? nav.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}
