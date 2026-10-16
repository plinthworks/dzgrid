/**
 * Everything a grid sets up and must take down: listeners, timers, observers.
 * `dispose()` releases them all, once, in reverse order — so `destroy()`
 * cannot forget one as features add theirs. Taken from DzCalendar.
 */
export class Scope {
  readonly #cleanups: (() => void)[] = [];
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

  timeout(fn: () => void, ms: number): void {
    const id = setTimeout(fn, ms);
    this.add(() => clearTimeout(id));
  }

  add(cleanup: () => void): void {
    if (this.#disposed) cleanup();
    else this.#cleanups.push(cleanup);
  }

  get listenerCount(): number {
    return this.#listeners;
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  dispose(): void {
    this.#disposed = true;
    for (const fn of this.#cleanups.splice(0).reverse()) {
      try {
        fn();
      } catch (err) {
        // One failing cleanup must not keep the others: report it out of band.
        void Promise.reject(err);
      }
    }
  }
}
