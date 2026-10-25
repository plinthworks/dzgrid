// The base's seam for blocks of cells (Phase 5 step 11a, step11a-plan.md findings 4 and 7): `GridContext.multi`
// makes the viewport say aria-multiselectable whatever the row selection, and makes a Shift+click on a cell the
// feature's (the click events still go out; a box still ticks rows); the renderers spawned from the base one (a
// tree's pinned parents) are reachable. The layering: range-layering.test.ts.
import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { tree } from '../src/tree.js';
import { EN } from '../src/locales/en.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { cleanup, join as joinMsg, rmake, rowsOf, type R } from './support-range.js';

afterEach(cleanup);


describe('range seams: the base', () => {
  it('multi: the viewport says aria-multiselectable at every paint, the row selection none or single', () => {
    const t = rmake({ settings: { selection: { mode: 'single' } }, features: () => [] });
    expect(t.vp.hasAttribute('aria-multiselectable')).toBe(false);
    t.ctx.multi = true;
    t.g.api.refresh();
    expect(t.vp.getAttribute('aria-multiselectable')).toBe('true');
    delete t.ctx.multi;
    t.g.api.refresh();
    expect(t.vp.hasAttribute('aria-multiselectable')).toBe(false);
  });

  it('multi: a Shift+click on a cell selects no rows (selection.click), the click events still go out; on the box it still does', () => {
    const t = rmake({ settings: { selection: { mode: 'multi', click: true, checkbox: true } }, features: () => [] });
    t.click(t.cell('r1')!);
    t.ctx.multi = true;
    t.click(t.cell('r4', 'n')!, { shiftKey: true });
    expect(t.g.kernel.selection.keys.size).toBe(1);
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(2);
    expect(t.events.filter((e) => e.type === 'rowClicked')).toHaveLength(2);
    t.click(t.rowEl('r3')!.querySelector('.dzg-check')!, { shiftKey: true });
    expect(t.g.kernel.selection.keys.size).toBe(3);
    // Without the flag, today's behaviour: Shift+click ticks the rows between.
    delete t.ctx.multi;
    t.click(t.cell('r6', 'n')!, { shiftKey: true });
    expect(t.g.kernel.selection.keys.size).toBeGreaterThan(3);
  });

  it('spawned: the renderers made from the base one (a tree\'s pinned parents), in order', () => {
    const rows: R[] = [{ ...rowsOf(1)[0]!, id: 'S', parent: null }, ...rowsOf(40).map((r) => ({ ...r, parent: 'S' }))];
    const t = rmake({ rows, messages: joinMsg(EN, EN_TREE), features: () => [tree<R>({ parentId: (x) => x.parent ?? null })] });
    expect(t.ctx.rowRenderer.spawned).toHaveLength(1);
    expect(t.ctx.rowRenderer.spawned[0]!.mounted.size).toBe(0);
    const bare = rmake({ features: () => [] });
    expect(bare.ctx.rowRenderer.spawned).toEqual([]);
  });
});

// Step 11b (step11b-plan.md « The security rules for pasted HTML » 3; clipboard.md 3, 13): nothing pasted ever enters
// the page — no HTML sink anywhere in the entry, no node moved from a parsed document, no `execCommand`, no
// `navigator.clipboard` (the keys need neither). The scan checks itself against planted lines first.
describe('range seams: the clipboard never writes HTML into the page', () => {
  const DIR = `${process.cwd()}/packages/dom/src/range/`;
  const SINKS = /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|createContextualFragment|document\.write|\.importNode\(|\.adoptNode\(|execCommand|navigator\.clipboard|createElement\(\s*['"]template|\.srcdoc\b/;
  // The file that reads pasted HTML writes nothing to any tree at all.
  const MOVES = /\.(append|appendChild|prepend|insertBefore|replaceWith|replaceChildren|before|after|insertAdjacentElement)\(/;
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the scan finds planted sinks (its own check)', () => {
    for (const bad of ['el.innerHTML = h', 'x.outerHTML=y', 'el.insertAdjacentHTML("beforeend", h)', 'document.write(h)', 'document.importNode(n, true)', 'doc.adoptNode(n)', "document.execCommand('copy')", 'navigator.clipboard.readText()', "doc.createElement('template')"]) expect(SINKS.test(bad), bad).toBe(true);
    for (const bad of ['host.append(n)', 'p.appendChild(n)', 'a.replaceWith(b)']) expect(MOVES.test(bad), bad).toBe(true);
    expect(SINKS.test('// innerHTML in a comment is fine'.replace(/^\s*\/\/.*$/gm, ''))).toBe(false);
  });

  it('no file of src/range/ (the lazy reader\'s folder included) holds an HTML sink; the reader moves no node', () => {
    const files = readdirSync(DIR, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
    expect(files).toEqual(expect.arrayContaining(['clip.ts', 'index.ts', 'pointer.ts', 'html/index.ts']));
    for (const f of files) expect(strip(readFileSync(DIR + f, 'utf8')), f).not.toMatch(SINKS);
    for (const f of ['clip.ts', 'html/index.ts']) expect(strip(readFileSync(DIR + f, 'utf8')), f).not.toMatch(MOVES);
    // The parsed document is made by DOMParser only, never the live document's own parser.
    expect(readFileSync(`${DIR}html/index.ts`, 'utf8')).toMatch(/DOMParser\(\)\.parseFromString\(/);
    // The reader is loaded on demand (S11b-Q5): imported by `import()` only, never statically, from the entry.
    for (const f of files.filter((x) => !x.startsWith('html/'))) expect(readFileSync(DIR + f, 'utf8'), f).not.toMatch(/^import [^;]*from '\.\/html\//m);
    expect(readFileSync(`${DIR}index.ts`, 'utf8')).toMatch(/import\('\.\/html\/index\.js'\)/);
  });
});
