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

export const setPx = (el: HTMLElement, prop: string, v: number): void => {
  const s = `${v}px`;
  if (el.style.getPropertyValue(prop) !== s) el.style.setProperty(prop, s);
};
