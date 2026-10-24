// A random walk through editing (Phase 5 step 5, step05-plan « Tests first »: 300 seeds): fields opened every way,
// text typed (good and bad), kept by Enter, Tab or a blur, given up, refused; sorts, the quick search, scrolls and
// host updates in between. After each step: at most one field in the grid, held by the host in the cell it names,
// never in a pooled cell; the focus never on body; every other mounted cell shows what an oracle kept.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { RowKey } from '@dzgrid/core';
import { ed, cleanup, rowsOf, type R } from './support-editors.js';

afterEach(cleanup);

const SEEDS = Number(process.env['WALK_SEEDS'] ?? 300);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seen = { opened: 0, kept: 0, refused: 0 };

function walk(seed: number): string | null {
  const r = rng(seed);
  const int = (n: number) => Math.floor(r() * n);
  const pick = <X,>(xs: readonly X[]): X => xs[int(xs.length)]!;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  const rows = rowsOf(120);
  // The host's rows, as an app that saves would keep them: an edit kept is written back.
  const data = new Map(rows.map((x) => [x.id, { ...x }]));
  const t = ed({ rows, block: 200, options: { enterMoves: pick(['down', 'stay'] as const) } });
  const out = document.body.appendChild(document.createElement('button'));
  // Something has the focus from the start (the page's control): the walk never lets it fall to body.
  out.focus();
  const idOf = (k: RowKey) => String(k).replace(/^d:\d+:/, '');
  t.g.kernel.subscribe((e) => {
    if (e.type === 'cellEdited') (data.get(idOf(e.key)) as Record<string, unknown>)[e.column] = e.value;
  });
  const cols = ['name', 'n', 's', 'q'];
  const shown = () => [...t.ctx.rows.displayed.count ? Array.from({ length: t.ctx.rows.displayed.count }, (_, i) => t.ctx.rows.displayed.keyAt(t.ctx.rows.displayed.index(i)!)) : []];
  const mountedCell = () => {
    const ks = shown().filter((k) => t.ctx.rowRenderer.cell(k, 'name'));
    if (!ks.length) return null;
    const k = pick(ks);
    const c = pick(cols);
    return { k, c, el: t.ctx.rowRenderer.cell(k, c)! };
  };
  const focusOn = () => {
    const m = mountedCell();
    if (!m) return;
    t.g.api.focusCell(m.k, m.c);
    if (document.activeElement !== m.el) m.el.focus();
  };
  const ops: string[] = [];
  for (let step = 0; step < 30; step++) {
    const f = t.field();
    const op = f
      ? pick(['type', 'type', 'bad', 'enter', 'shiftEnter', 'tab', 'shiftTab', 'escape', 'blur', 'sort', 'search', 'scroll', 'update'])
      : pick(['focus', 'f2', 'enter', 'char', 'dbl', 'delete', 'sort', 'search', 'scroll', 'update', 'focus']);
    ops.push(op);
    switch (op) {
      case 'focus': focusOn(); break;
      case 'f2': focusOn(); t.key('F2'); break;
      case 'enter': f ? t.key('Enter') : (focusOn(), t.key('Enter')); break;
      case 'char': focusOn(); t.key(String(int(10))); break;
      case 'dbl': { const m = mountedCell(); m?.el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); break; }
      case 'delete': focusOn(); t.key('Delete'); break;
      case 'type': t.type(String(int(900))); break;
      case 'bad': t.type(pick(['x', '1,5', '-3', ''])); break;
      case 'shiftEnter': t.key('Enter', { shiftKey: true }); break;
      case 'tab': t.key('Tab'); break;
      case 'shiftTab': t.key('Tab', { shiftKey: true }); break;
      case 'escape': t.key('Escape'); break;
      case 'blur': out.focus(); vi.advanceTimersByTime(1); break;
      case 'sort': t.g.kernel.dispatch({ type: 'sort.toggle', column: pick(['n', 'q', 'name']), multi: false }, 'user'); break;
      case 'search': t.g.kernel.dispatch({ type: 'quick.set', text: pick(['', '', '1', 'Name 2']) } as never, 'user'); break;
      case 'scroll': t.scroll(int(120) * 32); break;
      case 'update': {
        const id = `r${int(120)}`;
        const row = data.get(id)!;
        (row as { s: string }).s = `u${int(9)}`;
        t.g.kernel.rows.applyTransaction({ update: [{ ...row }] });
        break;
      }
    }
    t.ctx.schedule();
    vi.advanceTimersByTime(600);
    // ---- the checks ----
    const fields = t.host.querySelectorAll('.dzg-field');
    if (fields.length > 1) return `${ops.join(' ')}: ${fields.length} fields`;
    const editing = t.host.querySelectorAll('.dzg-cell[data-dzg-editing]');
    const e = t.ctx.editor;
    if (fields.length !== editing.length || (fields.length && (!e || e.field !== fields[0] || e.cell !== editing[0] || t.ctx.rowRenderer.cell(e.key, e.column) !== e.cell))) return `${ops.join(' ')}: the field and the host disagree`;
    if (!fields.length && e) return `${ops.join(' ')}: an editor without a field`;
    if (document.activeElement === document.body) return `${ops.join(' ')}: focus on body`;
    for (const k of shown()) {
      for (const c of cols) {
        const cell = t.ctx.rowRenderer.cell(k, c);
        if (!cell || cell === e?.cell) continue;
        const v = (data.get(idOf(k)) as Record<string, unknown>)[c];
        const want = v == null ? '' : String(v);
        if (cell.textContent !== want) return `${ops.join(' ')}: ${idOf(k)}/${c} shows ${JSON.stringify(cell.textContent)}, kept ${JSON.stringify(want)}`;
      }
    }
  }
  seen.opened += t.of('editingStarted').length;
  seen.kept += t.of('cellEdited').length;
  seen.refused += t.alert.mock.calls.length;
  return null;
}

describe('the editors’ walk', () => {
  it(`${SEEDS} seeds: one field at most, held by the host, never pooled; focus never on body; no stale cell`, () => {
    const bad: string[] = [];
    for (let s = Number(process.env['WALK_FROM'] ?? 1); s <= SEEDS && bad.length < 3; s++) {
      if (process.env['WALK_LOG']) console.log('seed', s);
      const why = walk(s);
      if (why) bad.push(`seed ${s}: ${why}`);
      cleanup();
    }
    expect(bad).toEqual([]);
    // The walk did walk: fields opened, values kept, refusals said, in their thousands and hundreds.
    expect(seen.opened).toBeGreaterThan(SEEDS * 3);
    expect(seen.kept).toBeGreaterThan(SEEDS);
    expect(seen.refused).toBeGreaterThan(SEEDS / 3);
  }, 120_000);
});
