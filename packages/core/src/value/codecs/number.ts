import { formattersFor, type NumberFormatSpec } from '../../i18n/format.js';
import { isBlank, REJECTED, type ValueCodec } from '../codec.js';
import { readMachineNumber, readNumber } from '../number.js';

export function numberCodecWith(spec: NumberFormatSpec = {}): ValueCodec<number> {
  return {
    kind: 'number',
    keyKind: 'number',
    coerce: (raw) => readMachineNumber(raw),
    why: () => 'invalid-cell-value',
    parse: (text, ctx) => readNumber(text, ctx) ?? REJECTED,
    format: (v, ctx) => formattersFor(ctx).number(spec)(v),
    sortKey: (v) => v,
    compare: (a, b) => a - b,
    isEmpty: (v) => isBlank(v) || (typeof v === 'number' && Number.isNaN(v)),
    equals: (a, b) => a === b,
    toExport: (v) => (v === 0 ? '0' : String(v)),
  };
}

export const numberCodec: ValueCodec<number> = numberCodecWith();
