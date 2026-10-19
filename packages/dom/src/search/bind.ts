import type { GridContext } from '../context.js';

/** A bound field's unbind: listeners off, the waiting edit dropped, our attributes given back (once). */
export type Off = () => void;

/** Set on the field only when absent, given back at unbind (and `aria-controls`, same root only). */
const ATTRS = { dir: 'auto', autocomplete: 'off', enterkeyhint: 'search', spellcheck: 'false' };
let ids = 0;

/**
 * Binds a host's field to the grid's search (docs/behaviors/quick-search-box.md): the text trimmed,
 * after a pause; Enter and leaving apply at once; Escape empties; ArrowDown goes to the grid;
 * nothing inside an input method. `boxes`: the feature's bound fields (a field bound again is
 * unbound first); the warm-up is wanted while there is one. Returns the unbind.
 */
export function bindBox(g: GridContext<unknown>, input: HTMLInputElement, o: { readonly debounceMs?: number } | undefined, boxes: Map<HTMLInputElement, Off>): Off {
  boxes.get(input)?.();
  const ms = o?.debounceMs;
  const server = g.rows.ops.quick === 'server';
  const wait = Number.isFinite(ms) && ms! >= 0 ? ms! : server ? 300 : 150;
  /** The text this field last sent or was given: its own search coming back leaves it alone. */
  let sent = '';
  let composing = false;
  let cancel: (() => void) | null = null;
  const stop = (): void => {
    cancel?.();
    cancel = null;
  };
  const apply = (): void => {
    stop();
    if (composing) return;
    sent = input.value.trim();
    if (sent !== g.kernel.query.quick) g.kernel.dispatch({ type: 'quick.set', text: sent }, 'user');
  };
  // The first focus of a bound field prepares the search (a server's needs nothing).
  const focused = (): void => {
    const w = g.warm;
    if (!w.want && !server) (w.want = true), w.warm();
  };
  const later = (): void => {
    stop();
    if (wait) cancel = g.scope.timeout(apply, wait);
    else apply();
  };
  // The listeners, named by their events.
  const on: Record<string, (e: never) => void> = {
    input: (e: InputEvent) => e.isComposing || later(),
    compositionstart: () => (composing = true),
    // The composition's text waits for the pause.
    compositionend: () => ((composing = false), later()),
    // Only an edit waiting for its pause: a field left alone (another one typed in) sends nothing.
    blur: () => cancel && apply(),
    focus: focused,
    keydown(k: KeyboardEvent) {
      // Safari reports the composition's last Enter after its end, as key code 229.
      if (k.isComposing || k.keyCode === 229) return;
      if (k.key === 'Enter') k.preventDefault(), apply();
      else if (k.key === 'Escape' && input.value) k.preventDefault(), k.stopPropagation(), (input.value = ''), apply();
      else if (k.key === 'ArrowDown' && !(k.altKey || k.ctrlKey || k.metaKey || k.shiftKey)) k.preventDefault(), g.restoreFocus();
    },
  };
  for (const t in on) input.addEventListener(t, on[t] as EventListener);
  const grid = g.el.viewport;
  /** The attributes we set (absent before). */
  const set = Object.entries({ ...ATTRS, ...(input.getRootNode() === grid.getRootNode() && { 'aria-controls': (grid.id ||= `dzg-${++ids}`) }) }).filter(([n]) => !input.hasAttribute(n));
  for (const [n, v] of set) input.setAttribute(n, v);
  // The grid wins (a clear-all, a host, another field): the field shows its search, unless it is
  // the text it sent (the caret and spaces kept) or an input method is composing in it.
  const heard = g.kernel.subscribe((e) => {
    if (e.type === 'quickChanged' && e.text !== sent && !composing) stop(), (input.value = sent = e.text);
  });
  // Only while it is the field's binding: an older unbind, or one called again, does nothing.
  const off: Off = () => {
    if (boxes.get(input) !== off) return;
    boxes.delete(input);
    stop();
    heard();
    for (const t in on) input.removeEventListener(t, on[t] as EventListener);
    for (const [n] of set) input.removeAttribute(n);
    if (!boxes.size) g.warm.want = false;
  };
  boxes.set(input, off);
  // The grid's search wins; a field restored by the browser applies its text, silently.
  const q = g.kernel.query.quick;
  if (q) input.value = sent = q;
  else if ((sent = input.value.trim())) g.kernel.dispatch({ type: 'quick.set', text: sent }, 'api');
  if (input.matches(':focus')) focused();
  return off;
}
