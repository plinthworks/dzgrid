import { describe, it, expect } from 'vitest';
import { dataKey, isSelected, NO_SELECTION, type RowKey, type RowNode, type SelectionState } from '@dzgrid/core';
import { refusalProblems, ruleGate, vetSelection } from '@dzgrid/core/rules';

/**
 * `@dzgrid/core/rules` (step 21, docs/behaviors/selection-rules.md): the pure vetting of what a
 * selection command adds. Expectations by hand.
 */
type R = { id: string };
const k = (id: string): RowKey => dataKey(id)!;
const rows = new Map(Array.from({ length: 10 }, (_, i) => [k(`r${i + 1}`), { key: k(`r${i + 1}`), kind: 'data', level: 0, id: `r${i + 1}`, data: { id: `r${i + 1}` } } as RowNode<R>]));
const rowOf = (key: RowKey) => rows.get(key);
const inc = (...ids: string[]): SelectionState => ({ mode: 'include', keys: new Set(ids.map(k)) });
const exc = (...ids: string[]): SelectionState => ({ mode: 'exclude', keys: new Set(ids.map(k)) });
const ids = (s: SelectionState) => [...s.keys].map((x) => String(x).replace(/^d:\d+:/, ''));

describe('vetSelection', () => {
  it('lets a selection that adds nothing through unchanged, the rule never asked', () => {
    let asked = 0;
    const rule = () => (asked++, false);
    const next = inc('r1');
    const v = vetSelection(rule, rowOf, inc('r1', 'r2'), next);
    expect(v.state).toBe(next);
    expect(v.refused).toBeNull();
    expect(asked).toBe(0);
  });

  it('asks only the rows added, in the order of the next selection, against a running selection', () => {
    const seen: [string, string[]][] = [];
    const rule = (row: RowNode<R>, s: SelectionState) => {
      seen.push([row.data.id, ids(s)]);
      return row.data.id !== 'r3';
    };
    const v = vetSelection(rule, rowOf, inc('r1'), inc('r1', 'r2', 'r3', 'r4'));
    expect(seen).toEqual([['r2', ['r1']], ['r3', ['r1', 'r2']], ['r4', ['r1', 'r2']]]);
    expect(ids(v.state)).toEqual(['r1', 'r2', 'r4']);
    expect(v.refused).toEqual({ rows: [k('r3')], reason: null, cause: 'rule' });
  });

  it('starts a replacing selection from what it keeps of the previous one (a plain click: nothing)', () => {
    const seen: string[][] = [];
    const v = vetSelection((_r, s) => (seen.push(ids(s)), true), rowOf, inc('r1', 'r2'), inc('r5'));
    expect(seen).toEqual([[]]);
    expect(ids(v.state)).toEqual(['r5']);
  });

  it('changes nothing when every added row is refused, even rows the command took away', () => {
    const prev = inc('r1', 'r2');
    const v = vetSelection(() => false, rowOf, prev, inc('r5'));
    expect(v.state).toBe(prev);
    expect(v.refused!.rows).toEqual([k('r5')]);
  });

  it('keeps the first string the rule returns as the reason', () => {
    const v = vetSelection((row) => (row.data.id === 'r2' ? 'first' : row.data.id === 'r3' ? 'second' : true), rowOf, NO_SELECTION, inc('r1', 'r2', 'r3'));
    expect(v.refused).toEqual({ rows: [k('r2'), k('r3')], reason: 'first', cause: 'rule' });
    expect(ids(v.state)).toEqual(['r1']);
  });

  it('refuses a key whose row is not held, without asking the rule (cause unknown-row)', () => {
    let asked = 0;
    const v = vetSelection(() => (asked++, true), rowOf, NO_SELECTION, inc('r1', 'x99'));
    expect(asked).toBe(1);
    expect(ids(v.state)).toEqual(['r1']);
    expect(v.refused).toEqual({ rows: [k('x99')], reason: null, cause: 'unknown-row' });
  });

  it('says rule when rule refusals and unknown rows are mixed', () => {
    const v = vetSelection(() => false, rowOf, NO_SELECTION, inc('x99', 'r1'));
    expect(v.refused!.cause).toBe('rule');
  });

  it('refuses an everything-except selection made from an include one (needs-rows), the rule not asked', () => {
    let asked = 0;
    const prev = inc('r1');
    const v = vetSelection(() => (asked++, true), rowOf, prev, exc());
    expect(v.state).toBe(prev);
    expect(v.refused).toEqual({ rows: [], reason: null, cause: 'needs-rows' });
    expect(asked).toBe(0);
  });

  it('vets the rows an everything-except selection ticks again; new exclusions (unticks) are free', () => {
    const seen: string[] = [];
    const rule = (row: RowNode<R>, s: SelectionState) => (seen.push(row.data.id), expect(s.mode).toBe('exclude'), row.data.id !== 'r2');
    // r2 and r3 ticked again, r7 unticked.
    const v = vetSelection(rule, rowOf, exc('r2', 'r3'), exc('r7'));
    expect(seen).toEqual(['r2', 'r3']);
    expect(v.state.mode).toBe('exclude');
    expect(ids(v.state).sort()).toEqual(['r2', 'r7']);
    expect(isSelected(v.state, k('r3'))).toBe(true);
    expect(v.refused!.rows).toEqual([k('r2')]);
  });

  it('never asks a row already selected in an everything-except selection when it turns into an include one', () => {
    const seen: string[] = [];
    // Everything but r9 was selected; the include set keeps r1 (selected before) and adds r9.
    const v = vetSelection((row) => (seen.push(row.data.id), true), rowOf, exc('r9'), inc('r1', 'r9'));
    expect(seen).toEqual(['r9']);
    expect(ids(v.state)).toEqual(['r1', 'r9']);
  });

  it('passes a running selection the rule can count (at most two)', () => {
    const v = vetSelection((_r, s) => s.keys.size < 2, rowOf, NO_SELECTION, inc('r1', 'r2', 'r3', 'r4'));
    expect(ids(v.state)).toEqual(['r1', 'r2']);
    expect(v.refused!.rows).toEqual([k('r3'), k('r4')]);
  });
});

describe('refusalProblems', () => {
  it('tells a warning at `selection` with the cause as detail, never a key', () => {
    const p = refusalProblems({ rows: [k('secret-id')], reason: 'some text', cause: 'rule' });
    expect(p).toEqual([{ code: 'selection-refused', severity: 'warning', path: 'selection', detail: 'rule' }]);
    expect(JSON.stringify(p)).not.toContain('secret');
    expect(JSON.stringify(p)).not.toContain('some text');
  });
});

describe('ruleGate', () => {
  type Live = { rule?: (row: RowNode<R>, s: SelectionState, c: unknown) => boolean | string; sel: SelectionState; ctx: unknown };
  const make = (live: Live, reported: unknown[] = []) => ruleGate<R>(() => live.rule, rowOf, () => live.sel, () => live.ctx, (e) => reported.push(e));

  it('is off and lets everything through without a rule', () => {
    const g = make({ sel: NO_SELECTION, ctx: null });
    expect(g.on).toBe(false);
    expect(g.vet(NO_SELECTION, inc('r1'))).toBeNull();
  });

  it('vets with the rule, handing it the context third', () => {
    const seen: unknown[] = [];
    const live: Live = { rule: (row, _s, c) => (seen.push(c), row.data.id !== 'r2'), sel: NO_SELECTION, ctx: { ward: 'A' } };
    const g = make(live);
    expect(g.on).toBe(true);
    const v = g.vet(NO_SELECTION, inc('r1', 'r2'))!;
    expect(ids(v.state)).toEqual(['r1']);
    expect(seen).toEqual([live.ctx, live.ctx]);
  });

  it('a rule that throws refuses the row, the error reported', () => {
    const reported: unknown[] = [];
    const g = make({ rule: (row) => { if (row.data.id === 'r1') throw new Error('broke'); return true; }, sel: NO_SELECTION, ctx: null }, reported);
    expect(ids(g.vet(NO_SELECTION, inc('r1', 'r2'))!.state)).toEqual(['r2']);
    expect(g.refused(k('r1'))).toBe(true);
    expect(reported.map((e) => (e as Error).message)).toEqual(['broke', 'broke']);
  });

  it('asks each row once per selection, rule and context; a new rule or context gives a new skip', () => {
    let calls = 0;
    const live: Live = { rule: (row) => (calls++, row.data.id !== 'r3'), sel: NO_SELECTION, ctx: 1 };
    const g = make(live);
    const skip = g.skip;
    expect(skip(k('r3'))).toBe(true);
    expect(g.refused(k('r3'))).toBe(true);
    expect(skip(k('r4'))).toBe(false);
    expect(calls).toBe(2);
    expect(g.skip).toBe(skip);
    live.sel = inc('r1');
    expect(g.skip).toBe(skip);
    g.refused(k('r3'));
    expect(calls).toBe(3);
    live.ctx = 2;
    expect(g.skip).not.toBe(skip);
    const again = g.skip;
    live.rule = () => false;
    expect(g.skip).not.toBe(again);
    expect(g.refused(k('r4'))).toBe(true);
  });

  it('refuses a key whose row is not held', () => {
    const g = make({ rule: () => true, sel: NO_SELECTION, ctx: null });
    expect(g.refused(k('nope'))).toBe(true);
  });
});
