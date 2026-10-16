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
  #generation = 0;
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

  /**
   * One failing job does not cost the others their frame: every job runs, and
   * the first error is thrown once the batch is done. A write that cancels
   * stops the rest of the batch (the grid is being destroyed).
   */
  flush(): void {
    this.#frame = 0;
    const jobs = this.#jobs.splice(0);
    const generation = ++this.#generation;
    this.#flushing = true;
    let error: { e: unknown } | null = null;
    try {
      const values = jobs.map((j) => {
        try {
          return { ok: true as const, v: j.read() };
        } catch (e) {
          error ??= { e };
          return { ok: false as const };
        }
      });
      for (let i = 0; i < jobs.length && generation === this.#generation; i++) {
        const r = values[i]!;
        if (!r.ok) continue;
        try {
          jobs[i]!.write(r.v);
        } catch (e) {
          error ??= { e };
        }
      }
    } finally {
      this.#flushing = false;
    }
    if (this.#jobs.length && (this.#sync || !this.#win)) {
      try {
        this.flush();
      } catch (e) {
        error ??= { e };
      }
    }
    if (error) throw error.e;
  }

  cancel(): void {
    if (this.#frame && this.#win) this.#win.cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#jobs = [];
    this.#generation++;
  }
}
