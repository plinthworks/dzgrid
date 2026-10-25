// The pasted-HTML reader loaded on demand (Phase 5 step 11b, owner S11b-Q5; clipboard.md 12–13): a paste whose
// clipboard holds no plain text reads its HTML string inside the event (the data is only readable then), prevents
// the event at once, and writes once the reader's chunk is there; a text paste never loads it. The failed load:
// `range-html-fail.test.ts`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, clip, cmake, fakeData, flush } from './support-clip.js';
import { R_ } from './support-range.js';

afterEach(cleanup);

const TABLE = '<table><tr><td>a</td><td>5</td></tr></table>';
/** Waits for the chunk and the microtasks after it. */
const loaded = async () => {
  await vi.dynamicImportSettled();
  await flush();
};
/** A clipboard whose data can be read during its event only (as browsers do). */
const expiring = (init: Record<string, string>) => {
  const d = fakeData(init);
  let open = true;
  const read = d.getData;
  d.getData = (t: string) => (open ? read(t) : '');
  return { d, close: () => void (open = false) };
};

describe('pasted HTML on demand (S11b-Q5)', () => {
  it('the HTML read inside the event, prevented at once, written once the reader is loaded: one request, the sentence, the block', async () => {
    const t = cmake();
    t.at('r0', 'name');
    const x = expiring({ 'text/html': TABLE });
    const { e } = clip('paste', x.d);
    x.close();
    expect(e.defaultPrevented).toBe(true);
    await loaded();
    expect(t.changes()).toEqual(['r0/name="a"', 'r0/qty=5']);
    expect(t.requests).toHaveLength(1);
    expect(t.block()).toBe('r0/name:r0/qty');
    expect(t.said().at(-1)).toBe('Cells pasted: 2. Saving');
  });

  it('written where it was pasted (the event\'s corners, keys not positions), wherever the focus went meanwhile', async () => {
    const t = cmake();
    t.at('r0', 'name');
    t.api().set(R_(['r0', 'name'], ['r1', 'qty']));
    clip('paste', { 'text/html': TABLE });
    t.at('r5', 'price');
    t.at('r6', 'name');
    await loaded();
    expect(t.changes()).toEqual(['r0/name="a"', 'r0/qty=5', 'r1/name="a"', 'r1/qty=5']);
  });

  it('a corner no longer shown when the reader is there: nothing written', async () => {
    const t = cmake();
    t.at('r0', 'name');
    clip('paste', { 'text/html': TABLE });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'qty', filter: { type: 'number', op: 'gt', value: 3 } } as never, 'api');
    await loaded();
    expect(t.requests).toEqual([]);
  });

  it('the grid destroyed before the reader is there: nothing written, nothing said, no throw', async () => {
    const t = cmake();
    t.at('r0', 'name');
    clip('paste', { 'text/html': TABLE });
    const said = vi.spyOn(t.ctx.live, 'announce');
    t.g.destroy();
    await loaded();
    expect(t.requests).toEqual([]);
    expect(said).not.toHaveBeenCalled();
  });

  it('api.paste(\'\', html): null at once (the paste lands later), then written', async () => {
    const t = cmake();
    t.at('r2', 'qty');
    expect(t.api().paste('', '<table><tr><td>9</td></tr></table>')).toBeNull();
    expect(t.requests).toEqual([]);
    await loaded();
    expect(t.changes()).toEqual(['r2/qty=9']);
  });

  it('review 4: an HTML paste overtaken by a later text paste on the same cells is dropped when the reader comes', async () => {
    const t = cmake();
    t.at('r0', 'name');
    clip('paste', { 'text/html': TABLE });
    clip('paste', { 'text/plain': 'later' });
    await loaded();
    expect(t.changes()).toEqual(['r0/name="later"']);
  });

  it('no plain text and no HTML: nothing, said nothing (no load needed)', async () => {
    const t = cmake();
    t.at('r0', 'name');
    expect(clip('paste', {}).e.defaultPrevented).toBe(true);
    await loaded();
    expect(t.requests).toEqual([]);
    expect(t.said()).toEqual([]);
  });
});
