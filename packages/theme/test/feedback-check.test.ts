// @vitest-environment node
// Feedback pass G (docs/phase-6-steps/feedback-plan.md item 8, app-feedback.md 8): an unticked box was invisible in
// the light theme of an app with Tailwind 3. Its preflight (`*,::before,::after{border-width:0}`) is unlayered, so it
// beats the theme's layered `border` on `.dzg-box`: no edge, the box's surface the row's, nothing drawn until ticked.
// The box's edge is an outline (inset by its width): no border reset touches it, it follows the radius, and it stays
// in forced colours (a box-shadow would not).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const spec = JSON.parse(readFileSync(here('../contrast-pairs.json'), 'utf8')) as { pairs: { what: string; fg: string; bg: string; min: number }[] };
const rule = (css: string, sel: string) => new RegExp(`(?:^|[}\\s])${sel.replace(/[.[\]()=']/g, (c) => `\\${c}`)} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? null;

for (const file of ['dzgrid.css', 'dzgrid.unlayered.css']) {
  describe(`the selection box's edge survives an unlayered border reset (${file})`, () => {
    const css = readFileSync(here(`../${file}`), 'utf8');
    it('the box draws its edge with an outline, not a border', () => {
      const box = rule(css, '.dzg-box')!;
      expect(box).not.toMatch(/(^|\s)border:/);
      expect(box).toMatch(/outline: 1px solid var\(--tz-fg-muted\);/);
      expect(box).toMatch(/outline-offset: -1px;/);
    });
    it('ticked, mixed: the edge takes the accent (outline-color)', () => {
      expect(css).toMatch(/\.dzg-box\[aria-checked=mixed\] \{\s*outline-color: var\(--tz-accent\);\s*background: var\(--tz-accent\);/);
    });
    it('refused: the edge dashed (outline-style)', () => {
      expect(rule(css, ".dzg-check[data-dzg-refused] .dzg-box")).toMatch(/outline-style: dashed;/);
    });
  });
}

describe('the box edge in forced colours, and its contrast pairs', () => {
  it('contrast.css draws it in CanvasText through the outline', () => {
    const css = readFileSync(here('../contrast.css'), 'utf8');
    expect(css).toMatch(/\.dzg-box \{\s*outline-color: CanvasText;\s*\}/);
  });
  it('is checked at 3:1 on the row and on a hovered row', () => {
    expect(spec.pairs).toContainEqual({ what: 'check box border', fg: '--tz-fg-muted', bg: '--tz-bg', min: 3 });
    expect(spec.pairs).toContainEqual({ what: 'check box border on a hovered row', fg: '--tz-fg-muted', bg: '--dzg-row-hover-bg', min: 3 });
  });
});
