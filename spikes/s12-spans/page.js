// S12 — tall and wide cells in a virtualised grid with sticky pinned segments.
// Throwaway, plain JS, no import: the grid's DOM shape (scroller, sticky header, clipped body,
// re-anchored layer, rows with start/centre/end segments) and the S11 scroll mapping, rebuilt here.
//
// Query: rows=N  dir=ltr|rtl  mode=plan|base  covered=content|style  fill=none|pinned
//        pe=all|cells  label=js|sticky|none  cellov=clip|hidden  labov=hidden|clip|visible
//        labte=ellipsis|clip  opaque=0|1  at=<origin row>  len=<span rows>
const q = new URLSearchParams(location.search);
const N = Number(q.get('rows') ?? 200);
const DIR = q.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const LABEL = q.get('label') ?? 'js';
const FILL = q.get('fill') ?? 'none';
const AT = Number(q.get('at') ?? 4);
const LEN = Number(q.get('len') ?? 10);
document.documentElement.dir = DIR;
const root = document.documentElement.dataset;
root.mode = q.get('mode') ?? 'plan';
root.covered = q.get('covered') ?? 'style';
root.fill = FILL;
root.pe = q.get('pe') ?? 'cells';
root.label = LABEL;
root.cellov = q.get('cellov') ?? 'clip';
root.labov = q.get('labov') ?? 'hidden';
root.labte = q.get('labte') ?? 'ellipsis';
root.opaque = q.get('opaque') ?? '0';
// rank: pinned host segments z = 3 + (hosts mounted after it), so an earlier span paints over a later
// host row it covers; header above them all. flat: every host segment z 3 (blueprint B as written).
const ZRANK = (q.get('z') ?? 'rank') === 'rank';
root.z = ZRANK ? 'rank' : 'flat';

const ROW = 32, HEAD = 64, LAB = 32, OVERSCAN = 3;
const MAX_PHYSICAL = 4_000_000, REBASE = 1 << 20;
const SEGS = { start: { n: 2, w: 100 }, center: { n: 12, w: 120 }, end: { n: 1, w: 100 } };
const COLS = SEGS.start.n + SEGS.center.n + SEGS.end.n;
const segW = (s) => SEGS[s].n * SEGS[s].w;
const TOTAL_W = segW('start') + segW('center') + segW('end');
const colIndex = (seg, c) => 1 + (seg === 'start' ? c : seg === 'center' ? SEGS.start.n + c : SEGS.start.n + SEGS.center.n + c);

// ---------- spans (what the core's SpanMap would hand the painter) ----------
const huge = Number(q.get('huge') ?? 0);
const spans = [
  { id: 'A', seg: 'start', col: 0, row: AT, rows: LEN, cols: 1, label: q.get('text') ?? 'Cardiology and vascular surgery' },
  { id: 'B', seg: 'center', col: 1, row: AT + 2, rows: LEN, cols: 2, label: 'Ward B' },
  { id: 'C', seg: 'start', col: 1, row: AT + 6, rows: 3, cols: 1, label: 'Bed C' },
  { id: 'D', seg: 'end', col: 0, row: AT + 1, rows: LEN, cols: 1, label: 'Shift D' },
  { id: 'E', seg: 'center', col: 4, row: AT + LEN + 3, rows: 1, cols: 3, label: 'Total E (colspan 3)' },
];
if (huge) spans.push({ id: 'H', seg: 'center', col: 8, row: Number(q.get('hugeAt') ?? AT), rows: huge, cols: 1, label: 'Huge H' });
const FULL = AT + LEN + 6; // a full-width row
const ownerAt = (seg, col, row) => spans.find((s) => s.seg === seg && col >= s.col && col < s.col + s.cols && row >= s.row && row < s.row + s.rows) ?? null;
const hosts = (row) => spans.some((s) => s.row === row && s.rows > 1);
const covered = (row) => spans.some((s) => row > s.row && row < s.row + s.rows);

// ---------- the S11 mapping (same formulas as the core's scrollMapper / layerPlacement) ----------
function scrollMapper(L, maxPhysical, vp) {
  if (L <= maxPhysical) { const m = Math.max(0, L - vp); return { scaled: false, ratio: 1, physicalHeight: L, maxLogical: m, maxPhysical: m, toLogical: (p) => Math.max(0, Math.min(m, p)), toPhysical: (l) => Math.max(0, Math.min(m, l)) }; }
  const maxL = Math.max(0, L - vp), maxP = Math.max(0, maxPhysical - vp), ratio = maxL / maxP;
  return { scaled: true, ratio, physicalHeight: maxPhysical, maxLogical: maxL, maxPhysical: maxP,
    toLogical: (p) => { const c = Math.max(0, Math.min(maxP, p)); return c === maxP ? maxL : c * ratio; },
    toPhysical: (l) => { const c = Math.max(0, Math.min(maxL, l)); return c === maxL ? maxP : c / ratio; } };
}

// ---------- DOM ----------
let maxWritten = 0;
const px = (el, prop, v) => { if (Math.abs(v) > maxWritten) maxWritten = Math.abs(v); el.style.setProperty(prop, `${v}px`); };
const vp = document.createElement('div');
vp.className = 'vp';
vp.setAttribute('role', 'grid');
vp.setAttribute('aria-label', 'S12');
vp.setAttribute('aria-rowcount', String(N + 2));
vp.setAttribute('aria-colcount', String(COLS));
vp.tabIndex = -1;
const head = document.createElement('div');
head.className = 'head';
head.setAttribute('role', 'rowgroup');
const body = document.createElement('div');
body.className = 'body';
body.setAttribute('role', 'rowgroup');
const layer = document.createElement('div');
layer.className = 'layer';
body.append(layer);
vp.append(head, body);
document.getElementById('host').append(vp);
for (const el of [head, body, layer]) px(el, 'inline-size', TOTAL_W);

function segments(parent) {
  const out = {};
  for (const name of ['start', 'center', 'end']) {
    const s = document.createElement('div');
    s.className = `seg ${name}`;
    s.setAttribute('role', 'presentation');
    px(s, 'inline-size', segW(name));
    parent.append(s);
    out[name] = s;
  }
  return out;
}
// Header: a group row (columnheader with aria-colspan; the end column has no group) and the leaf row.
const groups = [['start', 0, 2, 'Patient'], ['center', 0, 6, 'Measures'], ['center', 6, 6, 'More']];
for (const level of [1, 2]) {
  const r = document.createElement('div');
  r.className = 'hrow';
  r.setAttribute('role', 'row');
  r.setAttribute('aria-rowindex', String(level));
  px(r, 'inline-size', TOTAL_W);
  const segs = segments(r);
  const add = (seg, c, n, text) => {
    const h = document.createElement('div');
    h.className = 'hc';
    h.setAttribute('role', 'columnheader');
    h.setAttribute('aria-colindex', String(colIndex(seg, c)));
    if (n > 1) h.setAttribute('aria-colspan', String(n));
    h.dataset.col = `${seg}${c}`;
    h.textContent = text;
    px(h, 'inset-inline-start', c * SEGS[seg].w);
    px(h, 'inline-size', n * SEGS[seg].w);
    segs[seg].append(h);
  };
  if (level === 1) for (const g of groups) add(...g);
  else for (const seg of ['start', 'center', 'end']) for (let c = 0; c < SEGS[seg].n; c++) add(seg, c, 1, `${seg} ${c}`);
  head.append(r);
}

const bodyView = () => vp.clientHeight - HEAD;
const mapper = scrollMapper(N * ROW, MAX_PHYSICAL, bodyView());
px(body, 'block-size', mapper.physicalHeight);

/** One row element, built once per mount (the spike does not pool). */
function makeRow(i) {
  const el = document.createElement('div');
  el.className = 'row';
  el.setAttribute('role', 'row');
  el.setAttribute('aria-rowindex', String(i + 3));
  el.dataset.i = String(i);
  px(el, 'inline-size', TOTAL_W);
  if (i % 4 === 1) el.setAttribute('aria-selected', 'true');
  if (hosts(i)) el.dataset.spans = '';
  if (covered(i)) el.dataset.covered = '';
  const segs = segments(el);
  const tall = [];
  if (i === FULL) {
    for (const s of Object.values(segs)) s.hidden = true;
    const c = document.createElement('div');
    c.className = 'c full';
    c.setAttribute('role', 'gridcell');
    c.setAttribute('aria-colindex', '1');
    c.setAttribute('aria-colspan', String(COLS));
    c.style.position = 'sticky';
    px(c, 'inline-size', 800);
    c.textContent = `Full-width row ${i}`;
    el.append(c);
    return { el, i, tall };
  }
  for (const seg of ['start', 'center', 'end']) {
    for (let c = 0; c < SEGS[seg].n; c++) {
      const o = ownerAt(seg, c, i);
      if (o && (o.row !== i || o.col !== c)) {
        // A covered slot: nothing, or (fill=pinned) a decorative filler that paints this row's background.
        if (FILL === 'pinned' && seg !== 'center' && o.col === c) {
          const f = document.createElement('div');
          f.className = 'filler';
          f.setAttribute('aria-hidden', 'true');
          px(f, 'inset-inline-start', c * SEGS[seg].w);
          px(f, 'inline-size', o.cols * SEGS[seg].w);
          segs[seg].append(f);
        }
        continue;
      }
      // The origin row's slot needs the filler too: a transparent pinned tall cell is see-through there.
      if (o && o.rows > 1 && FILL === 'pinned' && seg !== 'center' && q.get('originfill') !== '0') {
        const f = document.createElement('div');
        f.className = 'filler';
        f.setAttribute('aria-hidden', 'true');
        px(f, 'inset-inline-start', c * SEGS[seg].w);
        px(f, 'inline-size', o.cols * SEGS[seg].w);
        segs[seg].append(f);
      }
      const d = document.createElement('div');
      d.className = 'c';
      d.setAttribute('role', 'gridcell');
      d.setAttribute('aria-colindex', String(colIndex(seg, c)));
      d.dataset.col = `${seg}${c}`;
      d.tabIndex = -1;
      px(d, 'inset-inline-start', c * SEGS[seg].w);
      px(d, 'inline-size', (o ? o.cols : 1) * SEGS[seg].w);
      if (o) {
        if (o.rows > 1) d.classList.add('span');
        d.dataset.span = o.id;
        if (o.rows > 1) d.setAttribute('aria-rowspan', String(o.rows));
        if (o.cols > 1) d.setAttribute('aria-colspan', String(o.cols));
        if (o.rows > 1) {
          const lab = document.createElement('div');
          lab.className = 'lab';
          lab.textContent = o.label;
          // Sticky: the flow position comes from a spacer, not a margin (a sticky box's margin box
          // must stay inside its containing block, which blocks the bottom stick).
          const pad = document.createElement('div');
          pad.setAttribute('aria-hidden', 'true');
          if (LABEL === 'sticky') d.append(pad);
          d.append(lab);
          tall.push({ el: d, lab, pad, span: o, top: NaN, size: NaN, y: NaN, m: NaN });
        } else d.textContent = o.label;
      } else d.textContent = `r${i} ${seg}${c}`;
      segs[seg].append(d);
    }
  }
  return { el, i, tall };
}

// ---------- paint ----------
const mounted = new Map();
let L = 0, base = 0, layerTop = 0;
const stats = { paints: 0, paintMs: [], labelMs: [], labelWrites: 0, geomWrites: 0 };

/** The labels, from the scroll position and the span geometry only: no layout read. */
function placeLabels() {
  const t0 = performance.now();
  const vt = L, vb = L + bodyView();
  for (const v of mounted.values()) for (const t of v.tall) {
    const s0 = t.span.row * ROW, s1 = (t.span.row + t.span.rows) * ROW;
    const centre = (s0 + s1) / 2 - LAB / 2;
    let y = Math.min(Math.max(centre, Math.max(s0, vt)), Math.min(s1, vb) - LAB);
    y = Math.max(s0, Math.min(s1 - LAB, y)) - t.top; // into the clipped cell's coordinates
    if (LABEL === 'js' && t.y !== y) { t.y = y; t.lab.style.transform = `translateY(${y}px)`; stats.labelWrites++; }
  }
  stats.labelMs.push(performance.now() - t0);
}

function paint() {
  const t0 = performance.now();
  const p = vp.scrollTop;
  L = mapper.toLogical(p);
  base = Math.floor(L / REBASE) * REBASE;
  layerTop = p - L + base;
  px(layer, 'inset-block-start', layerTop);
  const first = Math.max(0, Math.floor(L / ROW) - OVERSCAN);
  const last = Math.min(N - 1, Math.ceil((L + bodyView()) / ROW) + OVERSCAN);
  const want = new Set();
  // Origins above the window whose span reaches into it (coveringAbove).
  for (const s of spans) if (s.row < first && s.row + s.rows > first) want.add(s.row);
  for (let i = first; i <= last; i++) want.add(i);
  for (const [i, v] of mounted) if (!want.has(i)) { v.el.remove(); mounted.delete(i); }
  const order = [...want].sort((a, b) => a - b);
  let cursor = layer.firstChild;
  for (const i of order) {
    let v = mounted.get(i);
    if (!v) { v = makeRow(i); mounted.set(i, v); }
    const top = Math.max(-2 * REBASE, Math.min(2 * REBASE, i * ROW - base));
    px(v.el, 'inset-block-start', top);
    // Tall cells: the span clipped to the window + overscan, in the row's own coordinates.
    for (const t of v.tall) {
      const s0 = t.span.row * ROW, s1 = (t.span.row + t.span.rows) * ROW;
      const c0 = Math.max(s0, first * ROW), c1 = Math.min(s1, (last + 1) * ROW);
      const inRow = c0 - base - top;          // layer coordinates minus the row's placed top
      const size = Math.max(ROW, c1 - c0);
      if (t.top !== c0 || t.inRow !== inRow) { t.top = c0; t.inRow = inRow; px(t.el, 'inset-block-start', inRow); stats.geomWrites++; }
      if (t.size !== size) { t.size = size; px(t.el, 'block-size', size); stats.geomWrites++; }
      if (LABEL === 'sticky') {
        // Flow position = the span's centre, clamped into the clipped cell; sticky does the rest.
        const m = Math.max(0, Math.min(size - LAB, (s0 + s1) / 2 - LAB / 2 - c0));
        if (t.m !== m) { t.m = m; px(t.pad, 'block-size', m); stats.geomWrites++; }
      }
    }
    if (v.el === cursor) cursor = cursor.nextSibling;
    else layer.insertBefore(v.el, cursor);
  }
  if (LABEL === 'js') placeLabels();
  if (ZRANK) {
    const hostsInOrder = order.filter((i) => mounted.get(i).el.hasAttribute('data-spans'));
    hostsInOrder.forEach((i, k) => {
      const z = String(3 + hostsInOrder.length - 1 - k);
      for (const s of mounted.get(i).el.querySelectorAll(':scope > .seg.start, :scope > .seg.end')) if (s.style.zIndex !== z) s.style.zIndex = z;
    });
  }
  stats.paints++;
  stats.paintMs.push(performance.now() - t0);
}
vp.addEventListener('scroll', () => paint(), { passive: true });
paint();

// ---------- API for run.mjs ----------
window.api = {
  N, ROW, HEAD, spans, FULL, scaled: mapper.scaled, ratio: mapper.ratio,
  /** Scrolls so logical offset `l` is at the view's top (through the mapping), and paints now. */
  scrollLogical(l) { vp.scrollTop = mapper.toPhysical(l); paint(); },
  scrollRow(r) { this.scrollLogical(r * ROW); },
  scrollInline(x) { vp.scrollLeft = (DIR === 'rtl' ? -1 : 1) * x; },
  state: () => ({ L, base, layerTop, scrollTop: vp.scrollTop, bodyView: bodyView(), maxWritten, scrollHeight: vp.scrollHeight, physicalHeight: mapper.physicalHeight, mounted: mounted.size }),
  stats: () => stats,
  /**
   * Where slot (seg, col, row) is on screen, from the vp's box, the scroll and the constants only
   * (not from the rows' DOM): `dx`, `dy` are logical offsets from the slot's start/top corner.
   */
  point(seg, col, row, dx = 3, dy = 3) {
    const r = vp.getBoundingClientRect();
    const inStart = DIR === 'rtl' ? r.left + vp.clientLeft + vp.clientWidth : r.left + vp.clientLeft;
    const sx = Math.abs(vp.scrollLeft);
    let off;
    if (seg === 'start') off = col * SEGS.start.w;
    else if (seg === 'center') off = segW('start') + col * SEGS.center.w - sx;
    else off = vp.clientWidth - segW('end') + col * SEGS.end.w;
    const x = DIR === 'rtl' ? inStart - off - dx : inStart + off + dx;
    const y = r.top + vp.clientTop + HEAD + (row * ROW - L) + dy;
    return { x, y };
  },
  view() { const r = vp.getBoundingClientRect(); return { top: r.top + vp.clientTop + HEAD, bottom: r.top + vp.clientTop + vp.clientHeight, left: r.left + vp.clientLeft, right: r.left + vp.clientLeft + vp.clientWidth }; },
  resetStats() { stats.paintMs.length = 0; stats.labelMs.length = 0; stats.labelWrites = 0; stats.geomWrites = 0; },
  /** The label pass alone, `n` times, for a cost per call. */
  labelCost(n) { const t0 = performance.now(); for (let k = 0; k < n; k++) { for (const v of mounted.values()) for (const t of v.tall) t.y = NaN; placeLabels(); } stats.labelMs.length = 0; return (performance.now() - t0) / n; },
};
window.ready = true;
