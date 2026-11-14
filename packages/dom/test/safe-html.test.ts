// The tooltips' HTML cleaner (docs/behaviors/tooltips-popovers.md 16–17). Hostile inputs written by hand: each must
// come out with no way to run, load or navigate, and its harmless words kept.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { safeHtml } from '../src/tooltip.js';

const html = (s: string): string => {
  const box = document.createElement('div');
  box.append(safeHtml(s));
  return box.innerHTML;
};

afterEach(() => vi.restoreAllMocks());

describe('safeHtml keeps', () => {
  it('text and the listed elements with their listed attributes', () => {
    expect(html('<p class="k" lang="fr" dir="rtl" title="t">Un <b>deux</b> <em>trois</em><br>quatre</p>')).toBe('<p class="k" lang="fr" dir="rtl" title="t">Un <b>deux</b> <em>trois</em><br>quatre</p>');
    expect(html('<table><tbody><tr><th colspan="2">Lit</th></tr><tr><td rowspan="1">A</td><td>B</td></tr></tbody></table>')).toBe('<table><tbody><tr><th colspan="2">Lit</th></tr><tr><td rowspan="1">A</td><td>B</td></tr></tbody></table>');
    expect(html('<ul><li><code>x</code></li><li><kbd>Esc</kbd></li></ul><time datetime="2026-11-13">today</time>')).toBe('<ul><li><code>x</code></li><li><kbd>Esc</kbd></li></ul><time datetime="2026-11-13">today</time>');
  });

  it('plain text as text (nothing parsed into markup)', () => {
    expect(html('1 &lt; 2 &amp; 3')).toBe('1 &lt; 2 &amp; 3');
    expect(safeHtml('a < b').textContent).toBe('a < b');
  });
});

describe('safeHtml refuses', () => {
  it('scripts and styles, with their content', () => {
    expect(html('<script>alert(1)</script>ok')).toBe('ok');
    expect(html('<style>*{display:none}</style>ok')).toBe('ok');
    // In the body (at the very start it would open in the head, where the parser moves a <p> out of it).
    expect(html('a<noscript><p>x</p></noscript>ok')).toBe('aok');
  });

  it('every event attribute and every style attribute', () => {
    expect(html('<b onclick="alert(1)" onmouseover="x()" style="background:url(https://example.invalid/t)">b</b>')).toBe('<b>b</b>');
    expect(html('<span ONERROR="x()">s</span>')).toBe('<span>s</span>');
  });

  it('anything that loads: images, frames, objects, media, links, SVG, MathML, forms', () => {
    expect(html('<img src="https://example.invalid/x.png" onerror="alert(1)">')).toBe('');
    expect(html('<iframe src="https://example.invalid"></iframe><object data="x"></object><embed src="x">')).toBe('');
    expect(html('<video src="x"></video><audio src="x"></audio><picture><source srcset="x"></picture>')).toBe('');
    expect(html('<link rel="stylesheet" href="https://example.invalid/s.css"><meta http-equiv="refresh" content="0;url=x">')).toBe('');
    expect(html('<svg><script>alert(1)</script><image href="x"/></svg><math><mi>x</mi></math>')).toBe('');
    expect(html('<form action="https://example.invalid"><input value="v"><button>go</button></form>')).toBe('');
  });

  it('links (a tooltip is no place for one; `javascript:` never survives)', () => {
    expect(html('<a href="javascript:alert(1)">click</a>')).toBe('');
    expect(html('<a href="https://example.invalid">site</a>')).toBe('');
  });

  it('URL-bearing attributes on kept elements', () => {
    expect(html('<span data-x="1" href="javascript:x" src="x" srcset="x" background="x" formaction="x" xlink:href="x">s</span>')).toBe('<span>s</span>');
  });

  it('a bad dir or span count', () => {
    expect(html('<p dir="javascript:x">p</p><td colspan="1e9">x</td>')).toBe('<p>p</p>x');
    expect(html('<table><tbody><tr><td colspan="javascript">x</td></tr></tbody></table>')).toBe('<table><tbody><tr><td>x</td></tr></tbody></table>');
  });

  it('unknown elements: their content kept, not the element', () => {
    expect(html('<x-widget onclick="a()"><b>in</b></x-widget><font color="red">f</font>')).toBe('<b>in</b>f');
  });

  it('templates and their content (inert markup that a later script could stamp)', () => {
    expect(html('<template><img src=x onerror=alert(1)></template>ok')).toBe('ok');
  });

  it('nested tricks: a script split by a dropped element, comments, CDATA', () => {
    // `scr<script` is one unknown element's name: unwrapped; the stray end tags are ignored; what is left is words.
    expect(html('<scr<script>x</script>ipt>alert(1)</script>')).toBe('xipt&gt;alert(1)');
    expect(html('<!-- <img src=x onerror=alert(1)> -->ok')).toBe('ok');
    expect(html('<p><![CDATA[<img src=x>]]></p>')).not.toContain('<img');
  });

  it('never runs anything while parsing', () => {
    const spy = vi.fn();
    (window as unknown as { __hit: () => void }).__hit = spy;
    safeHtml('<img src="x" onerror="window.__hit()"><script>window.__hit()</script><svg onload="window.__hit()"></svg>');
    expect(spy).not.toHaveBeenCalled();
  });

  it('builds the nodes in the document it is given', () => {
    const other = document.implementation.createHTMLDocument('');
    const f = safeHtml('<b>x</b>', other);
    expect(f.ownerDocument).toBe(other);
    expect(f.firstChild!.ownerDocument).toBe(other);
  });
});
