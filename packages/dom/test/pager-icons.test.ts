// The pager's marks as the application's icons (docs/behaviors/presentation-settings.md 41, owner 2026-11-14):
// `icons.pagerFirst`, `pagerPrevious`, `pagerNext`, `pagerLast` with `theming()`. Written before the code; expectations
// by hand. jsdom: what is written and refused, the rules that draw them (pagination()'s own CSS); size, colour and mirroring in real browsers
// (scripts/browser-1-12.mjs).
import { afterEach, describe, expect, it } from 'vitest';
import type { Problem } from '@dzgrid/core';
import { cleanup, pmake } from './support-pagination.js';
import { pagination } from '../src/pagination.js';
import { theming } from '../src/theme.js';
import { PAGINATION_CSS as CSS } from '../src/pagination/styles.js';

afterEach(cleanup);

const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>';
const make = (icons?: object) => pmake({ features: [pagination(), theming()], settings: icons ? { icons } : {} });
const root = (h: HTMLElement) => h.querySelector<HTMLElement>('.dzg')!;
const told = (p: Problem[]) => p.filter((x) => x.code === 'invalid-setting').map((x) => [x.path, x.detail]);

describe('the pager\'s icons (41)', () => {
  it('each given one named on the root with its mask variable; the others not', () => {
    const t = make({ pagerFirst: ok, pagerNext: ok });
    const r = root(t.host);
    expect(r.getAttribute('data-dzg-icons')).toBe('pager-first pager-next');
    expect(r.style.getPropertyValue('--dzg-icon-pager-first')).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(r.style.getPropertyValue('--dzg-icon-pager-next')).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(r.style.getPropertyValue('--dzg-icon-pager-previous')).toBe('');
    expect(told(t.problems())).toEqual([]);
  });

  it('the marks, their names and their states unchanged in the DOM (the icon is drawn by CSS over the hidden character)', () => {
    const t = make({ pagerFirst: ok, pagerPrevious: ok, pagerNext: ok, pagerLast: ok });
    const marks = (['first', 'prev', 'next', 'last'] as const).map((g) => t.btn(g)!);
    expect(marks.map((b) => b.querySelector('span')!.textContent)).toEqual(['\xab', '‹', '›', '\xbb']);
    expect(marks.map((b) => b.querySelector('span')!.getAttribute('aria-hidden'))).toEqual(['true', 'true', 'true', 'true']);
    expect(marks.map((b) => b.getAttribute('aria-label'))).toEqual(['First page', 'Previous page', 'Next page', 'Last page']);
    expect(t.btn('first')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('refused as the other icons: the default kept, told at its name, never the SVG', () => {
    const t = make({ pagerLast: '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/x.png"/></svg>', pagerPrevious: ok });
    expect(told(t.problems())).toEqual([['settings.icons.pagerLast', 'element']]);
    expect(root(t.host).getAttribute('data-dzg-icons')).toBe('pager-previous');
  });

  it('live: given, then taken away (the characters back)', () => {
    const t = make();
    expect(root(t.host).hasAttribute('data-dzg-icons')).toBe(false);
    t.g.update({ icons: { pagerPrevious: ok } } as never); // the grid's settings typed for R; icons need no row type
    expect(root(t.host).getAttribute('data-dzg-icons')).toBe('pager-previous');
    t.g.update({ icons: undefined } as never); // as above
    expect(root(t.host).hasAttribute('data-dzg-icons')).toBe(false);
  });

  it('the rules: each mark only under its name, sized by the button (1em) or --dzg-icon-size, in the button\'s colour, mirrored in right to left', () => {
    for (const [name, go] of [['pager-first', 'first'], ['pager-previous', 'prev'], ['pager-next', 'next'], ['pager-last', 'last']]) {
      expect(CSS).toContain(`:where([data-dzg-icons~=${name}] [data-go=${go}]>span){--dzg-i:var(--dzg-icon-${name})}`);
    }
    const body = CSS.slice(CSS.indexOf(':where([data-dzg-icons~=pager-first] [data-go=first]>span,'));
    const rule = body.slice(0, body.indexOf('}'));
    expect(rule).toContain('inline-size:var(--dzg-icon-size,1em)');
    expect(rule).toContain('background:currentColor');
    expect(rule).toContain('-webkit-text-fill-color:transparent');
    expect(rule).toContain('mask:var(--dzg-i) center/contain no-repeat');
    // Each mirrored under its own name only: a character left (Bidi_Mirrored) is never turned twice.
    const P = '[data-dzg-icons~=pager-first] [data-go=first]>span,[data-dzg-icons~=pager-previous] [data-go=prev]>span,[data-dzg-icons~=pager-next] [data-go=next]>span,[data-dzg-icons~=pager-last] [data-go=last]>span';
    expect(CSS).toContain(`:where(:is(${P}):dir(rtl)){scale:-1 1}`);
    expect(CSS).toContain(`@media (forced-colors:active){:where(${P}){forced-color-adjust:none;background:ButtonText}}`);
    expect(CSS).not.toContain('*=pager');
  });
});
