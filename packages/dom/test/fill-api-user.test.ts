// The fill's API as a user gesture (Phase 6 step 3, step03-plan §1 seam c; owner S12-Q12, Q3-1): the column menu's
// « Fill down » / « Fill right » call `down({ user: true })` / `end({ user: true })`: the cells written with source
// `user` (as Ctrl+D / Ctrl+R), said as the key; without the flag the API's own source, unchanged (fill.md 19).
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, flush, fmake } from './support-fill.js';

afterEach(cleanup);

const sources = (t: ReturnType<typeof fmake>) => t.of('cellEdited').map((e) => e.source);

describe('fill API: { user: true }', () => {
  it('down({ user: true }): source user, the counts, said as Ctrl+D', async () => {
    const t = fmake();
    t.at('r4', 'qty');
    expect(t.fapi().down({ user: true })).toEqual({ filled: 1, refused: 0, readOnly: 0 });
    expect(sources(t)).toEqual(['user']);
    await flush();
    expect(t.said().at(-1)).toMatch(/^Cells filled: 1/);
  });

  it('end({ user: true }): source user', () => {
    const t = fmake();
    t.at('r4', 'price');
    expect(t.fapi().end({ user: true })).toEqual({ filled: 1, refused: 0, readOnly: 0 });
    expect(sources(t)).toEqual(['user']);
  });

  it('without it: the API\'s source, as before', () => {
    const t = fmake();
    t.at('r4', 'price');
    t.fapi().down();
    t.fapi().end();
    expect(sources(t)).toEqual(['api', 'api']);
  });
});
