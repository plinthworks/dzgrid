import { fold } from '@dzgrid/core';
import { el, tx } from '../dom.js';

/** A row of the list: a value (`v`), or the blanks (`v` null). */
export interface Row {
  readonly v: string | null;
  readonly label: string;
  /** The count shown ('' when none), and the option's name. */
  readonly count: string;
  readonly name: string;
}

export interface ListView {
  readonly el: HTMLElement;
  /** New rows (a new answer, a search, a locale): the focused row is kept, or the nearest one. */
  set(rows: readonly Row[], home?: boolean): void;
  /** The ticks changed: `aria-selected` again. */
  paint(): void;
  /** The row height again (a locale or font change). */
  measure(): void;
  focus(): void;
}

export interface ListHooks {
  ticked(r: Row): boolean;
  toggle(r: Row): void;
  /** The focused row left and none is left: where the focus goes. */
  empty(): void;
}

/** Rows drawn above and below the view. */
const OVER = 6;

/**
 * The value list (docs/behaviors/filter-set.md "The list", "Always windowed", "Keys"): a
 * `listbox`, `aria-multiselectable`, its options absolutely placed over a spacer of the full
 * height, only those in view (plus `OVER` each side) in the page; the active option (roving
 * `tabindex`) is never recycled. Keys as WAI-ARIA's listbox: arrows, Home / End, Page keys,
 * Space / Enter tick, type-ahead within 500 ms on folded text (the core's `fold`: no case, accents,
 * Arabic short vowels or tatweel, one alef).
 */
export function listView(doc: Document, o: ListHooks): ListView {
  const list = el(doc, 'div', 'dzg-flist');
  const space = el(doc, 'div', 'dzg-fspace');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-multiselectable', 'true');
  space.setAttribute('aria-hidden', 'true');
  list.append(space);
  let rows: readonly Row[] = [];
  /** The labels folded, once per list, at the first type-ahead. */
  let keys: string[] | null = null;
  /** Drawn options by row (value or null), and each one's index. */
  let nodes = new Map<string | null, HTMLElement>();
  const at = new Map<HTMLElement, number>();
  let active = -1;
  let h = 28;
  /** The row height was read from a drawn row (it is 1.75rem: the root's font decides). */
  let sized = false;
  let buf = '';
  let last = 0;
  const view = (): number => list.clientHeight || 10 * h;
  const shown = (): number => Math.max(1, Math.floor(view() / h));
  const focused = (): boolean => list.contains(doc.activeElement);

  const option = (): HTMLElement => {
    const x = el(doc, 'div', 'dzg-fopt');
    x.setAttribute('role', 'option');
    const box = el(doc, 'span', 'dzg-box');
    box.setAttribute('aria-hidden', 'true');
    const name = el(doc, 'span', 'dzg-fname');
    name.dir = 'auto';
    const count = el(doc, 'span', 'dzg-fcount');
    // Its number is in the option's name ("Oran, 12 rows"), and drawn by CSS from `data-n`: the
    // visible text is the label alone, so the name holds it (label in name, WCAG 2.5.3).
    count.setAttribute('aria-hidden', 'true');
    x.append(box, name, count);
    return x;
  };
  const attr = (x: Element, k: string, v: string): void => {
    if (x.getAttribute(k) !== v) x.setAttribute(k, v);
  };

  function render(): void {
    const n = rows.length;
    space.style.blockSize = n * h + 'px';
    const top = Math.floor(list.scrollTop / h);
    const from = Math.max(0, top - OVER);
    const to = Math.min(n, top + shown() + OVER);
    const want = new Set<number>();
    for (let i = from; i < to; i++) want.add(i);
    if (active >= 0) want.add(active);
    const keep = new Map<string | null, HTMLElement>();
    for (const i of want) {
      const r = rows[i]!;
      const x = nodes.get(r.v) ?? option();
      keep.set(r.v, x);
      at.set(x, i);
    }
    for (const [v, x] of nodes) if (keep.get(v) !== x) x.remove(), at.delete(x);
    nodes = keep;
    // In index order; a node already placed never moves (the focused one would lose the focus).
    for (const i of [...want].sort((a, b) => a - b)) {
      const r = rows[i]!;
      const x = nodes.get(r.v)!;
      if (!x.isConnected) {
        let next: Element | null = space.nextElementSibling;
        while (next && at.get(next as HTMLElement)! < i) next = next.nextElementSibling;
        list.insertBefore(x, next);
      }
      x.style.insetBlockStart = i * h + 'px';
      attr(x, 'aria-posinset', String(i + 1));
      attr(x, 'aria-setsize', String(n));
      attr(x, 'aria-selected', String(o.ticked(r)));
      attr(x, 'aria-label', r.name);
      x.tabIndex = i === active ? 0 : -1;
      const [, name, count] = x.children as unknown as HTMLElement[];
      tx(name!, r.label);
      if (name!.title !== r.label) name!.title = r.label;
      attr(count!, 'data-n', r.count);
    }
    if (!sized) {
      const m = nodes.values().next().value?.getBoundingClientRect().height;
      if (m) {
        sized = true;
        if (m !== h) (h = m), render();
      }
    }
  }

  /** The active row moves to `i` (clamped), scrolled into view and focused. */
  function move(i: number): void {
    if (!rows.length) return;
    active = Math.max(0, Math.min(rows.length - 1, i));
    const y = active * h;
    if (y < list.scrollTop) list.scrollTop = y;
    else if (y + h > list.scrollTop + view()) list.scrollTop = y + h - view();
    render();
    nodes.get(rows[active]!.v)!.focus({ preventScroll: true });
  }

  const toggle = (i: number): void => {
    o.toggle(rows[i]!);
    render();
  };

  /**
   * Type-ahead: the next label starting with what was typed in the last 500 ms, both folded (a
   * decomposed é, a vowel mark, أ / إ / آ for ا); one letter again and again cycles. Typed text
   * that folds to nothing (a lone vowel mark) moves nowhere.
   */
  function find(ch: string): void {
    const now = Date.now();
    if (now - last > 500) buf = '';
    last = now;
    const same = !!buf && [...buf].every((c) => c === ch);
    buf += ch;
    const q = fold(same ? ch : buf);
    const n = q ? rows.length : 0;
    keys ??= rows.map((r) => fold(r.label));
    for (let k = 0, from = buf.length === 1 || same ? active + 1 : active; k < n; k++) {
      const i = (from + k) % n;
      if (keys[i]!.startsWith(q)) return move(i);
    }
  }

  list.addEventListener('keydown', (e) => {
    const k = e.key;
    const page = shown() - 1;
    const go: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: rows.length - 1, PageDown: active + page, PageUp: active - page };
    if (e.altKey || e.metaKey || (e.ctrlKey && k !== 'Home' && k !== 'End')) return;
    if (k in go) move(go[k]!);
    else if ((k === ' ' || k === 'Enter') && active >= 0) toggle(active);
    else if (k.length === 1 && k !== ' ') find(k);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  list.addEventListener('click', (e) => {
    const x = (e.target as Element).closest<HTMLElement>('[role=option]');
    const i = x ? at.get(x) : undefined;
    if (i === undefined) return;
    active = i;
    toggle(i);
    x!.focus({ preventScroll: true });
  });
  list.addEventListener('scroll', render);

  return {
    el: list,
    set(next, home = false) {
      const had = focused();
      const was = rows[active];
      const old = active;
      rows = next;
      keys = null;
      // The rows' order may have changed: nothing drawn is kept but the focused one.
      for (const [v, x] of nodes) if (!(had && was && v === was.v)) x.remove(), at.delete(x), nodes.delete(v);
      const i = was && !home ? next.findIndex((r) => r.v === was.v) : -1;
      active = i >= 0 ? i : !next.length ? -1 : old >= 0 && !home ? Math.min(old, next.length - 1) : Math.max(0, next.findIndex(o.ticked));
      if (was && was !== next[active] && i < 0) {
        nodes.get(was.v)?.remove();
        nodes.delete(was.v);
      }
      render();
      if (had && !focused()) active >= 0 ? move(active) : o.empty();
    },
    paint: render,
    measure() {
      sized = false;
      render();
    },
    focus: () => (active >= 0 ? move(active) : o.empty()),
  };
}
