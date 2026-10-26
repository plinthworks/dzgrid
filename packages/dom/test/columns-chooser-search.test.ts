// The chooser's search (Phase 6 step 4, docs/behaviors/columns-chooser.md 14–16, 21; O12; a11y §21 152): the header
// text and the group names folded as the quick search (case, accents, Arabic hamza forms and short vowels), « contains »;
// a group matching shows all its columns; no match: « No column » in a status; the count said after a 500 ms pause; the
// grid never changed by it; reordering off while it is not empty (no ▲ ▼ handles, Alt+arrows say so); Escape empties it
// first, then closes.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake, ccol } from './support-columns-panel.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('narrowing the list', () => {
  it('« contains », case ignored; the grid unchanged; emptied: every row back', () => {
    const t = cmake();
    t.api().open(t.appButton);
    const n = t.columnsChanged().length;
    t.type('AM');
    expect(t.rows()).toEqual(['name', 'amount']);
    expect(t.columnsChanged().length).toBe(n);
    t.type('');
    expect(t.rows()).toEqual(['ref', 'name', 'date', 'qty', 'amount', 'note']);
  });

  it('French accents and Arabic hamza forms and short vowels folded', () => {
    const t = cmake({ lang: 'fr', columns: [ccol('a', 'Échéance'), ccol('b', 'Prénom'), ccol('c', 'إسم'), ccol('d', 'مَبْلَغ')] });
    t.api().open(t.appButton);
    t.type('eche');
    expect(t.rows()).toEqual(['a']);
    t.type('PRENOM');
    expect(t.rows()).toEqual(['b']);
    t.type('اسم');
    expect(t.rows()).toEqual(['c']);
    t.type('مبلغ');
    expect(t.rows()).toEqual(['d']);
  });

  it('a group\'s name matching shows all its columns, inside their group; a column matching shows its group around it', () => {
    const t = cmake({ columns: [ccol('ref', 'Ref'), { id: 'when', header: 'Dates', children: [ccol('d1', 'Ordered'), ccol('d2', 'Sent')] }, ccol('x', 'X')] as never });
    t.api().open(t.appButton);
    t.type('dates');
    expect(t.rows()).toEqual(['d1', 'd2']);
    t.type('sent');
    expect(t.rows()).toEqual(['d2']);
    expect(t.row('d2')!.closest('[role=group]')).not.toBeNull();
  });

  it('no match: « No column » in a status; a match: the status empty', () => {
    const t = cmake();
    t.api().open(t.appButton);
    const status = t.panel()!.querySelector<HTMLElement>('[role=status]')!;
    expect(status.textContent).toBe('');
    t.type('zzz');
    expect(t.rows()).toEqual([]);
    expect(status.textContent).toBe('No column');
    t.type('date');
    expect(status.textContent).toBe('');
  });

  it('the count said once after a 500 ms pause', () => {
    vi.useFakeTimers();
    const t = cmake();
    t.api().open(t.appButton);
    t.said().length = 0;
    t.type('a');
    vi.advanceTimersByTime(300);
    t.type('am');
    vi.advanceTimersByTime(499);
    expect(t.said()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(t.said()).toEqual(['Columns found: 2']);
  });
});

describe('reordering is off while searching (21)', () => {
  it('no ▲, ▼ or handle; Alt+arrows on a box say « Empty the search… » and move nothing', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.type('a');
    expect(t.panel()!.querySelectorAll('button[data-act=up], button[data-act=down], button[data-act=drag]').length).toBe(0);
    t.box('date')!.focus();
    const n = t.columnsChanged().length;
    t.key('ArrowDown', { altKey: true });
    expect(t.columnsChanged().length).toBe(n);
    expect(t.said().at(-1)).toBe('Empty the search to change the order');
  });
});

describe('Escape (O12)', () => {
  it('in a non-empty search: emptied, still open; again: closed', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.type('dat');
    const e = t.key('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(t.search()!.value).toBe('');
    expect(t.rows().length).toBe(6);
    expect(t.dialog()).not.toBeNull();
    t.key('Escape');
    expect(t.dialog()).toBeNull();
  });
});
