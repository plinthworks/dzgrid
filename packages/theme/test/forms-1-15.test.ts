// @vitest-environment node
// 1.15.0 — form editing marks (owner 2026-11-21 « fais-les tous »; edit-batch.md 4, edit-row.md 3, editors.md 26):
// a pending cell's triangle and tint (a shape, not colour alone; its corner by direction), a row being edited
// outlined, the yes/no checkbox, the searching list's note; forced colours. Both copies. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sheet } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const body = (f: string, sel: string, at = 0) => sheet(read(f)).rules.filter((r) => r.at.length === at && r.selector === sel).map((r) => r.body).join(' ');
const MARK = 'var(--dzg-pending-mark, var(--tz-warning))';
const TINT = 'var(--dzg-pending-bg, color-mix(in srgb, var(--tz-warning) 10%, transparent))';

describe.each(['forms.css', 'forms.unlayered.css'])('%s', (f) => {
  it('a pending cell: a triangle in its inline-start top corner over a tint, from the other corner in right to left', () => {
    expect(body(f, '.dzg-cell--unsaved')).toBe(`background-image: linear-gradient(135deg, ${MARK} 0 0.4rem, transparent 0), linear-gradient(${TINT}, ${TINT});`);
    expect(body(f, '.dzg-cell--unsaved:dir(rtl)')).toBe(`background-image: linear-gradient(225deg, ${MARK} 0 0.4rem, transparent 0), linear-gradient(${TINT}, ${TINT});`);
  });

  it('held, the pending dot is gone and the cell keeps its own padding (the triangle says it)', () => {
    expect(body(f, '.dzg-cell--unsaved.dzg-cell--pending::after')).toBe('content: none;');
    expect(body(f, '.dzg-cell--unsaved.dzg-cell--pending')).toBe('padding-inline-end: calc(var(--dzg-cell-padding-inline, 0.5rem) * var(--dzg-density, 1));');
  });

  it('a row being edited: a line round it over its cells, --dzg-row-editing-outline over the accent', () => {
    expect(body(f, '.dzg-row[data-dzg-row-editing]::after')).toBe("content: \"\"; position: absolute; inset: 0; z-index: 3; border: 2px solid var(--dzg-row-editing-outline, var(--tz-accent)); pointer-events: none;");
  });

  it('the yes/no field: the cell a label, its box at the inline start', () => {
    expect(body(f, '.dzg-yesno')).toBe('display: flex; align-items: center; cursor: pointer;');
    expect(body(f, '.dzg-yesno > input')).toMatch(/accent-color: var\(--tz-accent\);/);
  });

  it('the searching list note: muted, hidden when empty', () => {
    expect(body(f, '.dzg-search-note')).toMatch(/color: var\(--tz-fg-muted\);/);
    expect(body(f, '.dzg-search-note[hidden]')).toBe('display: none;');
  });

  it('forced colours: a dashed outline for a pending cell, the row in Highlight', () => {
    expect(body(f, '.dzg-cell--unsaved', 1)).toBe('outline: 2px dashed CanvasText; outline-offset: -3px;');
    expect(body(f, '.dzg-row[data-dzg-row-editing]::after', 1)).toBe('border-color: Highlight;');
  });

  it('no colour literal', () => {
    expect(read(f)).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});
