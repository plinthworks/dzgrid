/**
 * The set filter's layout (docs/behaviors/filter-set.md), shipped in its lazy chunk and injected
 * when it loads: no colour, logical sides only, zero specificity (the theme colours it). The list
 * is about ten rows high, fixed (loading or an error never resizes the popup); its options are
 * 1.75rem rows (28 px, at least 24 px at any zoom) placed over the spacer; a row is [box][label][count], the label in
 * its own direction and cut with an ellipsis, the count at the inline end (drawn from `data-n`, so the option's visible text is its label); the box a 1rem square,
 * its check mark a glyph (kept in forced colours).
 */
export const SET_CSS =
  ':where(.dzg-fallw){display:flex;align-items:center;gap:.5rem;min-block-size:24px}' +
  ':where(.dzg-flistw){position:relative;block-size:17.5rem;min-inline-size:14rem}' +
  ':where(.dzg-flist){position:relative;block-size:100%;overflow-y:auto}' +
  ':where(.dzg-fopt){position:absolute;inset-inline:0;box-sizing:border-box;display:flex;align-items:center;gap:.5rem;block-size:1.75rem;padding-inline:.25rem}' +
  ':where(.dzg-fname){flex:1;min-inline-size:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;unicode-bidi:plaintext;text-align:start}' +
  ':where(.dzg-fcount){unicode-bidi:isolate}' +
  ':where(.dzg-fcount):before{content:attr(data-n)}' +
  ':where(.dzg-fopt>.dzg-box){flex:none;display:inline-grid;place-items:center;inline-size:1rem;block-size:1rem;box-sizing:border-box;border:1px solid;line-height:1}' +
  ':where(.dzg-fopt[aria-selected=true]>.dzg-box):before{content:"\\2713"}' +
  ':where(.dzg-flistw>p){position:absolute;inset-block-start:0;inset-inline:0;margin:.5rem}' +
  ':where(.dzg-flistw>.dzg-fretry){position:absolute;inset-block-end:.5rem;inset-inline-start:.5rem}';
