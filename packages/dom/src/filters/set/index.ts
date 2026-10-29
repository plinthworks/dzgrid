import { fold, formattersFor, problem, type ProblemCode, type SetValue } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { mounted, Mounted } from '@dzgrid/dom/internal';
import type { GridContext } from '../../context.js';
import type { Part, SlotContext } from '../../part.js';
import { el, labelled, tx } from '../dom.js';
import type { Body, Changed, F } from '../forms.js';
import type { notice } from '@dzgrid/dom/internal';
import { draftOf, filterOf, only, settle, tick, ticked, type Draft, type SetFilter } from './draft.js';
import { listView, type Row } from './list.js';

type C = SlotContext['filter'];
type OC = SlotContext['filterOption'];

/** The chunk's own layout, injected by the eager part when it loads (with the grid's nonce). */
export { SET_CSS as css } from './styles.js';

/**
 * The set filter's fields (docs/behaviors/filter-set.md), the lazy chunk of `filter.set`: a search
 * box, a status line, select all (shown), and the windowed list, drawn from the draft, never from
 * the stored filter. The column's values handle is opened here and closed in `destroy`. In the
 * browser the search goes to the handle at once and the ticks to `changed` (the form's pause); on a
 * server the search after the pause, never inside an input method, and the ticks wait for Apply.
 * `note`: the eager part's loading / failure helper (`lazy.ts`), and `mount` its part mounter (`mounted`, for the option
 * rows' parts), handed in so the chunk does not carry its own nor split the internal entry out of the page's bundle.
 */
export function body(get: () => C, doc: Document, changed: Changed, note: typeof notice, g: GridContext<unknown>, mount: typeof mounted): Omit<Body, 'edits'> {
  const h = get().values();
  // The column's option-row part (feedback pass C): a `filterOption` part by name; another name is unknown-part.
  // Said at each opening of the popup.
  const col = get().column;
  const fo = col.def.filter || {};
  const pn = fo.optionPart;
  const sp = pn && g.parts()[pn];
  const part = sp && sp.slot === 'filterOption' ? (sp.part as Part<OC>) : null;
  const say = (k: string, v: unknown, code: ProblemCode = 'invalid-setting', s: 'error' | 'warning' = 'warning') => emit(g.kernel, { type: 'problems', source: 'host', problems: [problem(code, s, `columns.${col.id}.filter.${k}`, String(v))] });
  if (pn && !part) say('optionPart', pn, 'unknown-part', 'error');
  // Starting empty (filter-set.md « Starting empty »): read at each opening; another value is the default, told.
  const empty = fo.start === 'empty';
  const box = fo.selectAll !== false;
  if (!empty && fo.start && fo.start !== 'all') say('start', fo.start);
  if (box && fo.selectAll != null && fo.selectAll !== true) say('selectAll', fo.selectAll);
  /** One mounted part per drawn row node. */
  const ms = new Map<HTMLElement, Mounted<OC>>();
  let d: Draft = draftOf(null, empty);
  /** Include only (`filter.exclude: false`, read live: `columns.set` while open), and the last complete list shown. */
  // `filter` may be false: `false.exclude` reads undefined.
  const ix = (): boolean => (get().column.def.filter as { exclude?: false } | undefined)?.exclude === false;
  let whole: readonly string[] | null = null;
  /** The search the list shows (asked, on a server after the pause): what select all and its label follow, not the box. */
  let sent = '';
  /** The filter written (`write`), and its canonical form: a draft equal to it reads as it, so Apply sends nothing. */
  let src: F | null = null;
  let canon = 'null';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let said: ReturnType<typeof setTimeout> | undefined;
  let typed = false;
  let rows: Row[] = [];
  let shown = '';
  /** The next draw starts the roving focus on the first ticked row (a draft written). */
  let home = true;
  const search = el(doc, 'input', 'dzg-fsearch dzg-finput');
  search.type = 'text';
  search.autocomplete = 'off';
  search.dir = 'auto';
  search.setAttribute('spellcheck', 'false');
  const status = el(doc, 'p', 'dzg-fstatus');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const all = el(doc, 'input', 'dzg-fall');
  all.type = 'checkbox';
  const [la, sa] = labelled(doc, all);
  la.className = 'dzg-fallw';
  la.append(sa);
  const wrap = el(doc, 'div', 'dzg-flistw');
  const fmt = () => formattersFor(get().ctx).number();
  const on = (r: Row): boolean => (r.v === null ? d.blanks : ticked(d, r.v));
  const flip = (r: Row): void => {
    if (r.v === null) d.blanks = !d.blanks;
    else tick(d, r.v, !on(r));
    edit();
  };
  const list = listView(doc, {
    ticked: on,
    toggle: flip,
    empty: () => search.focus(),
    ...(part && {
      paint(x: HTMLElement, r: Row) {
        let m = ms.get(x);
        if (!m) ms.set(x, (m = mount<OC>(g)));
        // Drawn by the part, or (it threw) by the grid: the default row shows again.
        x.toggleAttribute('data-part', m.set(x.children[1] as HTMLElement, part, { value: r.v, label: r.label, count: r.n, countText: r.count, selected: on(r), blank: r.v === null, column: col, toggle: () => flip(r) }));
      },
      gone(x: HTMLElement) {
        ms.get(x)?.clear();
        ms.delete(x);
      },
    }),
  });
  wrap.append(list.el);
  let noted = '';
  const n = note(doc, wrap, () => (search.focus(), h.refresh()), (w) => get().msg(w === 'load' ? 'grid.loading' : 'filter.set.failed'), () => get().msg('grid.retry'), list.el);

  /** The list the handle gives, or the column's options when it has none (searched here). */
  const values = (): readonly SetValue[] => {
    if (h.available) return h.result?.values ?? [];
    const words = fold(sent).split(/\s+/).filter(Boolean);
    return (get().column.def.enumOptions ?? []).map((x) => ({ value: x.value, label: x.label ?? x.value, count: null })).filter((x) => words.every((w) => fold(x.label).includes(w)));
  };
  /**
   * A complete list (the half rule may change the mode), unsearched: the column's options when the
   * handle has no list; else settled (an older searched list may still show) and not truncated.
   */
  const complete = (): readonly string[] | null =>
    sent ? null : !h.available ? values().map((x) => x.value) : h.status === 'idle' && h.result && !h.result.truncated ? h.result.values.map((x) => x.value) : null;

  function draw(): void {
    const c = get();
    const r = h.result;
    const vs = values();
    whole = complete() ?? whole;
    const blanks = h.available ? (r?.blanks ?? null) : null;
    const counted = vs.some((x) => x.count !== null) || blanks !== null;
    const f = fmt();
    const row = (v: string | null, label: string, count: number | null): Row => ({
      v, label, count: counted && count !== null ? f(count) : '', n: count,
      name: count === null ? label : c.msg('filter.set.option', { label, rows: c.msg('announce.rows', { n: count }) }),
    });
    const marked = d.mode === 'include' ? d.blanks : !d.blanks;
    const any = !h.available || !!r;
    rows = [
      ...(!ix() && any && !sent && (blanks !== 0 || marked) ? [row(null, c.msg('filter.set.blanks'), blanks)] : []),
      ...vs.map((x) => row(x.value, x.label, x.count)),
    ];
    list.set(rows, home);
    home = false;
    // The list's state: loading with nothing (the line), loading over an older list (busy), failed.
    const now = h.status === 'loading' && !any ? 'load' : h.status === 'error' ? 'fail' : '';
    if (now !== noted) (noted = now) ? n.say(now) : n.stop();
    if (h.status === 'loading') list.el.setAttribute('aria-busy', 'true');
    else if (now !== 'load') list.el.removeAttribute('aria-busy');
    const text = r?.truncated ? c.msg('filter.set.truncated', { n: vs.length }) : c.msg('filter.set.count', { n: vs.length });
    clearTimeout(said);
    // After a search, said once the list settles; otherwise written at once.
    if (typed && any) said = setTimeout(() => tx(status, text), c.debounceMs);
    else if (any) tx(status, text);
    typed = false;
    boxes();
  }
  /** Select all: over the rows shown (blanks included when shown), checked, unchecked or mixed. */
  function boxes(): void {
    const on = rows.filter((r) => (r.v === null ? d.blanks : ticked(d, r.v))).length;
    all.checked = !!rows.length && on === rows.length;
    all.indeterminate = on > 0 && on < rows.length;
  }
  /** A tick: the half rule on a complete list, then the form's pause (or the draft on a server). */
  function edit(): void {
    ix() ? only(d, complete() ?? whole, whole ?? values().map((x) => x.value), empty) : settle(d, complete(), h.available && h.result?.blanks === 0);
    list.paint();
    boxes();
    changed(false, filterOf(d, empty) === null);
  }
  all.addEventListener('change', () => {
    const on = all.checked;
    // Over an unsearched list, select all takes the blanks too, shown or not (a hidden row at 0 now).
    if (!sent) d.blanks = on;
    for (const r of rows) if (r.v !== null) tick(d, r.v, on);
    edit();
  });
  const ask = (): void => {
    typed = true;
    clearTimeout(timer);
    const c = get();
    const go = (): void => {
      sent = search.value.trim();
      texts();
      if (h.available) h.search(sent);
      else draw();
    };
    if (c.where !== 'server' || !h.available) go();
    else timer = setTimeout(go, c.debounceMs);
  };
  search.addEventListener('input', (e) => !(e as InputEvent).isComposing && ask());
  search.addEventListener('compositionend', ask);
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' || e.altKey || e.isComposing) return;
    e.preventDefault();
    list.focus();
  });
  const stop = h.subscribe(draw);

  function texts(): void {
    const c = get();
    // A placeholder, no label above it (owner's look, app-feedback 18); the same words name it.
    const p = c.msg('filter.set.search');
    search.placeholder = p;
    search.setAttribute('aria-label', p);
    tx(sa, c.msg(sent ? 'filter.set.allShown' : 'filter.set.all'));
    const name = c.msg('filter.popupLabel', { column: c.column.def.header ?? c.column.id });
    if (list.el.getAttribute('aria-label') !== name) list.el.setAttribute('aria-label', name);
    n.words();
    const k = c.ctx.locale + c.ctx.numerals + c.msg('filter.set.count', { n: 2 });
    if (k !== shown) (shown = k), list.measure(), draw();
  }

  return {
    els: box ? [search, status, la, wrap] : [search, status, wrap],
    write(s: F | null) {
      const was = JSON.stringify(filterOf(d, empty));
      // Include only: an exclude or blanks stored from elsewhere (ignored, a problem) shows as no filter.
      d = draftOf((src = s) && !(ix() && ((s as SetFilter).exclude || (s as SetFilter).blanks)) ? (s as SetFilter) : null, empty);
      canon = JSON.stringify(filterOf(d, empty));
      // Another draft starts on its first ticked row; the same one written again (a locale change) keeps the focus.
      home ||= canon !== was;
      draw();
    },
    // The filter in force written in another order (a host's) is read as written: nothing to send.
    read() {
      const f = filterOf(d, empty) as F | null;
      return JSON.stringify(f) === canon ? src : f;
    },
    texts,
    // Called once the popup shows: the rows are measured there (a chunk drawn before it was shown).
    focus() {
      list.measure();
      search.focus();
    },
    destroy() {
      clearTimeout(timer);
      clearTimeout(said);
      stop();
      h.close();
      for (const m of ms.values()) m.clear();
    },
  };
}
