/**
 * Pasted HTML and long plain texts, read (Phase 5 step 11b, docs/behaviors/clipboard.md 12–13; step11b-plan.md « The security rules for
 * pasted HTML »): a chunk of `@dzgrid/dom/range` loaded only when a paste carries no plain text (owner S11b-Q5). The
 * first `<table>` of a document parsed by `DOMParser` — a document with no browsing context, where no script runs and
 * nothing is fetched — walked for its text nodes only; nothing of it is ever put into the page, no reference to it is
 * kept. No HTML sink here (`range-seams.test.ts` scans this folder too).
 */

import { decodeTsv } from '@dzgrid/core/range';

/**
 * A plain text over 64 K characters (review 3): refused (false) when it holds more cells than the cap — its lines (one
 * final break dropped; the split stops past the cap) × its first line's cells, a quoted break or tab counted as one —
 * before any decoding; else decoded.
 */
export const tsv = (t: string, cap: number): string[][] | false => {
  const L = t.split(/\r\n|\n|\r/, cap + 2);
  L.at(-1) || L.pop();
  return L.length * L[0]!.split('\t').length > cap ? false : decodeTsv(t);
};

// Any case: an SVG or MathML `script` / `style` is lower case in the parsed tree (review 2).
const SKIP = /^(script|style|noscript|template)$/i;

/**
 * The cells of the first table of pasted HTML, as texts (rule 4): `<br>` a line break, the source's whitespace
 * collapsed, a cell of spaces, NBSP or breaks empty; `colspan` / `rowspan` the only attributes read, clamped to 1 000
 * and to the rows left (rowspan 0: to the end of its section), the cells they cover empty. Null: over 4 MB (checked before parsing) or no table; false: more
 * than `max` cells (rule 5, too big).
 */
export function readTable(html: string, win: Window, max: number): string[][] | false | null {
  if (html.length > 4 << 20) return null;
  const doc = new (win as Window & typeof globalThis).DOMParser().parseFromString(html, 'text/html');
  const t = doc.querySelector('table');
  if (!t) return null;
  const out: string[][] = [];
  const trs = t.rows;
  let n = 0;
  for (let r = 0; r < trs.length; r++) {
    const row = (out[r] ??= []);
    let c = 0;
    for (const td of trs[r]!.cells) {
      while (row[c] !== undefined) c++;
      // Elements and text nodes; a script, a style, a noscript or a template skipped with all they hold.
      const w = doc.createTreeWalker(td, 5, { acceptNode: (x) => (SKIP.test(x.nodeName) ? 2 : 1) });
      let s = '';
      for (let x = w.nextNode(); x; x = w.nextNode()) s += x.nodeName === 'BR' ? '\0' : x.nodeType === 3 ? (x as Text).data : '';
      s = s.replace(/[ \t\r\n\f]+/g, ' ').replace(/ ?\0 ?/g, '\n').replace(/^ +| +$/g, '');
      // The DOM gives colSpan 1..1 000 and rowSpan 0..65 534; 0 spans to the end of the row's table section (HTML).
      const tr = trs[r]!;
      const rs = Math.min(td.rowSpan || (tr.parentNode as HTMLTableSectionElement).rows.length - tr.sectionRowIndex, trs.length - r, 1000);
      const cs = td.colSpan;
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
        if (++n > max) return false;
        (out[r + i] ??= [])[c + j] = i || j || /^\s*$/.test(s) ? '' : s;
      }
      c += cs;
    }
  }
  // A hole (a row shorter than the spans above it) is read as empty by the plan.
  return out;
}
