/**
 * The HTML a copy writes (Phase 5 step 11b, docs/behaviors/clipboard.md 7; step11b-plan.md L5): a `<table>` of escaped
 * texts. Pasted HTML is read by `./html/index.ts`, a chunk loaded on demand (owner S11b-Q5). No HTML sink in this
 * folder (`range-seams.test.ts` scans it).
 */

/** Every text escaped (`&`, `<`, `>`, `"` as numeric references), its line breaks as `<br>`. */
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`).replace(/\r\n?|\n/g, '<br>');

/** The table a copy writes: `dir` the grid's; `<th>` for the first row when it holds the headers (the API's). */
export const tableOf = (m: readonly (readonly string[])[], dir: string, head: boolean): string =>
  `<table dir="${dir}"><tbody>${m.map((r, i) => `<tr>${r.map((c) => (head && !i ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
