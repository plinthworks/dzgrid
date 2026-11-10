// Spike for docs/phase-12-steps/sheets-plan.md: 10 sheets of 10 000 rows, (one) a single grid whose rows, columns and
// Parked (owner, 2026-11-10: too heavy): the sheets plan is kept, nothing of it is built.
// sort are swapped at each switch, or (many) one grid per sheet made at its first opening and kept hidden. Made-up rows.
import { createGrid, type GridInstance } from '../../packages/dom/src/index.js';
import { FR } from '../../packages/dom/src/locales/fr.js';

type R = { id: string; [k: string]: string | number };
const SHEETS = 10, ROWS = 10_000;
const cols = (s: number) => Array.from({ length: 8 }, (_, j) => ({ id: `c${j}`, header: `F${s} C${j}`, type: j % 2 ? 'number' : 'text', width: 110 }) as const);
const data: R[][] = Array.from({ length: SHEETS }, (_, s) => Array.from({ length: ROWS }, (_, i) => {
  const r: R = { id: `s${s}r${i}` };
  for (let j = 0; j < 8; j++) r[`c${j}`] = j % 2 ? (i * 7919 + j * 31 + s) % 10007 : `Texte ${(i * 131 + j) % 997} ${s}`;
  return r;
}));
const mode = new URLSearchParams(location.search).get('mode');
const wrap = document.getElementById('wrap')!;
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const base = { getRowId: (r: R) => r.id, messages: FR, locale: 'fr-FR', timeZone: 'UTC' } as const;
const sortOf = (s: number) => [{ column: `c${1 + (s % 4) * 2}`, dir: s % 2 ? 'desc' : 'asc' }] as const;

let show: (s: number) => void;
if (mode === 'one') {
  const host = Object.assign(document.createElement('div'), { className: 'host' });
  wrap.append(host);
  const g = createGrid<R>(host, { ...base, rows: data[0]!, columns: cols(0) as never });
  const saved: { sort?: unknown; top?: number }[] = [];
  let cur = 0;
  g.kernel.dispatch({ type: 'sort.set', sort: sortOf(0) as never }, 'host');
  show = (s) => {
    saved[cur] = { sort: g.kernel.sort, top: (g as never as { scroll: { logicalTop: number } }).scroll.logicalTop };
    g.update({ columns: cols(s) as never, rows: data[s]! });
    g.kernel.dispatch({ type: 'sort.set', sort: (saved[s]?.sort ?? sortOf(s)) as never }, 'host');
    (g as never as { scroll: { scrollTo(n: number): void } }).scroll.scrollTo(saved[s]?.top ?? 0);
    cur = s;
  };
} else {
  const grids: (GridInstance<R> | undefined)[] = [];
  const hosts: HTMLElement[] = [];
  let cur = -1;
  show = (s) => {
    if (cur >= 0) hosts[cur]!.hidden = true;
    if (!hosts[s]) {
      const host = Object.assign(document.createElement('div'), { className: 'host' });
      wrap.append((hosts[s] = host));
      grids[s] = createGrid<R>(host, { ...base, rows: data[s]!, columns: cols(s) as never });
      grids[s]!.kernel.dispatch({ type: 'sort.set', sort: sortOf(s) as never }, 'host');
    } else hosts[s]!.hidden = false;
    cur = s;
  };
  show(0);
}
const timed = async (s: number) => {
  const t = performance.now();
  show(s);
  const sync = performance.now() - t;
  // The grid paints in the next frame's callbacks, registered before this one: their time is now less the frame's start.
  const paint = await new Promise<number>((r) => requestAnimationFrame((ts) => r(performance.now() - ts)));
  await frames();
  return sync + paint;
};
const scrollTo = (n: number) => { const v = [...document.querySelectorAll<HTMLElement>('.dzg-viewport')].find((e) => e.offsetParent)!; v.scrollTop = n; };
const top = () => [...document.querySelectorAll<HTMLElement>('.dzg-viewport')].find((e) => e.offsetParent)!.scrollTop;
Object.assign(window, { timed, scrollTo, topOf: top, ready: true });
