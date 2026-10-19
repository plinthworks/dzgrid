import { el, tx } from './dom.js';

/** A loader: each module fetched once; `done` gives one that came, at once. */
export interface Once<K, M> {
  load(k: K): Promise<M>;
  done(k: K): M | undefined;
}

/**
 * The filters' lazy chunks (step 14's date kits, step 15's set list), each imported once: a
 * module that loaded is kept, so a later popup draws at once; one that failed is forgotten, so
 * Retry imports it again. A module `ok` refuses is a failure (`filters: no <what><k>`).
 */
export function once<K, M>(get: (k: K) => Promise<M>, ok: (m: M) => unknown, what: string): Once<K, M> {
  const asked = new Map<K, Promise<M>>();
  const done = new Map<K, M>();
  return {
    done: (k) => done.get(k),
    load(k) {
      let p = asked.get(k);
      if (!p) {
        asked.set(k, (p = new Promise<M>((res) => res(get(k))).then((m) => {
          if (!ok(m)) throw new TypeError(`filters: no ${what}${k}`);
          done.set(k, m);
          return m;
        })));
        p.catch(() => asked.delete(k));
      }
      return p;
    },
  };
}

/** The loading line or the failure with its Retry, one at a time, at the end of a box. */
export interface Notice {
  say(what: 'load' | 'fail'): void;
  /** Rewrites the texts (a locale change). */
  words(): void;
  /** Both gone, `aria-busy` off. */
  stop(): void;
}

/**
 * `<p role="status">` while something loads (`aria-busy` on `busy`), `<p role="alert">` and a
 * Retry button when it failed; `text` gives the line for each, `retry` the button's.
 */
export function notice(doc: Document, box: HTMLElement, again: () => void, text: (what: string) => string, retry: () => string, busy: HTMLElement = box): Notice {
  const note = el(doc, 'p');
  const b = el(doc, 'button', 'dzg-fretry');
  b.type = 'button';
  b.addEventListener('click', again);
  let said = '';
  const words = (): void => {
    if (said) tx(note, text(said));
    tx(b, retry());
  };
  return {
    say(what) {
      said = what;
      note.className = 'dzg-f' + what;
      note.setAttribute('role', what === 'load' ? 'status' : 'alert');
      if (what === 'load') busy.setAttribute('aria-busy', 'true');
      else busy.removeAttribute('aria-busy');
      words();
      box.append(note, ...(what === 'fail' ? [b] : []));
      if (what === 'load') b.remove();
    },
    words,
    stop() {
      said = '';
      note.remove();
      b.remove();
      busy.removeAttribute('aria-busy');
    },
  };
}
