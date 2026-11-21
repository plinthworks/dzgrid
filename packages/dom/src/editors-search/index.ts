import type { EnumOption, OptionSearch } from '@dzgrid/core';
import { inlineApart } from '../dir.js';
import { popupsFor, type PopupRef } from '../popup.js';
import { setAttr } from '../render/write.js';
import type { Ed, EdEnv, SearchEditor } from '../editors/index.js';
import type { FormsMessageKey } from '../part-texts.js';

let uid = 0;
/** What a search gives back: a promise, a list, or something with `subscribe` (an observable: its first value). */
type Answer = PromiseLike<readonly EnumOption[]> | readonly EnumOption[] | { subscribe(o: { next(v: readonly EnumOption[]): void; error(e: unknown): void }): { unsubscribe(): void } };

/**
 * The searching list (1.15.0, editors.md 23–29; APG combobox with list autocomplete): an editable combobox in the cell
 * that keeps the focus, its listbox in the simple list's popup. On opening and 250 ms after the last keystroke it asks
 * the column's `search(text, { signal, row, context })`; a newer ask aborts the one before and an older answer is
 * ignored. Loading, no result and failure are shown under the options and said politely. Up / Down move the active
 * option, Enter keeps it, Escape closes the list first. Only an option picked (key or pointer) is kept; else nothing
 * changes. Its own entry, `@dzgrid/dom/editors-search`: `editors({ search: searchEditor })`.
 */
/** The texts the searching list needs, from `@dzgrid/dom/locales/<lang>-forms`. */
export const SEARCH_KEYS = ['edit.searching', 'edit.noResult', 'edit.searchFailed'] as const satisfies readonly FormsMessageKey[];

export const searchEditor: SearchEditor = Object.assign(searchWith, { keys: SEARCH_KEYS });

function searchWith(x: EdEnv, value: unknown, search: OptionSearch<unknown>, label: (v: unknown) => string, name: string, done: (move: boolean) => void, row: unknown): Ed {
  const { g } = x;
  const msg = (k: 'edit.searching' | 'edit.noResult' | 'edit.searchFailed'): string => g.msg(k);
  const doc = g.doc;
  const id = `dzg-sb${++uid}`;
  const f = doc.createElement('input');
  f.className = 'dzg-field dzg-search-field';
  const a = (n: string, v: string): void => f.setAttribute(n, v);
  a('role', 'combobox');
  a('aria-autocomplete', 'list');
  a('aria-controls', id);
  a('aria-label', name);
  a('aria-expanded', 'false');
  a('autocomplete', 'off');
  a('dir', 'auto');
  f.value = value == null ? '' : label(value);
  const box = doc.createElement('div');
  box.className = 'dzg-search';
  const lb = doc.createElement('div');
  lb.id = id;
  lb.className = 'dzg-listbox';
  lb.setAttribute('role', 'listbox');
  lb.setAttribute('aria-label', name);
  const note = doc.createElement('div');
  note.className = 'dzg-search-note';
  box.append(lb, note);

  let items: { readonly value: unknown; readonly label: string }[] = [];
  let els: HTMLElement[] = [];
  let at = -1;
  /** An option was picked by a key or the pointer: only then is it kept. */
  let picked = false;
  let pop: PopupRef | null = null;
  let seq = 0;
  let stop: (() => void) | null = null;
  let wait: (() => void) | undefined;

  const say = (t: string): void => {
    note.textContent = t;
    note.hidden = !t;
    if (t) g.live.announce(t);
  };
  const show = (): void => {
    if (pop) return;
    pop = popupsFor(g).open(f, box, { placement: 'block-end', onClose: () => void ((pop = null), a('aria-expanded', 'false')) });
    a('aria-expanded', 'true');
  };
  const set = (i: number): void => {
    if (!items.length) return;
    at = Math.max(0, Math.min(items.length - 1, i));
    els.forEach((o, j) => (o.classList.toggle('dzg-opt--active', j === at), o.setAttribute('aria-selected', String(j === at))));
    a('aria-activedescendant', els[at]!.id);
    const o = els[at]!;
    if (o.offsetTop < lb.scrollTop) lb.scrollTop = o.offsetTop;
    else if (o.offsetTop + o.offsetHeight > lb.scrollTop + lb.clientHeight) lb.scrollTop = o.offsetTop + o.offsetHeight - lb.clientHeight;
  };
  const fill = (opts: readonly EnumOption[]): void => {
    items = opts.map((o) => ({ value: o?.value as unknown, label: o?.label ?? label(o?.value) }));
    els = items.map((it, i) => {
      const o = doc.createElement('div');
      o.id = `${id}-${i}`;
      o.className = 'dzg-opt';
      o.setAttribute('role', 'option');
      o.setAttribute('dir', 'auto');
      o.setAttribute('aria-selected', 'false');
      o.textContent = it.label;
      return o;
    });
    lb.replaceChildren(...els);
    at = -1;
    picked = false;
    f.removeAttribute('aria-activedescendant');
    // The cell's value among them: active, not picked (Enter keeps nothing new).
    const cur = items.findIndex((it) => it.value === value);
    if (cur >= 0) set(cur);
    setAttr(lb, 'aria-busy', null);
    say(items.length ? '' : msg('edit.noResult'));
  };
  /** Asks the application for `q` (editors.md 25): the ask before it aborted, its late answer ignored. */
  const ask = (q: string): void => {
    stop?.();
    const my = ++seq;
    const ac = new (g.win as Window & typeof globalThis).AbortController();
    let sub: { unsubscribe(): void } | null = null;
    let over = false;
    stop = () => {
      over = true;
      ac.abort();
      sub?.unsubscribe();
    };
    show();
    setAttr(lb, 'aria-busy', 'true');
    say(msg('edit.searching'));
    const ok = (v: unknown): void => {
      if (my !== seq || over) return;
      over = true;
      sub?.unsubscribe();
      Array.isArray(v) ? fill(v) : fail();
    };
    // An ask closed or aborted (its fetch rejects) says nothing (editors.md 25).
    const no = (): void => void (my === seq && !over && ((over = true), fail()));
    const fail = (): void => {
      items = els = [];
      lb.replaceChildren();
      at = -1;
      setAttr(lb, 'aria-busy', null);
      say(msg('edit.searchFailed'));
    };
    let r: Answer;
    try {
      r = search(q, { signal: ac.signal, row: row as never, context: g.settings.context }) as Answer; // the row as the column's type
    } catch {
      return no();
    }
    if (typeof (r as PromiseLike<unknown>)?.then == 'function') (r as PromiseLike<unknown>).then(ok, no);
    else if (typeof (r as { subscribe?: unknown })?.subscribe == 'function') {
      const s = (r as Extract<Answer, { subscribe: unknown }>).subscribe({ next: ok, error: no });
      // A first value told during `subscribe` itself: already over, unsubscribed now.
      over && my === seq ? s.unsubscribe() : (sub = s);
    } else ok(r);
  };

  const keep = (e: Event): void => e.preventDefault();
  box.addEventListener('pointerdown', keep);
  box.addEventListener('mousedown', keep);
  lb.addEventListener('click', (e) => {
    const i = els.indexOf((e.target as Element).closest?.('[role=option]') as HTMLDivElement);
    if (i >= 0) set(i), (picked = true), done(false);
  });
  f.addEventListener('input', () => {
    picked = false;
    wait?.();
    wait = g.scope.timeout(() => ask(f.value), 250);
  });

  return {
    root: f,
    focus: f,
    input: () => (picked && at >= 0 ? { value: items[at]!.value } : undefined),
    ready(seed) {
      if (seed) f.value = seed;
      else f.select();
      ask(f.value);
    },
    keys(e) {
      const k = e.key;
      if (e.ctrlKey || e.metaKey) return false;
      if (e.altKey) return k === 'ArrowDown' && (pop ? false : (ask(f.value), true));
      const step = { ArrowDown: 1, ArrowUp: -1 }[k];
      if (step) {
        if (!pop) ask(f.value);
        else set((at < 0 && step > 0 ? -1 : at) + step), (picked = at >= 0);
        return true;
      }
      if (k === 'Escape' && pop) return pop.close(), true;
      return false;
    },
    inside: (n) => !!pop?.el.contains(n),
    refused: () => pop?.close(),
    place() {
      if (!pop) return;
      const r = f.getBoundingClientRect();
      const v = g.el.viewport.getBoundingClientRect();
      pop.el.hidden = r.bottom <= v.top || r.top >= v.bottom || inlineApart(r, v);
      pop.reposition();
    },
    drop() {
      wait?.();
      stop?.();
      pop?.close();
    },
  };
}
