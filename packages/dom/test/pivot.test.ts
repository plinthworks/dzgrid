// `@dzgrid/dom/pivot` (Phase 10, DOM batch): docs/behaviors/pivot.md 17–24, 26, 29. Expectations written by hand from the
// sheet and the made-up sales of support-pivot.ts (Nord: Jan 10, Feb 5; Sud: Jan 2 + 4; no region: Feb 1), before the code.
import { describe, it, expect, afterEach } from 'vitest';
import type { Problem } from '@dzgrid/core';
import { sourceRows } from '@dzgrid/core/server';
import { cleanup } from './support-grouping.js';
import { BLANK, FEB, JAN, LABEL, NORD, SALES, SUD, band, made, pmake } from './support-pivot.js';

afterEach(cleanup);

const problems = (t: { problems(): Problem[] }, code: string) => t.problems().filter((p) => p.code === code);

describe('pivot on screen (pivot.md 17, 18)', () => {
  it('a label column at the start, the created columns in the months\' order, the value columns under « Total » at the end', () => {
    const t = pmake();
    expect(t.visible()).toEqual([LABEL, FEB, JAN, 'amount']);
    expect(t.ctx.columns.layout.start.columns.map((c) => c.id)).toEqual([LABEL]);
    expect(t.ctx.columns.get(LABEL)!.def.header).toBe('Region');
    expect(t.ctx.columns.get(FEB)!.def.header).toBe('Feb');
  });

  it('the groups are the last rows: labels, totals at each crossing, nothing where a crossing has no row, the row totals, the grand total', () => {
    const t = pmake();
    expect(t.shown()).toEqual(['[Nord]', '[Sud]', '[]', 'Σ']);
    expect(t.label(NORD, LABEL)).toBe('Nord (2)');
    expect([t.cellText(NORD, FEB), t.cellText(NORD, JAN), t.cellText(NORD, 'amount')]).toEqual(['5', '10', '15']);
    expect([t.cellText(SUD, FEB), t.cellText(SUD, JAN), t.cellText(SUD, 'amount')]).toEqual(['', '6', '6']);
    expect([t.cellText(BLANK, FEB), t.cellText(BLANK, JAN), t.cellText(BLANK, 'amount')]).toEqual(['1', '', '1']);
    const grand = t.keyAt(3) as string;
    expect([t.label(grand, LABEL), t.cellText(grand, FEB), t.cellText(grand, JAN), t.cellText(grand, 'amount')]).toEqual(['Total', '6', '16', '22']);
  });

  it('no chevron and no aria-expanded on the last rows; opening one does nothing', () => {
    const t = pmake();
    expect(t.row(NORD)!.hasAttribute('aria-expanded')).toBe(false);
    expect(t.cell(NORD, LABEL)!.querySelector('.dzg-toggle')!.hasAttribute('data-leaf')).toBe(true);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [NORD], expanded: true }, 'user');
    expect(t.shown()).toEqual(['[Nord]', '[Sud]', '[]', 'Σ']);
  });

  it('two grouping levels: the upper groups open and close, their label column header joins both names', () => {
    const t = pmake({ grouping: { by: ['region', 'month'], expanded: 'all' }, pivot: { columns: ['qty'], values: { amount: 'sum' } } });
    expect(t.ctx.columns.get(LABEL)!.def.header).toBe('Region / Month');
    expect(t.row(NORD)!.getAttribute('aria-expanded')).toBe('true');
    expect(t.shown()).toEqual(['[Nord]', '[Feb]', '[Jan]', '[Sud]', '[Jan]', '[]', '[Feb]', 'Σ']);
  });

  it('both bands emptied, the table comes back: the data columns and their rows, the grand total kept (owner, 2026-11-07)', () => {
    const t = pmake();
    t.papi().setBy([]);
    t.api().setBy([]);
    expect(t.visible()).toEqual(['title', 'region', 'month', 'amount', 'qty', 'sold']);
    expect([...t.ctx.columns.folded]).toEqual([]);
    expect(t.shown()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'Σ']);
    // A column put back in a band makes the pivot again.
    t.papi().setBy(['month']);
    t.api().setBy(['region']);
    expect(t.visible()).toEqual([LABEL, FEB, JAN, 'amount']);
  });

  it('the data columns are folded, never hidden: the user\'s states untouched; pivot off gives them back as they were', () => {
    const t = pmake();
    const hidden = () => t.ctx.columns.state().filter((s) => s.hidden).map((s) => s.id);
    expect(hidden()).toEqual([]);
    expect([...t.ctx.columns.folded].sort()).toEqual(['code', 'month', 'qty', 'region', 'sold', 'title']);
    t.papi().setOn(false);
    expect(t.visible()).toEqual(['title', 'region', 'month', 'amount', 'qty', 'sold']);
    expect([...t.ctx.columns.folded]).toEqual([]);
    expect(t.shown()).toEqual(['[Nord]', '[Sud]', '[]', 'Σ']);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [NORD], expanded: true }, 'user');
    expect(t.shown()).toEqual(['[Nord]', 'r1', 'r2', '[Sud]', '[]', 'Σ']);
    t.papi().setOn(true);
    expect(t.visible()).toEqual([LABEL, FEB, JAN, 'amount']);
  });

  it('two values: a band per month over « Amount · Qty », header bands with aria-colspan; the « Total » band over the value columns', () => {
    const t = pmake({ pivot: { columns: ['month'], values: { amount: 'sum', qty: 'sum' } } });
    expect(t.visible()).toEqual([LABEL, made([['month', 'tFeb']], 'amount'), made([['month', 'tFeb']], 'qty'), made([['month', 'tJan']], 'amount'), made([['month', 'tJan']], 'qty'), 'amount', 'qty']);
    const feb = t.host.querySelector<HTMLElement>(`.dzg-hgroup[data-g="${band([['month', 'tFeb']])}"]`)!;
    expect([feb.textContent, feb.getAttribute('role'), feb.getAttribute('aria-colspan')]).toEqual(['Feb', 'columnheader', '2']);
    const total = t.host.querySelector<HTMLElement>('.dzg-hgroup[data-g="~b:total"]')!;
    expect([total.textContent, total.getAttribute('aria-colspan')]).toEqual(['Total', '2']);
    expect(t.cellText(SUD, made([['month', 'tJan']], 'qty'))).toBe('4');
  });

  it('grouping no longer refuses spans() when no column merges cells (pivot.md 21)', () => {
    const t = pmake();
    expect(problems(t, 'unsupported-combination')).toEqual([]);
    expect(t.ctx.spans).not.toBeNull();
  });
});

describe('the pivot follows the data and the application (pivot.md 13, 29)', () => {
  it('a new month adds its column; the others keep their ids and the width the user gave', () => {
    const t = pmake();
    t.g.kernel.dispatch({ type: 'column.resize', column: JAN, width: 150, finished: true }, 'user');
    t.g.update({ rows: [...SALES, { id: 'r6', title: 'Fable', region: 'Nord', month: 'Mar', amount: 3, qty: 1, sold: '2026-03-01', code: 'x' }] });
    const MAR = made([['month', 'tMar']], 'amount');
    expect(t.visible()).toEqual([LABEL, FEB, JAN, MAR, 'amount']);
    expect(t.ctx.columns.state().find((s) => s.id === JAN)!.width).toBe(150);
    expect(t.cellText(NORD, MAR)).toBe('3');
  });

  it('the application\'s update({ columns }) keeps the pivot: the effective columns made again', () => {
    const t = pmake();
    t.g.update({ columns: [{ id: 'title', header: 'Book' }, { id: 'region', header: 'Area' }, { id: 'month', header: 'Month' }, { id: 'amount', header: 'Amount', type: 'number', aggFunc: 'sum' }] });
    expect(t.visible()).toEqual([LABEL, FEB, JAN, 'amount']);
    expect(t.ctx.columns.get(LABEL)!.def.header).toBe('Area');
    expect(t.cellText(NORD, 'amount')).toBe('15');
  });

  it('a click on a created column orders the groups by that total, the empty ones last; again, the other way', () => {
    const t = pmake();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: JAN, dir: 'asc' }] }, 'user');
    expect(t.shown()).toEqual(['[Sud]', '[Nord]', '[]', 'Σ']);
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: JAN, dir: 'desc' }] }, 'user');
    expect(t.shown()).toEqual(['[Nord]', '[Sud]', '[]', 'Σ']);
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: LABEL, dir: 'desc' }] }, 'user');
    expect(t.shown()).toEqual(['[Sud]', '[Nord]', '[]', 'Σ']);
  });

  it('values changed through the api: every created column of the value follows, the row totals too', () => {
    const t = pmake();
    t.papi().setValues({ amount: 'avg' });
    expect([t.cellText(SUD, JAN), t.cellText(SUD, 'amount')]).toEqual(['3', '3']);
    expect(t.papi().values()).toEqual({ amount: 'avg' });
    expect(t.papi().valueColumn(JAN)).toBe('amount');
  });

  it('pivot columns changed through the api; accepts() refuses a grouping column', () => {
    const t = pmake();
    t.papi().setBy([]);
    expect(t.visible()).toEqual([LABEL, 'amount']);
    expect(t.papi().accepts('region')).toBe(false);
    expect(t.papi().accepts('qty')).toBe(true);
  });
});

describe('sentences, the limit, the switch (pivot.md 23, 24, 9)', () => {
  it('a user\'s change of the pivot columns says how many columns were made', () => {
    const t = pmake();
    t.papi().setBy(['month', 'qty'], { user: true });
    expect(t.said().at(-1)).toBe('4 columns');
  });

  it('above maxColumns: no created column, a note in the strip, said once with the count only (not at creation)', () => {
    const t = pmake({ pivot: { columns: ['month'], values: { amount: 'sum' }, maxColumns: 2 } });
    expect(t.visible()).toEqual([LABEL, FEB, JAN, 'amount']);
    t.papi().setBy(['month', 'qty'], { user: true });
    expect(t.visible()).toEqual([LABEL, 'amount']);
    const note = t.host.querySelector<HTMLElement>('.dzg-pnote')!;
    expect(note.textContent).toBe('4 columns: too many for the screen; remove a column');
    expect(t.host.querySelector<HTMLElement>('.dzg-pbar')!.hidden).toBe(false);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [NORD], expanded: true }, 'user');
    expect(t.said().filter((x) => x.startsWith('4 columns')).length).toBe(1);
    expect(problems(t, 'pivot-too-many').map((p) => [p.path, p.detail])).toEqual([['pivot.columns', '4']]);
  });

  it('a too-many state at creation shows its note and says nothing yet', () => {
    const t = pmake({ pivot: { columns: ['month'], values: { amount: 'sum' }, maxColumns: 1 } });
    expect(t.host.querySelector<HTMLElement>('.dzg-pnote')!.textContent).toBe('2 columns: too many for the screen; remove a column');
    expect(t.said()).toEqual([]);
  });

  it('toggle: a « Pivot table » switch in the strip turns the mode off and on', () => {
    const t = pmake({ pivot: { columns: ['month'], values: { amount: 'sum' }, toggle: true } });
    const sw = t.host.querySelector<HTMLButtonElement>('.dzg-pswitch')!;
    expect([sw.getAttribute('role'), sw.getAttribute('aria-checked'), sw.textContent]).toEqual(['switch', 'true', 'Pivot table']);
    sw.click();
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(t.papi().on()).toBe(false);
    expect(t.visible()).toContain('title');
  });

  it('without toggle there is no switch and no strip shown', () => {
    const t = pmake();
    expect(t.host.querySelector('.dzg-pswitch')).toBeNull();
    expect(t.host.querySelector<HTMLElement>('.dzg-pbar')!.hidden).toBe(true);
  });

  it('French texts: the label column\'s header, « Total », the empty crossing\'s group « (Vide) »', () => {
    const t = pmake({ lang: 'fr', settings: { locale: 'fr-FR' } });
    expect(t.host.querySelector<HTMLElement>('.dzg-hgroup[data-g="~b:total"]')!.textContent).toBe('Total');
    expect(t.label(BLANK, LABEL)).toBe('(Vide) (1)');
  });
});

describe('refusals (pivot.md 26)', () => {
  it('beside a server source the pivot is not made: told, the api null', () => {
    // A server's settings in place of the browser's rows (the fixture's type has `rows`).
    const t = pmake({ settings: { rows: undefined, source: sourceRows({ fetch: async () => ({ rows: SALES, total: SALES.length }) }) } as never });
    expect(problems(t, 'unsupported-combination').some((p) => p.path === 'source' && p.detail === 'pivot')).toBe(true);
    expect(t.p.api(t.g)).toBeNull();
    expect(t.visible()).not.toContain(LABEL);
  });
});
