// @vitest-environment node
// The owner's third look (docs/phase-6-steps/app-feedback.md 29–35): one focus ring on a period field, the box's; the
// header search box's magnifier in the accent when its column is filtered; a default spinner (the loading overlay, a
// filter's busy flash), still under reduced motion; a line at the pinned columns' edge; near-invisible scroll bars.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const flat = (f: string): string => readFileSync(here(f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
const sheets = [['dzgrid.css', flat('../dzgrid.css')], ['dzgrid.unlayered.css', flat('../dzgrid.unlayered.css')]] as const;
const comfort = [['dzgrid.comfort.css', flat('../dzgrid.comfort.css')], ['dzgrid.comfort.unlayered.css', flat('../dzgrid.comfort.unlayered.css')]] as const;
/** The declarations of the first rule whose selector list is exactly `sel`. */
const rule = (src: string, sel: string): string => {
  const m = new RegExp(`(?:^|[{}]) ?${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(src);
  return m ? m[1]!.trim() : '';
};

describe.each(sheets)('%s', (_, css) => {
  it('a period field: the ring on its box, none on the input inside it (app-feedback 30)', () => {
    expect(css).toMatch(/\.dzg-fpop :focus-visible:not\(\.tz-dateinput__row \*\), \.dzg-fpop \.tz-dateinput__row:has\(:focus-visible\) \{ outline: 2px solid/);
    expect(css).not.toMatch(/\.dzg-fpop :focus-visible[,{ ]/);
  });

  it('a filtered column’s search box: the magnifier in the accent (app-feedback 32)', () => {
    expect(rule(css, '[data-dzg-filtered] .dzg-hfbox::before, [data-dzg-filtered] .dzg-hfbox::after')).toBe('border-color: var(--tz-accent);');
  });

  it('the pinned columns’ edge: a line on the side the centre slides under (app-feedback 34)', () => {
    expect(rule(css, '.dzg-seg-start:not(:empty)::after, .dzg-seg-end:not(:empty)::after')).toContain('border-inline-end: var(--dzg-line, 1px) solid var(--tz-border);');
    expect(rule(css, '.dzg-seg-end:not(:empty)::after')).toBe('inset-inline: 0 auto;');
  });

  it('neither the spinner nor the scroll bars: they are the comfort sheet’s', () => {
    expect(css).not.toMatch(/scrollbar|dzg-spin|aria-busy=true\]::after/);
  });
});

describe.each(comfort)('%s', (_, css) => {
  it('a default spinner over the loading words and over the rows during a busy flash, out of the pointer’s way (app-feedback 29, 32)', () => {
    const both = rule(css, ".dzg-viewport[aria-busy=true] ~ .dzg-overlay::before, .dzg[aria-busy=true]::after");
    expect(both).toContain('content: "";');
    expect(both).toContain('border-block-start-color: var(--tz-accent);');
    const flash = rule(css, ".dzg[aria-busy=true]::after");
    expect(flash).toContain('pointer-events: none;');
    expect(flash).toContain('margin: auto;');
  });

  it('it turns only where motion is welcome and not switched off: still under reduced motion', () => {
    const motion = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(motion).toMatch(/^@media \(prefers-reduced-motion: no-preference\) \{[^@]*\.dzg:not\(\[data-motion=off\]\) \.dzg-viewport\[aria-busy=true\] ~ \.dzg-overlay::before, \.dzg:not\(\[data-motion=off\]\)\[aria-busy=true\]::after \{ animation: dzg-spin/);
    expect(css.match(/animation:/g)).toHaveLength(1);
    expect(css).toContain('@keyframes dzg-spin { to { rotate: 1turn; } }');
  });

  it('near-invisible scroll bars by default, plainer on hover or focus; `--dzg-scrollbar: auto` the system’s; forced colours the system’s (app-feedback 35)', () => {
    expect(rule(css, '.dzg-viewport')).toContain('scrollbar-width: var(--dzg-scrollbar, thin); scrollbar-color: var(--tz-border) transparent;');
    expect(rule(css, '.dzg:is(:hover, :focus-within) .dzg-viewport')).toBe('scrollbar-color: var(--tz-fg-muted) transparent;');
    expect(css).toContain('@container style(--dzg-scrollbar: auto) { .dzg-viewport { scrollbar-color: auto; } }');
    expect(css).toMatch(/@supports not \(scrollbar-color: auto\) \{ @container not style\(--dzg-scrollbar: auto\) \{ \.dzg-viewport::-webkit-scrollbar \{ width: 8px; height: 8px; \}/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{ \.dzg-viewport \{ scrollbar-width: auto; scrollbar-color: auto; \} \}/);
  });
});

// The comfort sheet (owner, decisions.md « Comfort stylesheet »): the spinner and the thin scroll bars in an optional sheet of
// their own, never in the audit profile (K.8); the lines granted with it.
describe('the comfort sheet: built, exported, shipped, budgeted, not in K.8', () => {
  const ROOT = here('../../../');
  const budget = JSON.parse(readFileSync(`${ROOT}size-budget.json`, 'utf8')) as { entries: Record<string, { file?: string; maxGzip: number | null; css?: string[] }> };
  const theme = JSON.parse(readFileSync(here('../package.json'), 'utf8')) as { exports: Record<string, string>; files: string[] };
  it('dzgrid.comfort.css and its unlayered copy, from comfort.scss, exported and shipped', () => {
    for (const f of ['dzgrid.comfort.css', 'dzgrid.comfort.unlayered.css', 'comfort.scss']) {
      expect(theme.exports[`./${f}`], f).toBe(`./${f}`);
      expect(theme.files, f).toContain(f);
    }
  });
  it('its own line, the measure + 10 % (551 → 650); the base theme 2 850, the date adapters 2 850, K.8 84 450', () => {
    expect(budget.entries['@dzgrid/theme/dzgrid.comfort.css']).toEqual({ file: 'packages/theme/dzgrid.comfort.css', maxGzip: 650 });
    expect(budget.entries['@dzgrid/theme']!.maxGzip).toBe(2850);
    expect(budget.entries['@dzgrid/dom/filters: date adapters (lazy)']!.maxGzip).toBe(2850);
    expect(budget.entries['profile: audit screen (K.8)']!.maxGzip).toBe(84950); // 84 800 since step 12 (Q12-1); 84 950: owner « set include only » (2026-10-29)
  });
  it('compiled from comfort.scss (no drift), no colour literal, no physical side', () => {
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(readFileSync(here('../dzgrid.comfort.css'), 'utf8')).toBe(out('@use "comfort";'));
    expect(readFileSync(here('../dzgrid.comfort.unlayered.css'), 'utf8')).toBe(out('@use "comfort" with ($layered: false);'));
    expect(checkScss(readFileSync(here('../comfort.scss'), 'utf8'))).toEqual([]);
  });
  it('K.8 loads the base theme only', () => {
    expect(budget.entries['profile: audit screen (K.8)']!.css).toEqual(['packages/theme/dzgrid.css']);
  });
});
