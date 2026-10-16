/**
 * Everything a grid sets up and must take down: listeners, timers, observers.
 * `dispose()` releases them all, once, in reverse order — so `destroy()`
 * cannot forget one as features add theirs. Taken from DzCalendar.
 */
export class Scope {
  readonly #cleanups = new Set<() => void>();
  #listeners = 0;
  #disposed = false;

  on<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    if (this.#disposed) return;
    target.addEventListener(type, fn, opts);
    this.#listeners++;
    this.add(() => {
      target.removeEventListener(type, fn, opts);
      this.#listeners--;
    });
  }

  observe(o: { disconnect(): void }): void {
    this.add(() => o.disconnect());
  }

  /** A timer, cleared on dispose; returns its cancel. A timer that fired lets go of its cleanup. */
  timeout(fn: () => void, ms: number): () => void {
    if (this.#disposed) return () => {};
    const cancel = (): void => {
      clearTimeout(id);
      this.#cleanups.delete(cancel);
    };
    const id = setTimeout(() => {
      this.#cleanups.delete(cancel);
      fn();
    }, ms);
    this.#cleanups.add(cancel);
    return cancel;
  }

  /** Returns a remover: something stopped early lets go of its cleanup (and what it holds). */
  add(cleanup: () => void): () => void {
    if (this.#disposed) {
      cleanup();
      return () => {};
    }
    this.#cleanups.add(cleanup);
    return () => void this.#cleanups.delete(cleanup);
  }

  /** Cleanups still held: listeners, observers, timers not yet fired. */
  get pending(): number {
    return this.#cleanups.size;
  }

  get listenerCount(): number {
    return this.#listeners;
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  dispose(): void {
    this.#disposed = true;
    const all = [...this.#cleanups].reverse();
    this.#cleanups.clear();
    for (const fn of all) {
      try {
        fn();
      } catch (err) {
        // One failing cleanup must not keep the others: report it out of band.
        void Promise.reject(err);
      }
    }
  }
}
