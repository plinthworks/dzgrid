import { fold, type EnumOption } from '@dzgrid/core';
import { inlineApart } from '../dir.js';
import { popupsFor, type PopupRef } from '../popup.js';
import { setAttr } from '../render/write.js';
import type { Ed, EdEnv } from '../editors/index.js';

let uid = 0;

/**
 * The list editor (editors.md 12–17, step06-plan « Behaviour » 12–17; owner S6-O2: an APG select-only combobox):
 * the combobox in the cell keeps the focus; its listbox in a non-modal popup under the cell (above when no room),
 * the active option by `aria-activedescendant`. Keys: Up/Down, Home/End, PageUp/PageDown (clamped); letters within
 * 500 ms make a folded prefix, the same letter again cycles; Space picks and keeps (a letter during a prefix); a
 * press on an option picks and keeps. A value not among the options comes first, marked. `done(move)` keeps. A blur
 * keeps the active option: unmoved, it is the cell's own value (nothing saved, Q5).
 * Its own entry, `@dzgrid/dom/editors-list` (owner S6-O7): an application with list columns hands it to
 * `editors({ list: listEditor })`; one without pays nothing for it.
 */
export function listEditor(x: EdEnv, value: unknown, opts: readonly EnumOption[], label: (v: unknown) => string, name: string, done: (move: boolean) => void): Ed {
  const { g } = x;
  const doc = g.doc;
  const id = `dzg-lb${++uid}`;
  const root = doc.createElement('div');
  root.className = 'dzg-field dzg-combo';
  root.tabIndex = -1;
  const a = (n: string, v: string): void => root.setAttribute(n, v);
  a('role', 'combobox');
  a('aria-haspopup', 'listbox');
  a('aria-controls', id);
  a('aria-label', name);
  a('dir', 'auto');
  const items = [
    ...(value != null && !opts.some((o) => o.value === value) ? [{ value, label: x.msg('edit.optionNotInList', { label: label(value) }), out: true }] : []),
    ...opts.map((o) => ({ value: o.value as unknown, label: o.label ?? label(o.value), out: false })),
  ];
  const lb = doc.createElement('div');
  lb.id = id;
  lb.className = 'dzg-listbox';
  lb.setAttribute('role', 'listbox');
  lb.setAttribute('aria-label', name);
  const els = items.map((it, i) => {
    const o = doc.createElement('div');
    o.id = `${id}-${i}`;
    o.className = it.out ? 'dzg-opt dzg-opt--out' : 'dzg-opt';
    o.setAttribute('role', 'option');
    o.setAttribute('aria-selected', String(it.value === value));
    o.setAttribute('dir', 'auto');
    o.textContent = it.label;
    return o;
  });
  lb.append(...els);
  let at = items.findIndex((it) => it.value === value);
  let buf = '';
  let last = -1e9;
  let pop: PopupRef | null = null;
  const set = (i: number): void => {
    // No options (an empty list): nothing to move to (review R1).
    if (!items.length) return;
    at = Math.max(0, Math.min(items.length - 1, i));
    // The active option is the selected one (APG select-only combobox, review R2).
    els.forEach((o, j) => (o.classList.toggle('dzg-opt--active', j === at), o.setAttribute('aria-selected', String(j === at))));
    a('aria-activedescendant', els[at]!.id);
    root.textContent = items[at]!.label;
    // Into the list's view only (never the page).
    const o = els[at]!;
    if (o.offsetTop < lb.scrollTop) lb.scrollTop = o.offsetTop;
    else if (o.offsetTop + o.offsetHeight > lb.scrollTop + lb.clientHeight) lb.scrollTop = o.offsetTop + o.offsetHeight - lb.clientHeight;
  };
  const show = (): void => {
    if (pop) return;
    pop = popupsFor(g).open(root, lb, { placement: 'block-end', onClose: () => void ((pop = null), setAttr(root, 'aria-expanded', 'false')) });
    setAttr(root, 'aria-expanded', 'true');
    if (at >= 0) set(at);
  };
  /** The first option from `from` (cyclic) whose folded label starts with `q`. */
  const find = (q: string, from: number): void => {
    const f = fold(q);
    for (let i = 0; i < items.length; i++) {
      const j = (Math.max(from, 0) + i) % items.length;
      if (fold(items[j]!.label).startsWith(f)) return set(j);
    }
  };
  const type = (ch: string): void => {
    const now = g.now();
    if (now - last > 500) buf = '';
    last = now;
    buf += ch;
    const cs = [...buf];
    // The same letter again: the next option starting with it; else the prefix from the active option.
    if (cs.every((c) => c === cs[0])) find(cs[0]!, at + 1);
    else find(buf, at);
  };
  const keep = (e: Event): void => e.preventDefault();
  lb.addEventListener('pointerdown', keep);
  lb.addEventListener('mousedown', keep);
  lb.addEventListener('click', (e) => {
    const i = els.indexOf((e.target as Element).closest?.('[role=option]') as HTMLDivElement);
    if (i >= 0) set(i), done(false);
  });
  root.textContent = at >= 0 ? items[at]!.label : '';
  setAttr(root, 'aria-expanded', 'false');
  const input = () => (at < 0 ? undefined : { value: items[at]!.value });
  return {
    root,
    focus: root,
    input,
    ready(seed) {
      show();
      if (seed) type(seed);
    },
    keys(e) {
      const k = e.key;
      if (e.ctrlKey || e.metaKey) return false;
      if (e.altKey) return k === 'ArrowDown' && (show(), true);
      const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[k];
      if (!pop && step) return show(), true;
      if (step) set((at < 0 && step > 0 ? -1 : at) + step);
      else if (k === 'Home' || k === 'End') set(k === 'Home' ? 0 : items.length - 1);
      else if (k === 'Backspace') (buf = [...buf].slice(0, -1).join('')), buf && find(buf, at);
      else if (k === ' ' && !(buf && g.now() - last <= 500)) done(false);
      else if ([...k].length === 1) type(k);
      else return false;
      return true;
    },
    inside: (n) => !!pop?.el.contains(n),
    refused: () => pop?.close(),
    place() {
      if (!pop) return;
      // Hidden while the cell is out of the grid's view (the list follows it back).
      const r = root.getBoundingClientRect();
      const v = g.el.viewport.getBoundingClientRect();
      pop.el.hidden = r.bottom <= v.top || r.top >= v.bottom || inlineApart(r, v);
      pop.reposition();
    },
    drop: () => pop?.close(),
  };
}
