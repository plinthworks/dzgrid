import { CSS, Grid, ROW_H, cellVisibility, measure, scrollbarInfo, scrollConvention, toPhysicalScrollLeft } from './grid.ts';
import type { Dir } from './dir.ts';

const style = document.createElement('style');
style.textContent = CSS;
document.head.append(style);

const params = new URLSearchParams(location.search);
const host = document.getElementById('host')!;
if (params.get('sb') === 'custom') host.classList.add('dzg-sb');
const grid = new Grid(host, (params.get('dir') as Dir) ?? 'ltr');
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** The whole check list for one direction, at three horizontal and two vertical positions. */
async function scenario(dir: Dir) {
  grid.setDir(dir);
  grid.viewport.scrollTop = 0;
  grid.scrollX = 0;
  await frame();
  const out: Record<string, unknown> = { dir, convention: scrollConvention(), scrollbar: scrollbarInfo(grid) };
  const max = grid.maxX;
  out.maxX = max;
  // raw scrollLeft range: clamp from both sides
  const v = grid.viewport;
  v.scrollLeft = 1e6; const afterPlusHuge = v.scrollLeft;
  v.scrollLeft = -1e6; const afterMinusHuge = v.scrollLeft;
  v.scrollLeft = 0; const atZero = v.scrollLeft;
  v.scrollTo({ left: dir === 'rtl' ? -100 : 100 }); const scrollToMinus100 = v.scrollLeft;
  out.rawScrollLeft = { afterPlusHuge, afterMinusHuge, atZero, scrollToMinus100, scrollWidth: v.scrollWidth, clientWidth: v.clientWidth };
  // ScrollX round trip
  const rt: { x: number; read: number; raw: number }[] = [];
  for (const x of [0, 1, 37.5, 250, max / 2, max - 1, max, max + 50]) {
    grid.scrollX = x;
    rt.push({ x, read: +grid.scrollX.toFixed(2), raw: +v.scrollLeft.toFixed(2) });
  }
  out.scrollXRoundTrip = rt;
  out.scrollXRoundTripOk = rt.every((p) => Math.abs(p.read - Math.min(Math.max(p.x, 0), max)) <= 1);
  // a logical position must put the right column at the inline-start edge of the scrolled area
  grid.scrollX = grid.centerX('c5');
  await frame();
  const c5 = grid.header.querySelector('[data-col="c5"]')!.getBoundingClientRect();
  const s = grid.header.querySelector('.dzg-seg--start')!.getBoundingClientRect();
  out.scrollXPutsC5AtStart = +(dir === 'rtl' ? s.left - c5.right : c5.left - s.right).toFixed(2);
  // geometry at several positions
  const pos: Record<string, unknown> = {};
  for (const [name, x, y] of [['x0', 0, 0], ['xMid', max / 2, 0], ['xMax', max, 0], ['xMid_y300', max / 2, 300], ['xMax_y900', max, 900]] as const) {
    grid.scrollX = x; v.scrollTop = y;
    await frame();
    pos[name] = measure(grid);
  }
  out.positions = pos;
  // scrollIntoView, native, with and without scroll-padding; then the geometric ensureVisible
  const siv: Record<string, unknown> = {};
  for (const padded of [false, true]) {
    v.classList.toggle('padded', padded);
    v.style.scrollPaddingInlineStart = padded ? `${grid.pinStartWidth}px` : '';
    v.style.scrollPaddingInlineEnd = padded ? `${grid.pinEndWidth}px` : '';
    for (const [from, target] of [[0, 'c14'], [max, 'c2'], [max / 2, 'c0'], [0, 'c19']] as const) {
      grid.scrollX = from; v.scrollTop = 0; await frame();
      const cell = (grid.body.children[40] as HTMLElement).querySelector<HTMLElement>(`[data-col="${target}"]`)!;
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      await frame();
      siv[`${padded ? 'padded' : 'plain'}_from${Math.round(from)}_${target}`] = cellVisibility(grid, target, 40);
    }
  }
  v.classList.remove('padded'); v.style.scrollPaddingInlineStart = ''; v.style.scrollPaddingInlineEnd = '';
  out.scrollIntoView = siv;
  const ev: Record<string, unknown> = {};
  for (const [from, target] of [[0, 'c14'], [max, 'c2'], [max / 2, 'c0'], [0, 'c19']] as const) {
    grid.scrollX = from; v.scrollTop = 0; await frame();
    grid.ensureVisible(target, 40);
    await frame();
    ev[`from${Math.round(from)}_${target}`] = cellVisibility(grid, target, 40);
  }
  out.ensureVisible = ev;
  grid.scrollX = 0; v.scrollTop = 0;
  await frame();
  return out;
}

/** Changing `dir` at run time on the same DOM: what happens to the scroll position. */
async function flip() {
  grid.setDir('ltr'); grid.scrollX = 0; await frame();
  grid.scrollX = 300; await frame();
  const before = { scrollLeft: grid.viewport.scrollLeft, scrollX: grid.scrollX };
  grid.setDir('rtl'); await frame();
  const afterRaw = { scrollLeft: grid.viewport.scrollLeft, scrollX: grid.scrollX };
  grid.scrollX = 300; await frame();
  const reapplied = { scrollLeft: grid.viewport.scrollLeft, scrollX: grid.scrollX, geometry: measure(grid) };
  grid.setDir('ltr'); grid.scrollX = 0; await frame();
  return { before, afterRaw, reapplied };
}

/** For run.mjs: where a header handle is (physical client coords) and the cell edges around it. */
function handleInfo(id: string) {
  const cell = grid.header.querySelector<HTMLElement>(`[data-col="${id}"]`)!;
  const h = cell.querySelector<HTMLElement>('.dzg-handle')!.getBoundingClientRect();
  const c = cell.getBoundingClientRect();
  const x = (h.left + h.right) / 2, y = (h.top + h.bottom) / 2;
  const hitEl = document.elementFromPoint(x, y) as HTMLElement | null;
  return { x, y, cellLeft: c.left, cellRight: c.right, hitIsHandle: hitEl?.dataset?.resize === id,
    width: grid.cols.find((k) => k.id === id)!.width };
}

function alignment() { return measure(grid); }

/**
 * Bidi inside one cell: which side the Arabic word lands on relative to the Latin
 * token, and which side the text hugs, for three ways of isolating the cell text.
 */
function bidiProbe() {
  const samples = [
    { text: 'العيادة 12A', ar: [0, 7], lat: [8, 11] },
    { text: 'Ward 3 — الطابق 2', ar: [9, 15], lat: [0, 4] },
  ];
  const out: Record<string, unknown> = {};
  for (const dir of ['ltr', 'rtl'] as const) {
    grid.setDir(dir);
    for (const mode of ['isolate', 'plaintext', 'plaintext-block', 'dir-auto', 'flex+span-plaintext'] as const) {
      for (const sm of samples) {
        const cell = document.createElement('div');
        cell.className = 'dzg-cell';
        cell.style.cssText = 'position:absolute;inset-block-start:400px;inset-inline-start:0;inline-size:220px;block-size:30px';
        // .dzg-cell is display:flex (vertical centring); the text then sits in an anonymous flex item
        if (mode === 'plaintext') cell.style.unicodeBidi = 'plaintext';
        if (mode === 'plaintext-block') { cell.style.unicodeBidi = 'plaintext'; cell.style.display = 'block'; cell.style.lineHeight = '30px'; }
        if (mode === 'dir-auto') cell.dir = 'auto';
        if (mode === 'flex+span-plaintext') {
          const span = document.createElement('span'); span.style.unicodeBidi = 'plaintext'; span.textContent = sm.text; cell.append(span);
        } else cell.textContent = sm.text;
        grid.root.append(cell);
        const t = mode === 'flex+span-plaintext' ? cell.firstChild!.firstChild! : cell.firstChild!;
        const rr = (a: number, b: number) => { const r = document.createRange(); r.setStart(t, a); r.setEnd(t, b); return r.getBoundingClientRect(); };
        const ar = rr(sm.ar[0]!, sm.ar[1]!), lat = rr(sm.lat[0]!, sm.lat[1]!), all = rr(0, sm.text.length), c = cell.getBoundingClientRect();
        out[`${dir}/${mode}/${sm.text}`] = {
          arabicSide: ar.left > lat.left ? 'right-of-latin' : 'left-of-latin',
          hugs: Math.abs(all.left - c.left) < Math.abs(c.right - all.right) ? 'left' : 'right',
        };
        cell.remove();
      }
    }
  }
  grid.setDir('ltr');
  return out;
}

(window as any).spike = { grid, scenario, flip, bidiProbe, handleInfo, alignment, toPhysicalScrollLeft, ROW_H,
  setDir: async (d: Dir) => { grid.setDir(d); await frame(); },
  scrollTo: async (x: number, y: number) => { grid.scrollX = x; grid.viewport.scrollTop = y; await frame(); },
  rect: () => { const r = grid.root.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; },
  resetWidths: async () => { grid.cols.splice(0, grid.cols.length, ...(await import('./grid.ts')).makeColumns()); grid.layout(); await frame(); },
};
(window as any).ready = true;
