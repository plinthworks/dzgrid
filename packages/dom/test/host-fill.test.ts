// The grid's height comes from its container, never its rows (docs/behaviors/virtual-scroll.md « The grid's height
// comes from its container », 1.11.0). jsdom has no layout: the layout sheet's rules are read here, the boxes are
// measured in Chrome, Firefox and WebKit (scripts/browser-host-fill.mjs). Expectations written by hand.
import { describe, it, expect } from 'vitest';
import { LAYOUT_CSS } from '../src/styles.js';

const rule = (selector: string): string => {
  const at = LAYOUT_CSS.indexOf(`${selector} {`);
  return at < 0 ? '' : LAYOUT_CSS.slice(at, LAYOUT_CSS.indexOf('}', at));
};

describe('the root fills its container (1.11.0)', () => {
  it('a flex item that grows (a flex host, a share of one), 100 % of a host with a height, its border inside', () => {
    const root = rule(':where(.dzg)');
    expect(root).toContain('flex: 1 1 auto;');
    expect(root).toContain('block-size: 100%;');
    expect(root).toContain('box-sizing: border-box;');
    // Shrinks below its rows (10 000 rows scroll inside, never grow the host).
    expect(root).toContain('min-block-size: 0;');
  });

  it('a host element (the Web Component) is no box of its own unless the page says: zero specificity, in the layer', () => {
    expect(rule(':where([data-dzg-host])')).toBe(':where([data-dzg-host]) { display: contents; ');
    expect(LAYOUT_CSS.indexOf(':where([data-dzg-host])')).toBeGreaterThan(LAYOUT_CSS.indexOf('@layer dzgrid.layout {'));
  });
});
