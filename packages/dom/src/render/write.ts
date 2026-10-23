/**
 * Guarded writes, shared by the base and the optional entries (no import, so
 * an entry using them pulls nothing else in): each compares what is there
 * first, so a paint where nothing changed touches nothing.
 */

/** Width of the selection box column. */
export const CHECK_WIDTH = 40;

export const setAttr = (el: Element, name: string, value: string | null): void => {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
};

/**
 * The host's classes on one of the grid's elements (cell-class.md): `next` replaces `was` token by token,
 * the grid's own (`dzg-`) and any other class left alone. Returns `next`, the new `was`.
 */
/** The host's class names in a string: split on any space, the grid's own (`dzg-`) left out. */
export const hostNames = (t: string): string[] => t.split(/\s+/).filter((c) => c && !c.startsWith('dzg-'));

export const swapClasses = (el: Element, was: string, next: string): string => {
  if (next !== was) {
    const add = hostNames(next);
    for (const c of hostNames(was)) if (!add.includes(c)) el.classList.remove(c);
    el.classList.add(...add);
  }
  return next;
};

export const setPx = (el: HTMLElement, prop: string, v: number): void => {
  const s = `${v}px`;
  if (el.style.getPropertyValue(prop) !== s) el.style.setProperty(prop, s);
};

/** Adds or removes one id in an element's `aria-describedby`, the others kept (the tooltip, the edit marks, Phase 5 step 4). */
export const describe = (el: Element, id: string, on: boolean): void => {
  const t = (el.getAttribute('aria-describedby') ?? '').split(' ').filter((x) => x && x !== id);
  if (on) t.push(id);
  setAttr(el, 'aria-describedby', t.join(' ') || null);
};
