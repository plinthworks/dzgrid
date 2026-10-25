// Pasted HTML (Phase 5 step 11b, docs/behaviors/clipboard.md 12–13; step11b-plan.md « The security rules for pasted
// HTML » 1–6): read only when `text/plain` is empty, over 4 MB ignored before parsing, parsed in an inert document,
// nothing of it ever enters the page, text nodes only (scripts, styles, templates skipped), spans clamped, the matrix
// capped; the reader is a chunk loaded on demand (owner S11b-Q5: each paste here waits for it); the S7 fixtures (Excel Windows CF_HTML, Google Sheets, LibreOffice) give the hand-written matrices.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { readTable } from '../src/range/html/index.js';
import { cleanup, clip, cmake, flush as micro } from './support-clip.js';

/** The reader's chunk loaded, then the microtasks after it. */
const flush = async () => {
  await vi.dynamicImportSettled();
  await micro();
};

afterEach(cleanup);

const FIX = `${process.cwd()}/spikes/s7-clipboard/fixtures/`;
const pad = (m: string[][]) => {
  const w = Math.max(...m.map((r) => r.length));
  return m.map((r) => [...r, ...Array(w - r.length).fill('')]);
};

const HOSTILE = [
  '<table><tr><td><img src="x" onerror="window.__dzgPwned=1">a</td></tr></table>',
  '<script>window.__dzgPwned=1</script><table><tr><td>a</td></tr></table>',
  '<table><tr><td><iframe src="https://example.invalid/"></iframe>a</td></tr></table>',
  '<table><tr><td><svg onload="window.__dzgPwned=1"><image href="https://example.invalid/i.png"/></svg>a</td></tr></table>',
  '<table><tr><td><object data="https://example.invalid/o"></object>a</td></tr></table>',
  '<link rel="stylesheet" href="https://example.invalid/s.css"><table><tr><td>a</td></tr></table>',
  '<style>@import url(https://example.invalid/i.css); td { background: url(https://example.invalid/b.png) }</style><table><tr><td>a</td></tr></table>',
  '<meta http-equiv="refresh" content="0;url=https://example.invalid/"><table><tr><td>a</td></tr></table>',
  '<base href="https://example.invalid/"><table><tr><td><a href="x">a</a></td></tr></table>',
  '<table><tr><td style="background:url(https://example.invalid/c.png)">a</td></tr></table>',
  '<table><tr><td><script>t</script>a</td></tr></table>',
  '<table><tr><td><style>p{}</style><noscript>n</noscript><template><b>t</b></template>a</td></tr></table>',
  '<table><tr><td><video poster="https://example.invalid/p.png"></video>a</td></tr></table>',
];

describe('pasted HTML: never in the page (clipboard.md 13)', () => {
  it('hostile payloads: only the text « a » reaches the save; no node of theirs enters the document; no handler runs', async () => {
    const t = cmake();
    const added: Node[] = [];
    const mo = new MutationObserver((list) => list.forEach((m) => added.push(...m.addedNodes)));
    mo.observe(document, { childList: true, subtree: true, attributes: true });
    const imp = vi.spyOn(document, 'importNode');
    const adopt = vi.spyOn(document, 'adoptNode');
    // One at a time: a paste still waiting for the reader is dropped by a later one (review 4).
    for (const [i, html] of HOSTILE.entries()) {
      t.at(`r${i}`, 'name');
      const { e } = clip('paste', { 'text/plain': '', 'text/html': html });
      expect(e.defaultPrevented, html).toBe(true);
      await flush();
    }
    await flush();
    mo.disconnect();
    expect(t.changes()).toEqual(HOSTILE.map((_, i) => `r${i}/name="a"`));
    const bad = added.filter((n) => n.nodeType === 1 && ((n as Element).matches('img, script, iframe, svg, object, link, style, meta, base, video, a, noscript, template') || (n as Element).querySelector('img, script, iframe, svg, object, link, style, meta, base, video, noscript, template')));
    expect(bad).toEqual([]);
    expect(added.filter((n) => n.nodeType === 1 && [...(n as Element).attributes].some((a) => /^on/i.test(a.name)))).toEqual([]);
    expect(imp).not.toHaveBeenCalled();
    expect(adopt).not.toHaveBeenCalled();
    expect((window as { __dzgPwned?: number }).__dzgPwned).toBeUndefined();
  });

  it('a non-empty text/plain wins over any HTML (the HTML is not even parsed)', () => {
    const t = cmake();
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    t.at('r0', 'name');
    clip('paste', { 'text/plain': 'plain', 'text/html': HOSTILE[0]! });
    expect(t.changes()).toEqual(['r0/name="plain"']);
    expect(parse).not.toHaveBeenCalled();
  });

  it('over 4 MB: ignored before parsing, nothing pasted, nothing said', async () => {
    const t = cmake();
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    t.at('r0', 'name');
    const big = `<table><tr><td>a</td></tr></table>${' '.repeat(5 << 20)}`;
    expect(clip('paste', { 'text/html': big }).e.defaultPrevented).toBe(true);
    expect(parse).not.toHaveBeenCalled();
    expect(t.requests).toEqual([]);
    await flush();
    expect(t.said()).toEqual([]);
    // Exactly 4 MB is read.
    const edge = '<table><tr><td>a</td></tr></table>';
    clip('paste', { 'text/html': edge + ' '.repeat((4 << 20) - edge.length) });
    await flush();
    expect(t.changes()).toEqual(['r0/name="a"']);
  });

  it('no table: nothing, nothing said', async () => {
    const t = cmake();
    t.at('r0', 'name');
    clip('paste', { 'text/html': '<p>hello</p>' });
    await flush();
    expect(t.requests).toEqual([]);
    expect(t.said()).toEqual([]);
  });

  it('a rowspan / colspan bomb: clamped (1 000 columns, the rows left), no hang; over maxPaste the matrix stops, too big', async () => {
    expect(readTable('<table><tr><td rowspan="65534" colspan="5000">x</td></tr><tr><td>y</td></tr></table>', window, 100_000)).toEqual([
      ['x', ...Array(999).fill('')],
      [...Array(1000).fill(''), 'y'],
    ]);
    expect(readTable(`<table>${'<tr><td>1</td></tr>'.repeat(10)}</table>`, window, 4)).toBe(false);
    const t = cmake({ range: { maxPaste: 4 } });
    t.at('r0', 'name');
    clip('paste', { 'text/html': `<table>${'<tr><td>1</td></tr>'.repeat(10)}</table>` });
    await flush();
    expect(t.requests).toEqual([]);
    await flush();
    expect(t.said().at(-1)).toBe('Paste too large: at most 4 cells; nothing pasted');
  });

  it('text only: <br> a line break, source whitespace collapsed, a cell of spaces / NBSP / breaks empty, th read as td', () => {
    expect(readTable('<table><thead><tr><th> H  1 </th></tr></thead><tbody><tr><td>l1<br>\n  l2</td></tr><tr><td>&nbsp;<br></td></tr><tr><td><b>b</b> <i>i</i></td></tr></tbody></table>', window, 100)).toEqual([['H 1'], ['l1\nl2'], [''], ['b i']]);
    expect(readTable('<p>none</p>', window, 100)).toBeNull();
    // Only the first table; a nested table's text is its cell's.
    expect(readTable('<table><tr><td>a</td></tr></table><table><tr><td>b</td></tr></table>', window, 100)).toEqual([['a']]);
  });

  it('review 2: an SVG <script> or <style> (lower case in the parsed tree) never enters a cell', () => {
    expect(readTable('<table><tr><td><svg><script>bad()</script><style>p{}</style><title>t</title></svg>a</td></tr></table>', window, 10)).toEqual([['ta']]);
    expect(readTable('<table><tr><td><math><style>m</style></math>b</td></tr></table>', window, 10)).toEqual([['b']]);
  });

  it('m27 NBSP inside a cell kept', () => {
    expect(readTable('<table><tr><td>a&nbsp;&nbsp;b</td></tr></table>', window, 10)).toEqual([['a\u00a0\u00a0b']]);
  });

  it('m29 a rowspan clamped to 1 000 in a longer table', () => {
    const html = `<table><tr><td rowspan="1001">x</td><td>a</td></tr>${'<tr><td>a</td></tr>'.repeat(999)}<tr><td>y</td></tr></table>`;
    expect((readTable(html, window, 1e6) as string[][])[1000]).toEqual(['y']);
  });

  it('m32 / review 6: rowspan 0 spans to the end of its table section (HTML), and no further', () => {
    expect(readTable('<table><tr><td rowspan="0">x</td><td>a</td></tr><tr><td>b</td></tr></table>', window, 10)).toEqual([['x', 'a'], ['', 'b']]);
    expect(readTable('<table><thead><tr><td rowspan="0">h</td><td>a</td></tr><tr><td>b</td></tr></thead><tbody><tr><td>c</td><td>d</td></tr></tbody></table>', window, 10)).toEqual([['h', 'a'], ['', 'b'], ['c', 'd']]);
    // Still counted against the cap.
    expect(readTable(`<table><tr><td rowspan="0">x</td></tr>${'<tr></tr>'.repeat(20)}</table>`, window, 5)).toBe(false);
  });

  it('the S7 fixtures give the hand-written matrices (expected.json)', () => {
    const want = JSON.parse(readFileSync(`${FIX}expected.json`, 'utf8')) as Record<string, { values: string[][] }>;
    for (const [file, { values }] of Object.entries(want)) expect(pad(readTable(readFileSync(FIX + file, 'utf8'), window, 100_000) as string[][]), file).toEqual(values);
  });

  it('read through the paste: an HTML-only Sheets payload becomes { text } inputs, the column readers apply', async () => {
    const t = cmake();
    t.at('r0', 'name');
    clip('paste', { 'text/html': readFileSync(`${FIX}sheets.html`, 'utf8') });
    await flush();
    // « 1,234.50 » in an English number column: 1234.5; « merged » refused in the number column, '' (the covered cell) clears.
    expect(t.changes()).toEqual(['r0/name="a"', 'r0/qty=1234.5', 'r0/price=null', 'r1/name="x\\ny"', 'r1/price=null']);
    expect(t.blinked()).toEqual(['r1/qty']);
  });
});
