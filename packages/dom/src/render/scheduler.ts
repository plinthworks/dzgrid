/**
 * Reads before writes, once per frame (D7): a measurement never runs in the
 * middle of DOM writes, so a frame forces at most one layout. A job scheduled
 * while flushing waits for the next frame. Tests use `sync: true`. Taken from
 * DzCalendar.
 */
export interface Job<T> {
  read(): T;
  write(value: T): void;
}

export class FrameScheduler {
  #jobs: Job<unknown>[] = [];
  #frame = 0;
  #flushing = false;
  readonly #win: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> | null;
  readonly #sync: boolean;

  constructor(win: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> | null, sync = false) {
    this.#win = win;
    this.#sync = sync;
  }

  schedule<T>(job: Job<T>): void {
    this.#jobs.push(job as Job<unknown>);
    if ((this.#sync || !this.#win) && !this.#flushing) return this.flush();
    if (!this.#frame && this.#win) this.#frame = this.#win.requestAnimationFrame(() => this.flush());
  }

  flush(): void {
    this.#frame = 0;
    const jobs = this.#jobs.splice(0);
    this.#flushing = true;
    try {
      const values = jobs.map((j) => j.read());
      jobs.forEach((j, i) => j.write(values[i]));
    } finally {
      this.#flushing = false;
    }
    if (this.#jobs.length && (this.#sync || !this.#win)) this.flush();
  }

  cancel(): void {
    if (this.#frame && this.#win) this.#win.cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#jobs = [];
  }
}
