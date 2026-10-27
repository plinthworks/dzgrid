/**
 * The set filter's layout (docs/behaviors/filter-set.md), shipped in its lazy chunk and injected
 * when it loads: no colour, logical sides only, zero specificity (the theme colours it). The list
 * is as high as its rows, at most 18rem (eight rows), at least 4.5rem for the loading or failure line (owner's look,
 * app-feedback 18: no empty area under a short list; the popup is placed again as it grows), and the status line
 * one line high even while empty (the first load, step 18: the list moved 32 px when it filled); its options are
 * 2.25rem rows (36 px, owner's look: airy) placed over the spacer; a row is [box][label][count], the label in
 * its own direction and cut with an ellipsis, the count at the inline end (drawn from `data-n`, so the option's visible text is its label); the box a 1rem square,
 * its check mark a glyph (kept in forced colours).
 */
export const SET_CSS =
  // In the cascade layer dzgrid.layout, as the base's (owner T1, docs/behaviors/theming.md).
  '@layer dzgrid.layout{' +
  ':where(.dzg-fallw){display:flex;align-items:center;gap:.5rem;min-block-size:24px}' +
  // The search, the count line and select all apart (owner's second look, app-feedback 26: a host's reset of `p`
  // margins left the count squeezed between them).
  ':where(.dzg-fset){display:grid;gap:.5rem}' +
  ':where(.dzg-fstatus){margin:0;min-block-size:1.2em;min-block-size:1lh}' +
  ':where(.dzg-flistw){position:relative;min-inline-size:14rem}' +
  ':where(.dzg-flist){position:relative;min-block-size:4.5rem;max-block-size:18rem;overflow-y:auto}' +
  ':where(.dzg-fopt){position:absolute;inset-inline:0;box-sizing:border-box;display:flex;align-items:center;gap:.5rem;block-size:2.25rem;padding-inline:.5rem}' +
  ':where(.dzg-fname){flex:1;min-inline-size:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;unicode-bidi:plaintext;text-align:start}' +
  ':where(.dzg-fcount){unicode-bidi:isolate;margin-inline-start:auto}' +
  ':where(.dzg-fcount):before{content:attr(data-n)}' +
  ':where(.dzg-fopt>.dzg-box){flex:none;display:inline-grid;place-items:center;inline-size:1rem;block-size:1rem;box-sizing:border-box;outline:1px solid;outline-offset:-1px;line-height:1}' +
  ':where(.dzg-fopt[aria-selected=true]>.dzg-box):before{content:"\\2713"}' +
  // A `filterOption` part (feedback pass C) paints the label area (owner's look): the grid's label steps aside, its
  // box and its count stay.
  ':where(.dzg-fopt[data-part]>.dzg-fname){display:none}:where(.dzg-fpart){display:contents}' +
  ':where(.dzg-flistw>p){position:absolute;inset-block-start:0;inset-inline:0;margin:.5rem}' +
  ':where(.dzg-flistw>.dzg-fretry){position:absolute;inset-block-end:.5rem;inset-inline-start:.5rem}' +
  '}';
