// The owner's accidental fills on `orders-edit.html?focus=range` (2026-10-26: a block grown by one row, a whole Montant
// column written with 161 000): a fill starts only once the pointer has moved 4 px from its press on the handle (a
// press that slips across a cell's edge by less is no fill, and its click arms the no-drag way as before); the dotted
// target shows from that move on. And the whole block is the source of a drag: N rows repeat in a cycle, a series
// per column goes on (fill.md 3, 13), checked against values written BY HAND, through the real handle and pointer.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, flush, fmake, frows } from './support-fill.js';
import { R_ } from './support-range.js';

afterEach(cleanup);

describe('the 4 px threshold (fill.md 13)', () => {
  it('a press on the handle at its cell\'s bottom edge, moved 3 px into the next row: no target, no filling, nothing written', async () => {
    const t = fmake();
    t.at('r2', 'qty');
    const a = t.pt('r2', 'qty');
    const b = t.pt('r3', 'qty');
    const edge = (a.clientY + b.clientY) / 2;
    const from = { clientX: a.clientX, clientY: edge - 1 };
    t.down(t.handle()!, from);
    t.move({ clientX: a.clientX, clientY: edge + 2 });
    expect(t.target()).toEqual([]);
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(false);
    t.up({ clientX: a.clientX, clientY: edge + 2 });
    await flush();
    expect(t.requests).toHaveLength(0);
  });

  it('6 px inside the source cell: no drag yet (it starts on leaving the source, 4 px or more from the press)', () => {
    const t = fmake();
    t.at('r2', 'qty');
    const a = t.pt('r2', 'qty');
    t.down(t.handle()!, a);
    t.move({ clientX: a.clientX, clientY: a.clientY + 6 });
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(false);
    t.up({ clientX: a.clientX, clientY: a.clientY + 6 });
  });

  it('an edge slip past 4 px (edge − 1 to edge + 3) is no fill either: the target needs the pointer half a row inside its cell', async () => {
    const t = fmake();
    t.at('r2', 'qty');
    const a = t.pt('r2', 'qty');
    const b = t.pt('r3', 'qty');
    const edge = (a.clientY + b.clientY) / 2;
    t.down(t.handle()!, { clientX: a.clientX, clientY: edge - 1 });
    t.move({ clientX: a.clientX, clientY: edge + 3 });
    expect(t.target()).toEqual([]);
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(false);
    t.up({ clientX: a.clientX, clientY: edge + 3 });
    await flush();
    expect(t.requests).toHaveLength(0);
  });

  it('upward too: a slip 3 px over the source\'s top edge fills nothing; half a row into the row above fills it', async () => {
    const t = fmake();
    t.at('r4', 'qty');
    const a = t.pt('r3', 'qty');
    const b = t.pt('r4', 'qty');
    const h = b.clientY - a.clientY;
    const edge = (a.clientY + b.clientY) / 2;
    t.down(t.handle()!, { clientX: b.clientX, clientY: edge + 1 });
    t.move({ clientX: b.clientX, clientY: edge - 3 });
    expect(t.target()).toEqual([]);
    t.move({ clientX: b.clientX, clientY: edge - h / 2 - 1 });
    expect(t.target()).toEqual(['r3/qty']);
    t.up({ clientX: b.clientX, clientY: edge - h / 2 - 1 });
    await flush();
    // r4's qty (16 mod 11 = 5) copied up into r3.
    expect(t.changes()).toEqual(['r3/qty=5']);
  });

  it('the preview follows the same rule: two rows only once the pointer is half a row into the second; the fill writes the last preview', async () => {
    const t = fmake();
    t.at('r2', 'qty');
    const a = t.pt('r2', 'qty');
    const b = t.pt('r3', 'qty');
    const h = b.clientY - a.clientY;
    const edge = (a.clientY + b.clientY) / 2;
    t.down(t.handle()!, { clientX: a.clientX, clientY: edge - 1 });
    t.move({ clientX: a.clientX, clientY: edge + h / 2 + 1 });
    expect(t.target()).toEqual(['r3/qty']);
    // A quarter row into r4: still r3 only.
    t.move({ clientX: a.clientX, clientY: edge + h + h / 4 });
    expect(t.target()).toEqual(['r3/qty']);
    t.up({ clientX: a.clientX, clientY: edge + h + h / 4 });
    await flush();
    expect(t.changes()).toEqual(['r3/qty=4']);
  });

  it('a deliberate one-row fill: half a row into the next cell, past 4 px, the dotted target, then the fill at the release', async () => {
    const t = fmake();
    t.at('r2', 'qty');
    const a = t.pt('r2', 'qty');
    const b = t.pt('r3', 'qty');
    const edge = (a.clientY + b.clientY) / 2;
    const h = b.clientY - a.clientY;
    t.down(t.handle()!, { clientX: a.clientX, clientY: edge - 1 });
    t.move({ clientX: a.clientX, clientY: edge + 2 });
    t.move({ clientX: a.clientX, clientY: edge + h / 2 + 1 });
    expect(t.target()).toEqual(['r3/qty']);
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(true);
    t.up({ clientX: a.clientX, clientY: edge + h / 2 + 1 });
    await flush();
    // One number: copied (fill.md 3).
    expect(t.changes()).toEqual(['r3/qty=4']);
  });
});

describe('the whole block is the source of a drag (owner: « il copie la première ligne de la sélection »)', () => {
  it('three rows of text and numbers dragged down four rows: the text in a cycle, an even series goes on, an uneven one repeats', async () => {
    // qty = i² mod 11 → r1..r3 = 1, 4, 9 (uneven: repeats); price r1..r3 = 10, 20, 30 (a series), 0 below; name N1..N3 (a cycle).
    const t = fmake({ rows: frows(30).map((r, i) => ({ ...r, price: i >= 1 && i <= 3 ? i * 10 : 0 })) });
    t.at('r1', 'name');
    expect(t.api().set(R_(['r1', 'name'], ['r3', 'price']))).toBe(true);
    expect(t.handleAt()).toBe('r3/price');
    t.dragTo('r7', 'price');
    await flush();
    expect(t.changes()).toEqual([
      'r4/name="N1"', 'r4/qty=1', 'r4/price=40',
      'r5/name="N2"', 'r5/qty=4', 'r5/price=50',
      'r6/name="N3"', 'r6/qty=9', 'r6/price=60',
      'r7/name="N1"', 'r7/qty=1', 'r7/price=70',
    ]);
    expect(t.block()).toBe('r1/name:r7/price');
  });

  it('property: a block of 2 to 5 rows over name and qty, dragged down to the last row shown by the handle; each written row is the source row (k mod n), by hand', async () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    for (let run = 0; run < 40; run++) {
      const t = fmake();
      // The target stays on the rows shown (r0..r9 here): a point below the body is the last row shown.
      const top = 1 + rnd(3);
      const n = 2 + rnd(4);
      const k = 1 + rnd(9 - (top + n - 1));
      const id = (i: number) => `r${i}`;
      t.at(id(top), 'name');
      expect(t.api().set(R_([id(top), 'name'], [id(top + n - 1), 'qty']))).toBe(true);
      expect(t.handleAt(), `run ${run}`).toBe(`${id(top + n - 1)}/qty`);
      t.dragTo(id(top + n - 1 + k), 'qty');
      await flush();
      const want: string[] = [];
      // qty = i² mod 11: a series only when the source's steps are equal (by hand: never for 2+ consecutive squares mod 11 except n = 2).
      const q = (i: number) => (i * i) % 11;
      const src = Array.from({ length: n }, (_, j) => q(top + j));
      const steps = src.slice(1).map((v, j) => v - src[j]!);
      const even = steps.every((s) => s === steps[0]);
      for (let j = 0; j < k; j++) {
        const r = top + n + j;
        want.push(`${id(r)}/name="N${top + (j % n)}"`);
        const v = even ? src[0]! + (n + j) * steps[0]! : src[j % n]!;
        // qty refuses below 0 (min 0): a refused cell is not in the request.
        if (v >= 0 && v !== q(r)) want.push(`${id(r)}/qty=${v}`);
      }
      expect(t.changes(), `run ${run}: top ${top}, n ${n}, k ${k}`).toEqual(want);
      cleanup();
    }
  });
});

describe('the application clears the block during a handle drag (review of the fix)', () => {
  it('clear() mid-drag cancels the fill: nothing written at the release, the block not given back, no target left', async () => {
    const t = fmake();
    t.at('r1', 'qty');
    expect(t.api().set(R_(['r1', 'qty'], ['r2', 'qty']))).toBe(true);
    t.dragTo('r5', 'qty', { noUp: true });
    expect(t.target()).toEqual(['r3/qty', 'r4/qty', 'r5/qty']);
    t.api().clear();
    expect(t.target()).toEqual([]);
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(false);
    t.up(t.pt('r5', 'qty'));
    await flush();
    expect(t.requests).toHaveLength(0);
    expect(t.block()).toBeNull();
  });
});

