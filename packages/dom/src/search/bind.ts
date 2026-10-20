import { composing as ime } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';

/** A bound field's unbind: listeners off, the waiting edit dropped, our attributes given back (once). */
export type Off = () => void;

type G = GridContext<unknown>;
/** Set on the field only when absent, given back only while still ours (a host's change survives). */
const ATTRS = { dir: 'auto', autocomplete: 'off', enterkeyhint: 'search', spellcheck: 'false' };
let ids = 0;
/** Per field: its bindings by grid (the last one last), and the attributes we set on it, with their values. */
const fields = new WeakMap<HTMLInputElement, { on: Map<G, Off>; mine: Map<string, string> }>();

/**
 * Our attributes as the field's bindings want them: none once the last one is gone; while bound, ours
 * plus `aria-controls` naming the last grid bound (in the field's document or shadow root). What we
 * set and is no longer wanted is given back; what is absent is set.
 */
function mark(input: HTMLInputElement, f: { on: Map<G, Off>; mine: Map<string, string> }): void {
  const v = [...f.on.keys()].pop()?.el.viewport;
  const want: Record<string, string> = v ? { ...ATTRS, ...(input.getRootNode() === v.getRootNode() && { 'aria-controls': (v.id ||= `dzg-${++ids}`) }) } : {};
  for (const [n, x] of f.mine) if (want[n] !== x) f.mine.delete(n), input.getAttribute(n) === x && input.removeAttribute(n);
  for (const n in want) input.hasAttribute(n) || (input.setAttribute(n, want[n]!), f.mine.set(n, want[n]!));
}

/**
 * Binds a host's field to the grid's search (docs/behaviors/quick-search-box.md): the text trimmed,
 * after a pause; Enter and leaving apply at once; Escape empties; ArrowDown goes to the grid;
 * nothing inside an input method; a host's open combobox keeps Enter and ArrowDown. The field
 * bound again to the same grid is unbound first; the grid's end unbinds it. `offs`: the bind's
 * unbinds, one per grid, each leaving it at its end. Returns the unbind.
 */
export function bindBox(g: G, input: HTMLInputElement, o: { readonly debounceMs?: number } | undefined, offs: Set<Off>): Off {
  let f = fields.get(input);
  if (!f) fields.set(input, (f = { on: new Map(), mine: new Map() }));
  const bound = f.on;
  bound.get(g)?.();
  const ms = o?.debounceMs;
  const k = g.kernel;
  const wait = Number.isFinite(ms) && ms! >= 0 ? ms! : g.rows.ops.quick === 'server' ? 300 : 150;
  /** The text this field last sent or was given: its own search coming back leaves it alone. */
  let sent = '';
  let composing = false;
  let cancel: (() => void) | null = null;
  /** The warm-up held while bound, asked for at a focus. */
  const release = g.warm.hold();
  const stop = (): void => {
    cancel?.();
    cancel = null;
  };
  /** Sends the field's text, trimmed, unless the grid searches it already. */
  const send = (source: 'user' | 'api'): unknown => (sent = input.value.trim()) !== k.query.quick && k.dispatch({ type: 'quick.set', text: sent }, source);
  const apply = (): void => {
    stop();
    composing || send('user');
  };
  const later = (): void => {
    stop();
    if (wait) cancel = g.scope.timeout(apply, wait);
    else apply();
  };
  // The listeners, named by their events.
  const ev: Record<string, (e: never) => void> = {
    input: (e: InputEvent) => e.isComposing || later(),
    compositionstart: () => (composing = true),
    // The composition's text waits for the pause.
    compositionend: () => ((composing = false), later()),
    // Only an edit waiting for its pause: a field left alone (another one typed in) sends nothing.
    // Leaving ends a composition whose end may never come (its text waits for the next edit).
    blur: () => (composing ? (composing = false) : cancel && apply()),
    focus: () => g.warm.want(),
    keydown(k: KeyboardEvent) {
      // Safari reports the composition's last Enter after its end, as key code 229.
      if (ime(k)) return;
      // A host's combobox with its list open (or an option active) keeps Enter and ArrowDown.
      const host = input.matches('[aria-expanded=true],[aria-activedescendant]');
      if (k.key === 'Enter') host || (k.preventDefault(), apply());
      // The page hears the emptied field (its own input event comes first, then applies at once).
      else if (k.key === 'Escape' && input.value) k.preventDefault(), k.stopPropagation(), (input.value = ''), input.dispatchEvent(new Event('input', { bubbles: true })), apply();
      else if (k.key === 'ArrowDown' && !(k.altKey || k.ctrlKey || k.metaKey || k.shiftKey || host || input.list)) k.preventDefault(), g.restoreFocus();
    },
  };
  for (const t in ev) input.addEventListener(t, ev[t] as EventListener);
  // The grid wins (a clear-all, a host, another field): the field shows its search, unless it is
  // the text it sent (the caret and spaces kept) or an input method is composing in it.
  const heard = k.subscribe((e) => {
    if (e.type === 'quickChanged' && e.text !== sent && !composing) stop(), (input.value = sent = e.text);
  });
  // Only while it is the field's binding: an older unbind, or one called again, does nothing.
  const off: Off = () => {
    if (bound.get(g) !== off) return;
    bound.delete(g);
    offs.delete(off);
    drop();
    stop();
    heard();
    release();
    for (const t in ev) input.removeEventListener(t, ev[t] as EventListener);
    mark(input, f);
  };
  const drop = g.scope.add(off);
  bound.set(g, off);
  offs.add(off);
  mark(input, f);
  // The grid's search wins; a field restored by the browser applies its text, silently.
  const q = k.query.quick;
  q ? (input.value = sent = q) : send('api');
  if (input.matches(':focus')) g.warm.want();
  return off;
}
