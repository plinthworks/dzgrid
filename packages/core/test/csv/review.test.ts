import { describe, it, expect } from 'vitest';
import { type ValueCodec } from '@dzgrid/core';
import { csv } from './support.js';

/** The review of step 10 (2026-10-19): the number exemption follows the text written, not the codec's claim. */
const numberLike = (out: (v: number) => string): ValueCodec<number> => ({
  kind: 'number',
  keyKind: 'number',
  coerce: (raw) => (typeof raw === 'number' ? raw : null),
  parse: (t) => Number(t),
  format: (v) => out(v),
  sortKey: (v) => v,
  compare: (a, b) => a - b,
  isEmpty: (v) => v === null || v === undefined,
  equals: (a, b) => a === b,
  toExport: (v) => out(v),
});

describe('step 10 review', () => {
  it('guards the text of a codec that says number but writes a formula', () => {
    const defs = [{ id: 'c', header: 'C', type: 'custom' as const, codec: numberLike(() => '=1+1') }];
    expect(csv(defs, [{ c: 5 }])).toBe("C\r\n'=1+1\r\n");
    expect(csv(defs, [{ c: 5 }], { text: 'display' })).toBe("C\r\n'=1+1\r\n");
  });

  it('still leaves a real negative number alone, in value and display mode', () => {
    const defs = [{ id: 'n', header: 'N', type: 'number' as const }];
    expect(csv(defs, [{ n: -5 }])).toBe('N\r\n-5\r\n');
    expect(csv(defs, [{ n: -1234.5 }], { text: 'display' })).not.toMatch(/^N\r\n'/);
  });
});
