// A feature list holding something that is not a feature (JS callers, or a value cast past the types): 1.11.0, owner
// 2026-11-10 « C » — writing the site, `pivot()` (grouping's companion, `grouping({ pivot })`) put in `features` made `createGrid` throw a
// TypeError. Bad input never throws (CLAUDE.md): each such item is one `invalid-setting` at `features[i]`, with the
// value's kind as detail (never its content), and is skipped; the real features beside it work.
import { afterEach, describe, expect, it } from 'vitest';
import type { GridEvent, Problem } from '@dzgrid/core';
import { pivotShape } from '@dzgrid/core/pivot';
import { autoColumns } from '@dzgrid/core/auto-columns';
import { infiniteRows } from '@dzgrid/core/infinite';
import { cleanup, emake, type R } from './support-edit.js';
import { pivot } from '../src/pivot.js';
import { grouping } from '../src/grouping.js';
import { columnHover } from '../src/column-hover.js';
import type { GridFeature } from '../src/features.js';
import { EN } from '../src/locales/en.js';
import { EN_GROUP } from '../src/locales/en-group.js';
import { EN_PIVOT } from '../src/locales/en-pivot.js';

afterEach(cleanup);

const problemsOf = (events: GridEvent<R>[]): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as { problems: readonly Problem[] }).problems);

describe('a feature list with something that is not a feature', () => {
  const odd: [string, unknown, string][] = [
    ['pivot() of @dzgrid/dom/pivot, grouping’s companion', pivot(), 'object'],
    ['the pivot shape of @dzgrid/core/pivot', pivotShape(), 'object'],
    ['the pivot factory, not called', pivot, 'function'],
    ['autoColumns()', autoColumns([{ id: 'a', n: 1 }]), 'object'],
    ['a source binding', infiniteRows({ fetch: () => Promise.resolve({ rows: [], total: 0 }) } as never), 'object'], // the options' exact shape does not matter here
    ['null', null, 'object'], // typeof null
    ['a number', 42, 'number'],
    ['an object without setup', { id: 'x' }, 'object'],
  ];
  for (const [what, value, kind] of odd) {
    it(`${what}: no throw, one invalid-setting at its index, skipped`, () => {
      const hover = columnHover();
      let m!: ReturnType<typeof emake>;
      expect(() => (m = emake({ settings: { features: [hover, value as GridFeature] } }))).not.toThrow(); // a JS caller's list
      const bad = problemsOf(m.events).filter((p) => p.path.startsWith('features'));
      expect(bad).toEqual([expect.objectContaining({ code: 'invalid-setting', severity: 'warning', path: 'features[1]', detail: kind })]);
      expect([m.ctx.features.length, m.host.querySelector('.dzg-row') !== null]).toEqual([1, true]); // the real one set up, rows drawn
    });
  }

  it('one feature alone, not in a list: taken as a list, nothing thrown or told', () => {
    const m = emake({ settings: { features: columnHover() as never } }); // a JS caller's value, not a list
    expect(problemsOf(m.events).filter((p) => p.path.startsWith('features'))).toEqual([]);
    expect(m.ctx.features).toHaveLength(1); // set up
  });

  it('pivot() where it belongs, in grouping({ pivot }): nothing told', () => {
    const m = emake({ settings: { features: [grouping({ pivot: pivot() })], messages: { ...EN, text: { ...EN.text, ...EN_GROUP.text, ...EN_PIVOT.text } } } });
    expect(problemsOf(m.events).filter((p) => p.path.startsWith('features['))).toEqual([]);
  });
});
