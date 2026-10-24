// The review of step 5 (reviewer R1–R7, test analyser's gaps; docs/phase-5-steps/step05-plan.md « Review »): keys
// typed while an open waits for its paint, the bubble kept in place (window scroll, resize) and not taking the focus,
// the length cap, the field's row name, and the gaps the mutants showed.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import type { SlotPart } from '../src/part.js';
import { ed, cleanup, ECOLS, k, layout, rowsOf, tick, type R } from './support-editors.js';

afterEach(cleanup);

/** A grid whose paints wait for the test's frames. */
function deferred(o: Parameters<typeof ed>[0] = {}) {
  const queue: FrameRequestCallback[] = [];
  const raf = { requestAnimationFrame: (f: FrameRequestCallback) => queue.push(f), cancelAnimationFrame: () => {} };
  const flush = () => { for (let i = 0; queue.length && i < 20; i++) queue.shift()!(0); };
  const t = ed({ raf, block: 160, ...o });
  flush();
  return { ...t, flush };
}
/** The focus on r40/n (below the view): the kernel's focus there, its cell not mounted until the paint; r3/n has the DOM focus. */
const below = (t: ReturnType<typeof deferred>) => {
  t.g.api.focusCell(k('r3'), 'n');
  t.flush();
  t.cell('r3', 'n')!.focus();
  t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r40'), column: 'n' } }, 'user');
  t.ctx.restoreFocus();
  expect(t.cell('r40', 'n')).toBeNull();
};
/** A key as a person types it: the grid's handlers first, then the field's own default (a character, Backspace). */
const press = (t: ReturnType<typeof ed>, key: string, init: KeyboardEventInit = {}) => {
  const at = document.activeElement!;
  const ev = t.key(key, init, at);
  const f = t.field();
  if (!ev.defaultPrevented && f && at === f) {
    if ([...key].length === 1) f.value += key;
    else if (key === 'Backspace') f.value = [...f.value].slice(0, -1).join('');
  }
};

describe('R1: keys typed while the open waits for the paint', () => {
  it('« 4 », « 2 », Enter: « 42 » kept, the field closed, down one row', () => {
    const t = deferred();
    below(t);
    press(t, '4');
    press(t, '2');
    press(t, 'Enter');
    t.flush();
    expect(t.of('cellEdited').map((e) => [e.key, e.value])).toEqual([[k('r40'), 42]]);
    expect(t.field()).toBeNull();
    expect(t.focusAt()).toBe('r41/n');
  });

  it('« 4 », F2: the field holds « 4 »', () => {
    const t = deferred();
    below(t);
    press(t, '4');
    press(t, 'F2');
    t.flush();
    expect(t.field()!.value).toBe('4');
  });

  it('« 4 », Backspace: nothing saved, the field opens empty', () => {
    const t = deferred();
    below(t);
    press(t, '4');
    press(t, 'Backspace');
    t.flush();
    expect(t.of('cellEdited')).toEqual([]);
    expect(t.field()!.value).toBe('');
  });

  it('F2 then « 5 »: the cell’s text with « 5 » after it', () => {
    const t = deferred();
    below(t);
    press(t, 'F2');
    press(t, '5');
    t.flush();
    expect(t.field()!.value).toBe('405');
  });

  it('« 4 », Escape: the wait dropped, nothing opens or saves', () => {
    const t = deferred();
    below(t);
    press(t, '4');
    press(t, 'Escape');
    t.flush();
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited')).toEqual([]);
  });

  it('« 9 », Tab: kept, then the next editable cell opens', () => {
    const t = deferred();
    below(t);
    press(t, '9');
    press(t, 'Tab');
    t.flush();
    expect(t.of('cellEdited').map((e) => e.value)).toEqual([9]);
    expect(t.focusAt()).toBe('r40/q');
  });

  it('property: 300 bursts of keys before the paint end as the same keys typed after it', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n);
    const keys = ['1', '2', '3', 'x', 'Backspace', 'F2'];
    const run = (seq: string[], before: boolean) => {
      const t = deferred();
      below(t);
      if (!before) {
        t.flush();
        t.cell('r40', 'n')!.focus();
      }
      for (const key of seq) press(t, key);
      t.flush();
      const out = { field: t.field()?.value ?? null, kept: t.of('cellEdited').map((e) => e.value), at: t.focusAt() };
      cleanup();
      return out;
    };
    for (let i = 0; i < 300; i++) {
      const seq = [pickStart(rnd), ...Array.from({ length: rnd(6) }, () => keys[rnd(keys.length)]!), ...(rnd(2) ? ['Enter'] : [])];
      expect(run(seq, true), seq.join(' ')).toEqual(run(seq, false));
    }
  });
});
const pickStart = (rnd: (n: number) => number) => (['F2', '4', '7'] as const)[rnd(3)]!;

describe('R2: the bubble follows the window', () => {
  it('placed again on a scroll anywhere in the page and on a resize, while shown; not after it is hidden', () => {
    const t = ed();
    let c = { top: 100, bottom: 132 };
    const rect = (top: number, bottom: number, left = 300, right = 380) => ({ top, bottom, left, right, x: left, y: top, width: right - left, height: bottom - top, toJSON() {} }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('dzg-viewport')) return rect(0, 700, 0, 1000);
      if (this.classList.contains('dzg-bubble')) return rect(0, 30, 0, 200);
      return rect(c.top, c.bottom);
    });
    t.at('r5', 'n');
    t.key('F2');
    t.type('x');
    t.key('Enter');
    const b = t.bubble()!;
    c = { top: 200, bottom: 232 };
    document.dispatchEvent(new Event('scroll'));
    expect(b.style.getPropertyValue('inset-block-start')).toBe('236px');
    c = { top: 300, bottom: 332 };
    window.dispatchEvent(new Event('resize'));
    expect(b.style.getPropertyValue('inset-block-start')).toBe('336px');
    const removed = vi.spyOn(window, 'removeEventListener');
    t.key('Escape');
    // Hidden: its window listeners go with it (none left watching).
    expect(removed.mock.calls.map((x) => x[0]).sort()).toEqual(['resize', 'scroll']);
    c = { top: 10, bottom: 42 };
    window.dispatchEvent(new Event('resize'));
    expect(b.style.getPropertyValue('inset-block-start')).toBe('336px');
  });
});

describe('R3: the length cap', () => {
  const capOf = (maxLength: number | undefined) => {
    const t = ed({ columns: [{ id: 'name', header: 'Name', width: 120, editable: true, ...(maxLength !== undefined && { edit: { maxLength } }) }] });
    t.at('r1', 'name');
    t.key('F2');
    const f = t.field()!;
    const has = f.hasAttribute('maxlength');
    cleanup();
    return has ? f.maxLength : 'none';
  };
  it('a finite integer ≥ 1 is the cap; 0 and Infinity mean no cap; above 2^31 − 1 is clamped; anything else the default 1 000', () => {
    expect(capOf(undefined)).toBe(1000);
    expect(capOf(20)).toBe(20);
    expect(capOf(0)).toBe('none');
    expect(capOf(Infinity)).toBe('none');
    expect(capOf(2 ** 40)).toBe(2 ** 31 - 1);
    expect(capOf(-3)).toBe(1000);
    expect(capOf(2.5)).toBe(1000);
    expect(capOf(NaN)).toBe(1000);
  });
});

describe('R4: a click on the bubble keeps the field', () => {
  it('pointerdown and mousedown on the bubble are prevented (the focus stays in the field, O1 does not fire)', async () => {
    layout();
    const t = ed();
    t.at('r5', 'n');
    t.key('F2');
    t.type('x');
    t.key('Enter');
    const b = t.bubble()!;
    for (const type of ['pointerdown', 'mousedown']) {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true });
      b.dispatchEvent(ev);
      expect(ev.defaultPrevented, type).toBe(true);
    }
    await tick();
    expect(t.field()!.value).toBe('x');
  });
});

describe('R6: the field’s row name comes from the row header’s value, not its drawn text', () => {
  it('a row header drawn by a part with hidden text: its value names the field', () => {
    const icon: SlotPart<'cell'> = { slot: 'cell', part: { mount(h) { const s = document.createElement('span'); s.setAttribute('aria-hidden', 'true'); s.textContent = '★'; h.append(s); return {}; } } };
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120, ui: { cell: 'icon' } }, ...ECOLS.slice(1)];
    const t = ed({ columns: cols, settings: { parts: { icon } } });
    t.at('r2', 'n');
    t.key('F2');
    expect(t.field()!.getAttribute('aria-label')).toBe('Stock, Name 2');
  });

  it('a number row header is named in its format', () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'q', header: 'Price', type: 'number', width: 80 }, { id: 'name', header: 'Name', width: 120, editable: true }];
    const t = ed({ columns: cols, rows: rowsOf(40).map((r) => ({ ...r, q: 1234.5 })) });
    t.at('r2', 'name');
    t.key('F2');
    expect(t.field()!.getAttribute('aria-label')).toBe('Name, 1,234.5');
  });
});

describe('gaps: starting', () => {
  it('a character outside the basic plane (𝟘) starts the edit with it', () => {
    const t = ed();
    t.at('r3', 'name');
    t.key('𝟘');
    expect(t.field()!.value).toBe('𝟘');
  });

  it('on a Mac, Ctrl+c and Ctrl+Option do not start', () => {
    const t = ed();
    (t.ctx as { mac: boolean }).mac = true;
    t.at('r3', 'name');
    t.key('c', { ctrlKey: true });
    t.key('ç', { ctrlKey: true, altKey: true });
    expect(t.field()).toBeNull();
  });

  it('a composition start is reported as « key »', () => {
    const t = ed();
    t.at('r3', 'name');
    t.key('a', { keyCode: 229 });
    expect(t.of('editingStarted').map((e) => e.start)).toEqual(['key']);
  });

  it('Ctrl, Alt or Cmd with Enter, Tab or Escape in the field are the field’s', () => {
    const t = ed();
    t.at('r3', 'name');
    t.key('F2');
    const f = t.field()!;
    for (const key of ['Enter', 'Tab', 'Escape']) for (const m of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) expect(t.key(key, m, f).defaultPrevented, `${key} ${JSON.stringify(m)}`).toBe(false);
    expect(t.field()).toBe(f);
    expect(t.of('editingStopped')).toEqual([]);
  });

  it('a double click in a nested grid’s cell opens no field of the outer grid', () => {
    const t = ed();
    const inner = document.createElement('div');
    inner.className = 'dzg';
    const cell = document.createElement('div');
    cell.className = 'dzg-cell';
    cell.dataset['col'] = 'n';
    inner.append(cell);
    t.cell('r2', 's')!.append(inner);
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.field()).toBeNull();
  });
});

describe('gaps: ending', () => {
  it('a refused Tab is prevented (the focus does not move)', () => {
    const t = ed();
    t.at('r3', 'n');
    t.key('F2');
    t.type('x');
    expect(t.key('Tab').defaultPrevented).toBe(true);
  });

  it('Tab, `cell` and `grid`: editingStopped kept by « tab »; every event from the user', () => {
    for (const tab of ['cell', 'grid'] as const) {
      const t = ed({ options: { tab } });
      t.at('r3', 'n');
      t.key('F2');
      t.type('8');
      t.key('Tab');
      expect(t.of('editingStopped')[0], tab).toEqual(expect.objectContaining({ kept: true, via: 'tab', source: 'user' }));
      expect(t.of('editingStarted').every((e) => e.source === 'user')).toBe(true);
      cleanup();
    }
  });

  it('a row removed while open: the removed cell is never focused', () => {
    const t = ed();
    t.at('r5', 'n');
    t.key('F2');
    const c = t.cell('r5', 'n')!;
    const focus = vi.spyOn(c, 'focus');
    t.g.kernel.rows.applyTransaction({ remove: ['r5'] });
    t.ctx.schedule();
    expect(focus).not.toHaveBeenCalled();
  });

  it('M05: the blur’s timer on a field already closed does nothing', async () => {
    const t = ed();
    t.at('r5', 'n');
    t.key('F2');
    t.type('77');
    t.key('Escape');
    await tick();
    expect(t.of('cellEdited')).toEqual([]);
    expect(t.of('editingStopped').length).toBe(1);
  });

  it('M27: the blur is decided one task later, not in a microtask (a focus back within the task keeps the field)', async () => {
    const t = ed();
    const out = document.body.appendChild(document.createElement('button'));
    t.at('r5', 'n');
    t.key('F2');
    t.type('6');
    const f = t.field()!;
    out.focus();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.field()).toBe(f);
    f.focus();
    await tick();
    expect(t.field()).toBe(f);
    expect(t.of('cellEdited')).toEqual([]);
  });
});

describe('gaps: the bubble', () => {
  type Box = { top: number; bottom: number; left: number; right: number };
  const stub = (cell: () => Box) => {
    const rect = (b: Box) => ({ ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON() {} }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('dzg-viewport')) return rect({ top: 0, bottom: 700, left: 0, right: 1000 });
      if (this.classList.contains('dzg-bubble')) return rect({ top: 0, bottom: 30, left: 0, right: 200 });
      return rect(cell());
    });
  };
  const refuse = (t: ReturnType<typeof ed>) => {
    t.at('r5', 'n');
    t.key('F2');
    t.type('x');
    t.key('Enter');
    return t.bubble()!;
  };
  it('a cell scrolled above the view, or sideways out of it: hidden', () => {
    const t = ed();
    let c: Box = { top: 100, bottom: 132, left: 300, right: 380 };
    stub(() => c);
    const b = refuse(t);
    c = { top: -60, bottom: -28, left: 300, right: 380 };
    t.ctx.schedule();
    expect(b.hidden).toBe(true);
    c = { top: 100, bottom: 132, left: 300, right: 380 };
    t.ctx.schedule();
    expect(b.hidden).toBe(false);
    c = { top: 100, bottom: 132, left: 1100, right: 1180 };
    t.ctx.schedule();
    expect(b.hidden).toBe(true);
  });

  it('a row removed while refused: hidden', () => {
    const t = ed();
    stub(() => ({ top: 100, bottom: 132, left: 300, right: 380 }));
    const b = refuse(t);
    t.g.kernel.rows.applyTransaction({ remove: ['r5'] });
    t.ctx.schedule();
    expect(b.hidden).toBe(true);
  });

  it('M08: no room below nor above: below the cell', () => {
    const t = ed();
    stub(() => ({ top: 20, bottom: 750, left: 300, right: 380 }));
    const b = refuse(t);
    expect(b.style.getPropertyValue('inset-block-start')).toBe('754px');
  });

  it('M22: placed when shown, before any paint', () => {
    const t = deferred();
    stub(() => ({ top: 100, bottom: 132, left: 300, right: 380 }));
    t.g.api.focusCell(k('r1'), 'n');
    t.flush();
    t.cell('r1', 'n')!.focus();
    t.key('F2');
    t.type('x');
    t.key('Enter');
    expect(t.bubble()!.style.getPropertyValue('inset-block-start')).toBe('136px');
  });
});

describe('gaps: touch', () => {
  const up = (el: Element, x = 10) => {
    const ev = new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: 10 });
    Object.defineProperty(ev, 'pointerType', { value: 'touch' });
    el.dispatchEvent(ev);
  };
  const mk = () => (vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout'] }), ed());
  it('400 ms apart opens, 401 does not', () => {
    let t = mk();
    up(t.cell('r3', 'n')!);
    vi.advanceTimersByTime(400);
    up(t.cell('r3', 'n')!);
    expect(t.field()).not.toBeNull();
    cleanup();
    t = mk();
    up(t.cell('r3', 'n')!);
    vi.advanceTimersByTime(401);
    up(t.cell('r3', 'n')!);
    expect(t.field()).toBeNull();
  });
  it('10 px apart opens, 11 does not', () => {
    let t = mk();
    up(t.cell('r3', 'n')!, 10);
    up(t.cell('r3', 'n')!, 20);
    expect(t.field()).not.toBeNull();
    cleanup();
    t = mk();
    up(t.cell('r3', 'n')!, 10);
    up(t.cell('r3', 'n')!, 21);
    expect(t.field()).toBeNull();
  });
  it('two different cells: no field; a third tap after Escape: no new field', () => {
    const t = mk();
    up(t.cell('r3', 'n')!);
    up(t.cell('r3', 'q')!);
    expect(t.field()).toBeNull();
    up(t.cell('r4', 'n')!);
    up(t.cell('r4', 'n')!);
    expect(t.field()).not.toBeNull();
    t.key('Escape');
    up(t.cell('r4', 'n')!);
    expect(t.field()).toBeNull();
  });
});
