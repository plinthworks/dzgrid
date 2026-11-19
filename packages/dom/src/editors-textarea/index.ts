import type { Ed, EdEnv } from '../editors/index.js';

/**
 * The long-text box's layout (editors.md 19), injected once per document or shadow root: over the cell from its top
 * (from its bottom when `data-up`), at least as tall, growing to `--dzg-textarea-max-block`; its row above the rows
 * under it and not clipping it while it is open. Unlayered, so the theme's one-line field (`padding-block: 0`) does not
 * squash it; `:where()` keeps it easy to override.
 */
export const TEXTAREA_CSS =
  ':where([data-dzg-editing]>.dzg-ta){inset-block-end:auto;min-block-size:100%;max-block-size:var(--dzg-textarea-max-block,12em);padding-block:.375rem;line-height:1.25;resize:none;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto}' +
  ':where([data-dzg-editing]>.dzg-ta[data-up]){inset-block:auto 0}:where(.dzg-cell:has(>.dzg-ta)){overflow:visible}:where(.dzg-row:has(>.dzg-seg>[data-dzg-editing]>.dzg-ta)){contain:none;z-index:2}';

/**
 * The long-text editor (1.14.0, editors.md 18–22): a `<textarea>` made by the editors as their text field (named, `dir`
 * auto, the column's cap), given here its keys and its size. Enter (Shift, Alt) inserts a line; Ctrl/Cmd+Enter keeps
 * (the editors' own, before this), Tab keeps and moves, Escape gives up. It grows with its lines to its maximum, upward
 * when the view ends under it. Its own entry, `@dzgrid/dom/editors-textarea`: `editors({ textarea: textareaEditor })`.
 */
export function textareaEditor(x: EdEnv, f: HTMLTextAreaElement): Ed {
  const { g } = x;
  const root = g.el.root.getRootNode() as Document | ShadowRoot;
  if (g.settings.injectStyles !== false && !root.querySelector('style[data-dzgrid-textarea]')) {
    const s = g.doc.createElement('style');
    s.setAttribute('data-dzgrid-textarea', '');
    if (g.settings.nonce) s.setAttribute('nonce', g.settings.nonce);
    s.textContent = TEXTAREA_CSS;
    ('head' in root ? root.head : root).append(s);
  }
  f.classList.add('dzg-ta');
  f.setAttribute('enterkeyhint', 'enter');
  /** As tall as its lines (the CSS holds it between the cell and its maximum); upward when the view would cut it. */
  const fit = (): void => {
    f.style.blockSize = '';
    f.style.blockSize = `${f.scrollHeight + f.offsetHeight - f.clientHeight}px`;
    const c = f.parentElement!.getBoundingClientRect();
    const v = g.el.viewport.getBoundingClientRect();
    f.toggleAttribute('data-up', c.top + f.offsetHeight > v.bottom && c.bottom - f.offsetHeight >= v.top);
  };
  f.addEventListener('input', fit);
  return {
    root: f,
    focus: f,
    input: () => ({ text: f.value }),
    ready() {
      f.setSelectionRange(f.value.length, f.value.length);
      fit();
    },
    keys(e) {
      const v = f.value;
      const at = f.selectionDirection === 'backward' ? f.selectionStart : f.selectionEnd;
      // Home, End (Ctrl/Cmd: the text's), PageUp, PageDown: the caret moved here — a Mac's browser would scroll the grid
      // under the field instead (Shift keeps the selection's other end).
      const to = { Home: v.lastIndexOf('\n', at - 1) + 1, End: (v.indexOf('\n', at) + 1 || v.length + 1) - 1, PageUp: 0, PageDown: v.length }[e.key];
      if (to !== undefined && !e.altKey) {
        const x = e.ctrlKey || e.metaKey ? (e.key === 'Home' ? 0 : e.key === 'End' ? v.length : to) : to;
        const from = f.selectionDirection === 'backward' ? f.selectionEnd : f.selectionStart;
        e.shiftKey ? f.setSelectionRange(Math.min(from, x), Math.max(from, x), x < from ? 'backward' : 'forward') : f.setSelectionRange(x, x);
        return true;
      }
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return false;
      f.setRangeText('\n', f.selectionStart, f.selectionEnd, 'end');
      fit();
      return true;
    },
    place: fit,
    drop() {},
  };
}
