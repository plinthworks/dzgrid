/** A loader: each module fetched once; `done` gives one that came, at once. */
export interface Once<K, M> {
  load(k: K): Promise<M>;
  done(k: K): M | undefined;
}

/**
 * The lazy chunks of the features (the filters' date kits, step 14, and set list, step 15; the editors'
 * calendar, Phase 5 step 6), each imported once: a module that loaded is kept, so a later popup draws at
 * once; one that failed is forgotten, so Retry imports it again. A module `ok` refuses is a failure
 * (`<who>: no <what><k>`). Moved here from `filters/lazy.ts` at Phase 5 step 6 (owner S6-O6: shared, not copied).
 */
export function once<K, M>(get: (k: K) => Promise<M>, ok: (m: M) => unknown, what: string, who = 'filters'): Once<K, M> {
  const asked = new Map<K, Promise<M>>();
  const done = new Map<K, M>();
  return {
    done: (k) => done.get(k),
    load(k) {
      let p = asked.get(k);
      if (!p) {
        asked.set(k, (p = new Promise<M>((res) => res(get(k))).then((m) => {
          if (!ok(m)) throw new TypeError(`${who}: no ${what}${k}`);
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
  const note = doc.createElement('p');
  const b = doc.createElement('button');
  b.className = 'dzg-fretry';
  b.type = 'button';
  b.addEventListener('click', again);
  let said = '';
  // A text written only when it changes: a paint that changes nothing touches nothing.
  const tx = (e: Node, v: string): void => void (e.textContent !== v && (e.textContent = v));
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
