/**
 * HTML for a tooltip or a popover, cleaned (docs/behaviors/tooltips-popovers.md 16–17): an explicit opt-in of the
 * application. Parsed in a document with no browsing context (nothing in it runs or loads, guards: one of the three
 * `parseFromString` of the DOM layer), then rebuilt element by element in the target document from a fixed list —
 * no event attribute, no `style`, no URL of any kind survives. Cleaning stops scripts and loads, not misleading words:
 * the application decides what text reaches it.
 */
const KEEP = new Set('b strong i em u s small mark sub sup code kbd br p span div ul ol li dl dt dd table thead tbody tfoot tr th td caption hr h1 h2 h3 h4 h5 h6 abbr time'.split(' '));
/** Dropped with everything inside: what can run, load, submit or navigate. */
const DROP = new Set('script style iframe frame frameset object embed link meta base img picture source svg math template form input button select textarea a video audio track canvas noscript applet portal'.split(' '));
const ATTRS = new Set(['class', 'lang', 'dir', 'title', 'colspan', 'rowspan', 'datetime']);

/** The cleaned nodes, owned by `doc` (the page's by default). Text only when the browser cannot parse. */
export function safeHtml(html: string, doc: Document = document): DocumentFragment {
  const out = doc.createDocumentFragment();
  const Parser = doc.defaultView?.DOMParser;
  if (!Parser) return out.append(String(html)), out;
  const src = new Parser().parseFromString(String(html), 'text/html');
  copy(src.body, out, doc);
  return out;
}

function copy(from: Node, to: Node, doc: Document): void {
  for (const n of from.childNodes) {
    if (n.nodeType === 3) to.appendChild(doc.createTextNode(n.nodeValue ?? ''));
    if (n.nodeType !== 1) continue;
    const el = n as Element;
    const name = el.localName;
    if (DROP.has(name) || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    if (!KEEP.has(name)) {
      // Unknown but harmless (a custom element, `font`): its content kept, not the element.
      copy(el, to, doc);
      continue;
    }
    const made = doc.createElement(name);
    for (const a of el.attributes) {
      const v = a.value;
      if (!ATTRS.has(a.name)) continue;
      if ((a.name === 'colspan' || a.name === 'rowspan') && !/^\d{1,3}$/.test(v)) continue;
      if (a.name === 'dir' && !/^(ltr|rtl|auto)$/i.test(v)) continue;
      made.setAttribute(a.name, v);
    }
    copy(el, made, doc);
    to.appendChild(made);
  }
}
