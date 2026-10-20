import { cellPart } from './draw.js';

/**
 * Yes/no cells (owner Q2), registered as `'cell.boolean'`: every boolean column takes it. True shows
 * `✓` and `cell.yes`, false `✗` and `cell.no`, in the grid's language (the codec's `true` / `false`
 * is not translated); a blank shows nothing. No tone: a "no" is not an error. A bundle without the
 * texts throws here, which the grid reports.
 */
export const cellBoolean = cellPart('dzg-bool', (c) => (c.value === true ? [c.msg('cell.yes'), '✓'] : c.value === false ? [c.msg('cell.no'), '✗'] : null));
