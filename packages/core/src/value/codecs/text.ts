import { collatorFor } from '../../i18n/collate.js';
import { isBlank, type ValueCodec } from '../codec.js';

export const textCodec: ValueCodec<string> = {
  kind: 'text',
  keyKind: 'text',
  coerce: (raw) => (typeof raw === 'string' ? raw : typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : null),
  parse: (text) => text,
  format: (v) => v,
  sortKey: (v) => v,
  compare: (a, b, ctx) => collatorFor(ctx).compare(a, b),
  // A cell of spaces is not blank: someone typed them (filter-text.md).
  isEmpty: isBlank,
  equals: (a, b) => a === b,
  toExport: (v) => v,
};
