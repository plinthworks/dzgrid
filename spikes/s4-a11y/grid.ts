/**
 * Spike-only virtualised grid (S4 accessibility, S10 focus vs recycling).
 * Written from WAI-ARIA APG (grid, treegrid) and first principles; no grid
 * library was read. Not production code: it exists to answer two questions.
 *
 * Contract under test (the "retained row"):
 *  - the row that holds the roving tab stop (the focused logical cell, by
 *    RowKey) is always mounted, whether or not it is inside the window and
 *    whether or not the grid currently has DOM focus;
 *  - it stays at its true layout position (translateY of its display index),
 *    so it is clipped by the scroll container, never hidden by CSS/ARIA;
 *  - its node is NEVER moved, detached or rebound to another key while
 *    retained: the other rows are inserted around it, in display order, so DOM
 *    order always equals aria-rowindex order.
 */

export type Dir = 'ltr' | 'rtl';
export interface Column { id: string; header: string; width: number; rowHeader?: boolean; editable?: boolean; numeric?: boolean }
export interface Row { id: string; parent?: string | null; [k: string]: unknown }
export interface Messages {
  gridLabel: string;
  sorted(col: string, dir: 'ascending' | 'descending', n: number): string;
  unsorted(n: number): string;
  filtered(n: number): string;
  page(p: number, pages: number, from: number, to: number, n: number): string;
  detailOf(name: string): string;
  expanded(name: string, n: number): string;
  collapsed(name: string): string;
}
export interface GridOptions {
  columns: Column[];
  rows: Row[];
  dir: Dir;
  lang: string;
  messages: Messages;
  mode?: 'grid' | 'treegrid';
  detail?: (row: Row) => string | null;   // master/detail: text of the detail row, null = no detail
  openDetails?: string[];                  // master keys whose detail is open at start
  collapsed?: string[];                    // tree: parent keys collapsed at start
  rowHeight?: number;
  detailHeight?: number;
  overscan?: number;
  retain?: boolean;                        // false = naive recycling (baseline for S10)
  layout?: 'proposed' | 'arch';            // 'arch' = §3.7 tree as written (role=grid on the wrapper)
  renderCols?: number[];                   // column virtualisation stand-in: indices actually rendered
  pageSize?: number;
  scrollerTabIndex?: boolean;              // false = leave the scroll container without tabindex (Firefox check)
}

type Entry = { key: string; kind: 'data' | 'detail'; row: Row; level: number; setsize: number; posinset: number; hasChildren: boolean };
type View = { el: HTMLElement; kind: 'data' | 'detail'; key: string; cells: Map<string, HTMLElement> };
const HEADER = '__header';
const HEADER_ROWS = 1;

const CSS = `
.g-wrap{--g-bg:var(--s-bg,#fff);--g-fg:var(--s-fg,#1a1a1a);--g-line:var(--s-line,#c8c8c8);--g-head:var(--s-head,#eef0f3);--g-focus:var(--s-focus,#0b57d0);
  font:14px/1.3 system-ui,sans-serif;color:var(--g-fg);background:var(--g-bg)}
.g-vp{position:relative;block-size:640px;inline-size:900px;overflow:auto;overflow-anchor:none;border:1px solid var(--g-line);background:var(--g-bg)}
.g-head{position:sticky;inset-block-start:0;z-index:2;background:var(--g-head)}
.g-body{position:relative}
.g-row{position:absolute;inset-inline-start:0;display:flex;box-sizing:border-box;border-block-end:1px solid var(--g-line);background:var(--g-bg)}
.g-head .g-row{position:relative;background:var(--g-head)}
.g-cell{box-sizing:border-box;padding-inline:8px;display:flex;align-items:center;overflow:hidden;white-space:nowrap;unicode-bidi:isolate;text-align:start;flex:none}
.g-cell[data-num]{justify-content:flex-end}
.g-cell:focus{outline:2px solid var(--g-focus);outline-offset:-2px}
.g-cell input{inline-size:100%;font:inherit}
.g-chev{display:inline-block;inline-size:16px;flex:none}
.g-detail .g-cell{white-space:normal}
.g-live{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`;

export function createGrid(host: HTMLElement, o: GridOptions) {
  const rowH = o.rowHeight ?? 32, detH = o.detailHeight ?? 96, overscan = o.overscan ?? 6;
  const retain = o.retain ?? true, tree = o.mode === 'treegrid';
  const cols = (o.renderCols ?? o.columns.map((_, i) => i)).map((i) => ({ ...o.columns[i]!, colindex: i + 1 }));
  const col0 = cols[0]!;
  const colById = new Map(cols.map((c) => [c.id, c]));
  const collator = new Intl.Collator(o.lang, { numeric: true });
  let source = o.rows.slice();
  let sort: { col: string; dir: 'ascending' | 'descending' } | null = null;
  let filter: ((r: Row) => boolean) | null = null;
  let page = 0;
  const openDetails = new Set(o.openDetails ?? []);
  const collapsed = new Set(o.collapsed ?? []);
  const edits = new Map<string, Map<string, string>>();
  let entries: Entry[] = [];
  let indexOf = new Map<string, number>();
  let offsets = new Float64Array(1);
  let focus = { key: '', col: col0.id };
  let editor: { key: string; col: string; input: HTMLInputElement; closing: boolean } | null = null;
  const views = new Map<string, View>();
  const pool: Record<'data' | 'detail', View[]> = { data: [], detail: [] };
  const log = { announcements: [] as string[], renders: 0, moves: 0 };

  if (!document.getElementById('g-css')) {
    const s = document.createElement('style'); s.id = 'g-css'; s.textContent = CSS; document.head.append(s);
  }

  // ---- DOM skeleton ---------------------------------------------------------
  const wrap = document.createElement('div');
  wrap.className = 'g-wrap'; wrap.dir = o.dir; wrap.lang = o.lang;
  const vp = document.createElement('div'); vp.className = 'g-vp';
  const grid = o.layout === 'arch' ? wrap : vp;          // who carries role=grid
  // Firefox puts a scroll container in the Tab order even when it holds a tabindex=0 cell: take it out.
  if (o.layout === 'arch' || o.scrollerTabIndex !== false) vp.tabIndex = -1;
  grid.setAttribute('role', tree ? 'treegrid' : 'grid');
  grid.setAttribute('aria-label', o.messages.gridLabel);
  grid.setAttribute('aria-colcount', String(o.columns.length));
  grid.setAttribute('aria-readonly', String(!o.columns.some((c) => c.editable)));
  grid.setAttribute('aria-multiselectable', 'false');
  const head = document.createElement('div'); head.className = 'g-head'; head.setAttribute('role', 'rowgroup');
  const headRow = document.createElement('div'); headRow.className = 'g-row'; headRow.setAttribute('role', 'row');
  headRow.setAttribute('aria-rowindex', '1');
  const headCells = new Map<string, HTMLElement>();
  let width = 0;
  for (const c of cols) {
    const h = document.createElement('div');
    h.className = 'g-cell'; h.setAttribute('role', 'columnheader'); h.setAttribute('aria-colindex', String(c.colindex));
    h.id = `g-h-${c.id}-${Math.random().toString(36).slice(2, 7)}`;
    h.dataset.col = c.id; h.tabIndex = -1; h.style.inlineSize = c.width + 'px'; h.style.blockSize = rowH + 'px';
    h.textContent = c.header;
    headRow.append(h); headCells.set(c.id, h); width += c.width;
  }
  headRow.style.inlineSize = width + 'px';
  head.append(headRow);
  const body = document.createElement('div'); body.className = 'g-body'; body.setAttribute('role', 'rowgroup');
  body.style.inlineSize = width + 'px';
  const live = document.createElement('div'); live.className = 'g-live';
  live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  vp.append(head, body);
  wrap.append(vp);
  if (o.layout === 'arch') { const f = document.createElement('div'); f.textContent = '—'; wrap.append(f, live); }
  host.append(wrap);
  if (o.layout !== 'arch') host.append(live);              // live region OUTSIDE role=grid

  // ---- model ----------------------------------------------------------------
  const value = (r: Row, col: string) => edits.get(r.id)?.get(col) ?? String(r[col] ?? '');
  function compare(a: Row, b: Row) {
    if (!sort) return 0;
    const c = colById.get(sort.col) ?? o.columns.find((x) => x.id === sort!.col)!;
    const d = c.numeric ? Number(value(a, c.id)) - Number(value(b, c.id)) : collator.compare(value(a, c.id), value(b, c.id));
    return sort.dir === 'ascending' ? d : -d;
  }
  function compute() {
    const out: Entry[] = [];
    if (tree) {
      const kids = new Map<string | null, Row[]>();
      for (const r of source) { const p = r.parent ?? null; (kids.get(p) ?? kids.set(p, []).get(p)!).push(r); }
      for (const list of kids.values()) list.sort(compare);
      const walk = (p: string | null, level: number) => {
        const list = kids.get(p) ?? [];
        list.forEach((r, i) => {
          const has = (kids.get(r.id)?.length ?? 0) > 0;
          out.push({ key: r.id, kind: 'data', row: r, level, setsize: list.length, posinset: i + 1, hasChildren: has });
          if (has && !collapsed.has(r.id)) walk(r.id, level + 1);
        });
      };
      walk(null, 1);
    } else {
      let list = filter ? source.filter(filter) : source.slice();
      list.sort(compare);
      if (o.pageSize) list = list.slice(page * o.pageSize, (page + 1) * o.pageSize);
      for (const r of list) {
        out.push({ key: r.id, kind: 'data', row: r, level: 1, setsize: 0, posinset: 0, hasChildren: false });
        if (o.detail && openDetails.has(r.id) && o.detail(r) != null)
          out.push({ key: 'detail:' + r.id, kind: 'detail', row: r, level: 1, setsize: 0, posinset: 0, hasChildren: false });
      }
    }
    entries = out;
    indexOf = new Map(out.map((e, i) => [e.key, i]));
    offsets = new Float64Array(out.length + 1);
    for (let i = 0; i < out.length; i++) offsets[i + 1] = offsets[i]! + (out[i]!.kind === 'detail' ? detH : rowH);
    body.style.blockSize = offsets[out.length]! + 'px';
    grid.setAttribute('aria-rowcount', String(HEADER_ROWS + out.length));
    for (const [id, h] of headCells) {
      if (sort?.col === id) h.setAttribute('aria-sort', sort.dir); else h.removeAttribute('aria-sort');
    }
  }
  function indexAt(y: number) {
    let lo = 0, hi = entries.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (offsets[m]! <= y) lo = m; else hi = m - 1; }
    return lo;
  }

  // ---- views ----------------------------------------------------------------
  function create(kind: 'data' | 'detail'): View {
    const el = document.createElement('div');
    el.className = 'g-row' + (kind === 'detail' ? ' g-detail' : ''); el.setAttribute('role', 'row');
    el.style.inlineSize = width + 'px';
    const cells = new Map<string, HTMLElement>();
    if (kind === 'detail') {
      const c = document.createElement('div'); c.className = 'g-cell'; c.setAttribute('role', 'gridcell');
      c.setAttribute('aria-colindex', '1'); c.setAttribute('aria-colspan', String(o.columns.length));
      c.dataset.col = col0.id; c.tabIndex = -1; c.style.inlineSize = width + 'px';
      el.append(c); cells.set(col0.id, c);
    } else {
      for (const col of cols) {
        const c = document.createElement('div'); c.className = 'g-cell';
        c.setAttribute('role', col.rowHeader ? 'rowheader' : 'gridcell');
        c.setAttribute('aria-colindex', String(col.colindex)); c.dataset.col = col.id; c.tabIndex = -1;
        if (col.numeric) c.dataset.num = '';
        if (!col.editable) c.setAttribute('aria-readonly', 'true');
        c.style.inlineSize = col.width + 'px';
        if (tree && col === col0) { const ch = document.createElement('span'); ch.className = 'g-chev'; ch.setAttribute('aria-hidden', 'true'); c.append(ch); }
        const t = document.createElement('span'); t.className = 't'; c.append(t);
        el.append(c); cells.set(col.id, c);
      }
    }
    return { el, kind, key: '', cells };
  }
  function bind(v: View, e: Entry, i: number) {
    v.key = e.key;
    v.el.dataset.key = e.key;
    v.el.setAttribute('aria-rowindex', String(HEADER_ROWS + i + 1));
    v.el.style.transform = `translateY(${offsets[i]!}px)`;
    v.el.style.blockSize = (offsets[i + 1]! - offsets[i]!) + 'px';
    if (v.kind === 'detail') {
      const c = v.cells.get(col0.id)!;
      c.textContent = o.messages.detailOf(value(e.row, col0.id)) + ' ' + o.detail!(e.row);
      return;
    }
    if (tree) {
      v.el.setAttribute('aria-level', String(e.level));
      v.el.setAttribute('aria-setsize', String(e.setsize));
      v.el.setAttribute('aria-posinset', String(e.posinset));
      if (e.hasChildren) v.el.setAttribute('aria-expanded', String(!collapsed.has(e.key))); else v.el.removeAttribute('aria-expanded');
    }
    for (const col of cols) {
      const c = v.cells.get(col.id)!;
      if (editor && editor.key === e.key && editor.col === col.id) continue;   // never touch an open editor
      const t = c.querySelector('.t')!;
      const txt = value(e.row, col.id);
      if (t.textContent !== txt) t.textContent = txt;
      if (tree && col === col0) {
        c.style.paddingInlineStart = (8 + (e.level - 1) * 16) + 'px';
        (c.firstChild as HTMLElement).textContent = e.hasChildren ? (collapsed.has(e.key) ? '▸' : '▾') : '';
      }
      if (o.detail && col === col0) {
        if (o.detail(e.row) != null) c.setAttribute('aria-expanded', String(openDetails.has(e.key))); else c.removeAttribute('aria-expanded');
      }
    }
  }

  // ---- render ---------------------------------------------------------------
  let tabStop: HTMLElement | null = null;
  function render() {
    log.renders++;
    const st = vp.scrollTop, ch = vp.clientHeight, hh = head.offsetHeight;
    const desired = new Map<string, number>();
    if (entries.length) {
      const first = Math.max(0, indexAt(st) - overscan);
      const last = Math.min(entries.length - 1, indexAt(st + Math.max(0, ch - hh)) + overscan);
      for (let i = first; i <= last; i++) desired.set(entries[i]!.key, i);
    }
    let retained: string | null = null;
    if (retain && focus.key !== HEADER && indexOf.has(focus.key) && !desired.has(focus.key)) {
      desired.set(focus.key, indexOf.get(focus.key)!); retained = focus.key;
    }
    for (const [key, v] of views) if (!desired.has(key)) { v.el.remove(); pool[v.kind].push(v); views.delete(key); }
    for (const [key, i] of desired) {
      const e = entries[i]!;
      let v = views.get(key);
      if (v && v.kind !== e.kind) { v.el.remove(); pool[v.kind].push(v); v = undefined; }
      if (!v) { v = pool[e.kind].pop() ?? create(e.kind); views.set(key, v); }
      bind(v, e, i);
    }
    const ordered = [...desired].sort((a, b) => a[1] - b[1]).map(([k]) => views.get(k)!);
    arrange(ordered, retain ? views.get(focus.key) ?? null : null);
    body.dataset.retainedKey = retained ?? '';
    for (const v of views.values()) v.el.toggleAttribute('data-retained', v.key === retained);
    updateTabStop();
  }
  /** DOM order = display order; the anchor (focused row) is never moved. */
  function arrange(ordered: View[], anchor: View | null) {
    const at = anchor ? ordered.indexOf(anchor) : -1;
    if (at < 0) {
      let prev: Element | null = null;
      for (const v of ordered) {
        const want: ChildNode | null = prev ? prev.nextSibling : body.firstChild;
        if (v.el !== want) { body.insertBefore(v.el, want); log.moves++; }
        prev = v.el;
      }
      return;
    }
    if (!anchor!.el.isConnected) body.append(anchor!.el);
    let next: Element = anchor!.el;
    for (let i = at - 1; i >= 0; i--) {
      const el = ordered[i]!.el;
      if (el.nextSibling !== next) { body.insertBefore(el, next); log.moves++; }
      next = el;
    }
    let prev: Element = anchor!.el;
    for (let i = at + 1; i < ordered.length; i++) {
      const el = ordered[i]!.el;
      if (prev.nextSibling !== el) { body.insertBefore(el, prev.nextSibling); log.moves++; }
      prev = el;
    }
  }
  function cellEl(key: string, col: string): HTMLElement | null {
    if (key === HEADER) return headCells.get(col) ?? null;
    const v = views.get(key);
    if (!v) return null;
    return v.kind === 'detail' ? v.cells.get(col0.id)! : v.cells.get(col) ?? null;
  }
  function updateTabStop() {
    const el = cellEl(focus.key, focus.col);
    if (tabStop && tabStop !== el) tabStop.tabIndex = -1;
    if (el) el.tabIndex = 0;
    tabStop = el;
  }

  let pending = false;
  vp.addEventListener('scroll', () => {
    if (pending) return; pending = true;
    requestAnimationFrame(() => { pending = false; render(); });
  }, { passive: true });

  // ---- focus ----------------------------------------------------------------
  function ensureVisible(i: number) {
    const hh = head.offsetHeight, view = vp.clientHeight - hh, st = vp.scrollTop;
    const top = offsets[i]!, bottom = offsets[i + 1]!;
    if (top < st) vp.scrollTop = top;
    else if (bottom > st + view) vp.scrollTop = bottom - view;
  }
  function focusCell(key: string, col: string, opt: { scroll?: boolean } = {}) {
    if (key !== HEADER && opt.scroll !== false && indexOf.has(key)) ensureVisible(indexOf.get(key)!);
    focus = { key, col };
    render();
    cellEl(key, col)?.focus({ preventScroll: true });
  }
  vp.addEventListener('focusin', (ev) => {
    const cell = (ev.target as HTMLElement).closest?.('[data-col]') as HTMLElement | null;
    if (!cell || !vp.contains(cell)) return;
    const rowEl = cell.closest('[data-key]') as HTMLElement | null;      // hit-test by key, never position
    const key = cell.getAttribute('role') === 'columnheader' ? HEADER : rowEl?.dataset.key;
    if (!key || (key === focus.key && cell.dataset.col === focus.col)) return;
    focus = { key, col: cell.dataset.col! };
    updateTabStop();
  });

  // ---- editing --------------------------------------------------------------
  function startEdit(key: string, col: string) {
    const c = colById.get(col);
    const i = indexOf.get(key);
    if (!c?.editable || i == null || entries[i]!.kind !== 'data') return false;
    focusCell(key, col);
    const cell = cellEl(key, col)!;
    const input = document.createElement('input');
    input.value = value(entries[i]!.row, col);
    input.setAttribute('aria-label', c.header);
    const t = cell.querySelector('.t') as HTMLElement; t.hidden = true;
    cell.dataset.editing = '';
    editor = { key, col, input, closing: false };
    input.addEventListener('blur', () => { if (editor && editor.input === input && !editor.closing) stopEdit(true, false); });
    cell.append(input);
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    return true;
  }
  function stopEdit(commit: boolean, refocus = true) {
    if (!editor) return;
    const { key, col, input } = editor;
    editor.closing = true;
    if (commit) (edits.get(key) ?? edits.set(key, new Map()).get(key)!).set(col, input.value);
    const cell = input.parentElement as HTMLElement;
    if (refocus && indexOf.has(key)) { focus = { key, col }; render(); cellEl(key, col)?.focus({ preventScroll: true }); }
    input.remove();
    delete cell.dataset.editing;
    (cell.querySelector('.t') as HTMLElement).hidden = false;
    editor = null;
    const i = indexOf.get(key);
    if (i != null && views.has(key)) bind(views.get(key)!, entries[i]!, i);
  }

  // ---- announcements --------------------------------------------------------
  let liveTimer = 0;
  function announce(text: string) {
    log.announcements.push(text);
    live.textContent = '';
    clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => { live.textContent = text; }, 60);
  }

  // ---- operations that reorder ------------------------------------------------
  function afterReshape(prevIndex: number | undefined) {
    if (focus.key !== HEADER && !indexOf.has(focus.key)) {
      // the focused row left the displayed rows: nearest displayed row at this instant
      if (editor) stopEdit(false, false);
      const i = Math.min(prevIndex ?? 0, entries.length - 1);
      if (i >= 0) {
        const hadFocus = vp.contains(document.activeElement);
        focus = { key: entries[i]!.key, col: focus.col };
        if (hadFocus) { focusCell(focus.key, focus.col); return; }
      }
    }
    render();
  }
  function setSort(col: string, dir: 'ascending' | 'descending' | null) {
    const prev = indexOf.get(focus.key);
    sort = dir ? { col, dir } : null;
    compute(); afterReshape(prev);
    announce(dir ? o.messages.sorted(colById.get(col)!.header, dir, entries.length) : o.messages.unsorted(entries.length));
  }
  function cycleSort(col: string) {
    const d = sort?.col !== col ? 'ascending' : sort.dir === 'ascending' ? 'descending' : null;
    setSort(col, d);
  }
  function setFilter(f: ((r: Row) => boolean) | null) {
    const prev = indexOf.get(focus.key);
    filter = f; page = 0; compute(); afterReshape(prev);
    announce(o.messages.filtered(entries.length));
  }
  function setPage(p: number) {
    const total = filter ? source.filter(filter).length : source.length;
    const pages = Math.ceil(total / (o.pageSize ?? total));
    page = Math.max(0, Math.min(p, pages - 1));
    compute(); vp.scrollTop = 0;
    focus = { key: entries[0]!?.key ?? '', col: focus.col };
    render();
    const from = page * o.pageSize! + 1;
    announce(o.messages.page(page + 1, pages, from, from + entries.length - 1, total));
  }
  function update(fn: (r: Row) => Row) {
    const prev = indexOf.get(focus.key);
    source = source.map(fn); compute(); afterReshape(prev);
  }
  function toggle(key: string) {
    const i = indexOf.get(key); if (i == null) return;
    const e = entries[i]!;
    if (tree && e.hasChildren) {
      const was = !collapsed.has(key);
      was ? collapsed.add(key) : collapsed.delete(key);
      compute(); render();
      const name = value(e.row, col0.id);
      announce(was ? o.messages.collapsed(name) : o.messages.expanded(name, (entries.length)));
    } else if (o.detail && o.detail(e.row) != null) {
      openDetails.has(key) ? openDetails.delete(key) : openDetails.add(key);
      compute(); render();
    }
  }

  // ---- keyboard (one listener, owner first) -----------------------------------
  vp.addEventListener('keydown', (e) => {
    if (editor) {                                   // owner = editor: only commit / cancel
      if (e.key === 'Enter') { e.preventDefault(); stopEdit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); stopEdit(false); }
      return;
    }
    const target = e.target as HTMLElement;
    if (!target.dataset?.col) return;
    const ci = cols.findIndex((c) => c.id === focus.col);
    const ri = focus.key === HEADER ? -1 : indexOf.get(focus.key) ?? 0;
    const fwd = o.dir === 'rtl' ? -1 : 1;
    const ctrl = e.ctrlKey || e.metaKey;
    const goRow = (i: number) => {
      if (i < 0) return focusCell(HEADER, focus.col);
      const ent = entries[Math.max(0, Math.min(entries.length - 1, i))]!;
      focusCell(ent.key, ent.kind === 'detail' ? col0.id : focus.col);
    };
    const goCol = (j: number) => { j = Math.max(0, Math.min(cols.length - 1, j)); focusCell(focus.key, cols[j]!.id); };
    const pageRows = Math.max(1, Math.floor((vp.clientHeight - head.offsetHeight) / rowH) - 1);
    const ent = ri >= 0 ? entries[ri]! : null;
    switch (e.key) {
      case 'ArrowDown': goRow(ri + 1); break;
      case 'ArrowUp': if (ri >= 0) goRow(ri - 1); break;
      case 'ArrowRight': case 'ArrowLeft': {
        const d = (e.key === 'ArrowRight' ? 1 : -1) * fwd;     // logical delta
        if (tree && ent && ci === 0) {
          const open = ent.hasChildren && !collapsed.has(ent.key);
          if (d > 0 && ent.hasChildren && !open) { toggle(ent.key); break; }
          if (d < 0 && open) { toggle(ent.key); break; }
          if (d < 0 && ent.row.parent) { focusCell(ent.row.parent as string, focus.col); break; }
        }
        if (ent?.kind === 'detail') break;
        goCol(ci + d); break;
      }
      case 'Home': ctrl ? goRow(0) : goCol(0); break;
      case 'End': ctrl ? (focus = { key: focus.key, col: cols[cols.length - 1]!.id }, goRow(entries.length - 1)) : goCol(cols.length - 1); break;
      case 'PageDown': goRow(Math.min(entries.length - 1, ri + pageRows)); break;
      case 'PageUp': goRow(Math.max(0, ri - pageRows)); break;
      case 'Enter': case 'F2':
        if (focus.key === HEADER) { if (e.key === 'Enter') cycleSort(focus.col); break; }
        if (ent && ci === 0 && (o.detail || tree) && e.key === 'Enter' && !colById.get(focus.col)?.editable) { toggle(ent.key); break; }
        if (!startEdit(focus.key, focus.col)) return;
        break;
      default: return;
    }
    e.preventDefault();
  });

  compute();
  focus = { key: entries[0]!?.key ?? '', col: col0.id };
  render();

  return {
    root: grid, viewport: vp, body, live, log,
    get focus() { return { ...focus }; },
    get editor() { return editor ? { key: editor.key, col: editor.col } : null; },
    get count() { return entries.length; },
    indexOf: (k: string) => indexOf.get(k),
    keyAt: (i: number) => entries[i]!?.key,
    offsetOf: (i: number) => offsets[i]!,
    headerHeight: () => head.offsetHeight,
    render, focusCell, startEdit, stopEdit, setSort, setFilter, setPage, update, toggle, announce,
    scrollToIndex(i: number) { vp.scrollTop = offsets[Math.max(0, Math.min(i, entries.length - 1))]!; render(); },
    /** Rows in DOM order: [key, aria-rowindex, retained?] — for checks. */
    domRows: () => [...body.children].map((el) => [(el as HTMLElement).dataset.key, Number(el.getAttribute('aria-rowindex')), el.hasAttribute('data-retained')]),
  };
}
export type Grid = ReturnType<typeof createGrid>;
